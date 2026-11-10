import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Data, type UTxO } from "@lucid-evolution/lucid";
import {
  KYC_MIN_LOVELACE,
  expectRejected,
  genesis,
  m1Ledger,
  m1TestConfig,
  scriptTime,
  selectActor,
  submitTx,
  type Genesis,
  type M1Ledger,
} from "./helpers/m1";
import {
  ISSUE,
  RENEW,
  issueKyc,
  kycDatum,
  kycTerms,
  kycRedeemer,
  kycUnit,
  renewKyc,
  revokeKyc,
} from "./helpers/kyc";

const config = m1TestConfig();

describe("KYC attestation validator", () => {
  let ledger: M1Ledger;
  let m1: Genesis;

  beforeAll(async () => {
    ledger = await m1Ledger();
    m1 = await genesis(ledger, config);
  });

  // The issuer pays for and signs every KYC action.
  beforeEach(() => selectActor(ledger, "kycIssuer"));

  const expiry = (ms: number) =>
    BigInt(scriptTime(ledger, ledger.emulator.now())) + BigInt(ms);

  const kycBoxes = async (memberId: string) =>
    (await ledger.lucid.utxosAt(m1.kycAddress)).filter(
      (utxo) => utxo.assets[kycUnit(m1.kycPolicy, memberId)] === 1n,
    );

  const decode = (box: UTxO) =>
    Data.from(box.datum!) as { index: number; fields: unknown[] };

  test("issue creates one box holding one attestation", async () => {
    const member = "01";
    const terms = kycTerms(member, expiry(60_000));
    const issuedAt = BigInt(scriptTime(ledger, ledger.emulator.now()));
    const issued = await issueKyc(ledger, m1, terms);
    const boxes = await kycBoxes(member);

    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.txHash).toBe(issued.txHash);
    expect(boxes[0]!.assets).toEqual({
      lovelace: KYC_MIN_LOVELACE,
      [kycUnit(m1.kycPolicy, member)]: 1n,
    });

    const datum = decode(boxes[0]!);
    expect(datum.index).toBe(0);
    expect(datum.fields).toHaveLength(6);
    expect(datum.fields[0]).toBe(ledger.roles.kycIssuer);
    expect(datum.fields[1]).toBe(member);
    expect(datum.fields[2]).toBe("aabbcc");
    expect(datum.fields[3]).toBe(1n);
    expect(datum.fields[4]).toBe(issuedAt);
    expect(datum.fields[5]).toBe(terms.expiresAt);
  });

  test("renew keeps the member id and extends the expiry", async () => {
    const member = "02";
    const firstTerms = kycTerms(member, expiry(60_000));
    const first = await issueKyc(ledger, m1, firstTerms);
    const renewedTerms = kycTerms(member, expiry(120_000), 2n);
    const second = await renewKyc(ledger, m1, first, renewedTerms);

    expect(second.txHash).not.toBe(first.txHash);
    const boxes = await kycBoxes(member);
    expect(boxes).toHaveLength(1);
    const datum = decode(boxes[0]!);
    expect(datum.fields[1]).toBe(member);
    expect(datum.fields[3]).toBe(2n);
    expect(datum.fields[5]).toBe(renewedTerms.expiresAt);
  });

  test("revoke removes the attestation", async () => {
    const member = "03";
    const issued = await issueKyc(ledger, m1, kycTerms(member, expiry(60_000)));
    await revokeKyc(ledger, m1, issued, member);

    expect(await kycBoxes(member)).toHaveLength(0);
  });

  test("a non-issuer cannot issue", async () => {
    selectActor(ledger, "deployer");

    const failure = await expectRejected(() =>
      issueKyc(ledger, m1, kycTerms("04", expiry(60_000))),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a non-issuer cannot revoke", async () => {
    const member = "05";
    const issued = await issueKyc(ledger, m1, kycTerms(member, expiry(60_000)));
    selectActor(ledger, "deployer");

    const failure = await expectRejected(() =>
      revokeKyc(ledger, m1, issued, member),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("renew cannot change the member id", async () => {
    const member = "06";
    const terms = kycTerms(member, expiry(60_000));
    const issued = await issueKyc(ledger, m1, terms);
    const unit = kycUnit(m1.kycPolicy, member);
    const now = scriptTime(ledger, ledger.emulator.now());

    const failure = await expectRejected(async () => {
      const tx = await ledger.lucid
        .newTx()
        .addSigner(await ledger.lucid.wallet().address())
        .readFrom([m1.configUtxo])
        .collectFrom([issued], kycRedeemer(RENEW))
        .attach.SpendingValidator(m1.kycValidator)
        .validFrom(now)
        .pay.ToContract(
          m1.kycAddress,
          {
            kind: "inline",
            value: kycDatum(
              ledger.roles.kycIssuer,
              kycTerms("07", expiry(120_000)),
              BigInt(now),
            ),
          },
          { lovelace: KYC_MIN_LOVELACE, [unit]: 1n },
        )
        .complete();
      await submitTx(tx);
    });

    expect(String(failure)).toContain("failed script execution");
  });

  test("issue without the config reference is rejected", async () => {
    const member = "08";
    const unit = kycUnit(m1.kycPolicy, member);
    const now = scriptTime(ledger, ledger.emulator.now());

    const failure = await expectRejected(async () => {
      const tx = await ledger.lucid
        .newTx()
        .addSigner(await ledger.lucid.wallet().address())
        .attach.MintingPolicy(m1.kycValidator)
        .validFrom(now)
        .mintAssets({ [unit]: 1n }, kycRedeemer(ISSUE))
        .pay.ToContract(
          m1.kycAddress,
          {
            kind: "inline",
            value: kycDatum(
              ledger.roles.kycIssuer,
              kycTerms(member, expiry(60_000)),
              BigInt(now),
            ),
          },
          { lovelace: KYC_MIN_LOVELACE, [unit]: 1n },
        )
        .complete();
      await submitTx(tx);
    });

    expect(String(failure)).toContain("failed script execution");
  });

  test("spending with the issue redeemer is rejected", async () => {
    const member = "09";
    const issued = await issueKyc(ledger, m1, kycTerms(member, expiry(60_000)));

    const failure = await expectRejected(async () => {
      const tx = await ledger.lucid
        .newTx()
        .addSigner(await ledger.lucid.wallet().address())
        .readFrom([m1.configUtxo])
        .collectFrom([issued], kycRedeemer(ISSUE))
        .attach.SpendingValidator(m1.kycValidator)
        .complete();
      await submitTx(tx);
    });

    expect(String(failure)).toContain("failed script execution");
  });

  test("minting with the renew redeemer is rejected", async () => {
    const member = "0a";
    const unit = kycUnit(m1.kycPolicy, member);
    const now = scriptTime(ledger, ledger.emulator.now());

    const failure = await expectRejected(async () => {
      const tx = await ledger.lucid
        .newTx()
        .addSigner(await ledger.lucid.wallet().address())
        .readFrom([m1.configUtxo])
        .attach.MintingPolicy(m1.kycValidator)
        .validFrom(now)
        .mintAssets({ [unit]: 1n }, kycRedeemer(RENEW))
        .pay.ToContract(
          m1.kycAddress,
          {
            kind: "inline",
            value: kycDatum(
              ledger.roles.kycIssuer,
              kycTerms(member, expiry(60_000)),
              BigInt(now),
            ),
          },
          { lovelace: KYC_MIN_LOVELACE, [unit]: 1n },
        )
        .complete();
      await submitTx(tx);
    });

    expect(String(failure)).toContain("failed script execution");
  });
});
