import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Data, type UTxO } from "@lucid-evolution/lucid";
import {
  expectRejected,
  genesis,
  testLedger,
  testConfig,
  membershipRedeemer,
  scriptTime,
  selectActor,
  submitTx,
  type Genesis,
  type Ledger,
} from "./helpers/harness";
import {
  BANK_MIN_LOVELACE,
  ISSUE_BANK_PROOF,
  bankTerms,
  bankUnit,
  cancelBankProof,
  issueBankProof,
} from "./helpers/bank";

const config = testConfig();

describe("bank proof validator", () => {
  let ledger: Ledger;
  let m1: Genesis;

  beforeAll(async () => {
    ledger = await testLedger();
    m1 = await genesis(ledger, config);
  });

  // The bank issuer pays for and signs every proof action.
  beforeEach(() => selectActor(ledger, "bankIssuer"));

  const proofBoxes = async (nonce: string) =>
    (await ledger.lucid.utxosAt(m1.bankAddress)).filter(
      (utxo) => utxo.assets[bankUnit(m1.membershipPolicy, nonce)] === 1n,
    );

  const decode = (box: UTxO) =>
    Data.from(box.datum!) as { index: number; fields: unknown[] };

  test("issue creates one proof box at the bank script", async () => {
    const terms = bankTerms("01", "0a0b");
    const issuedAt = BigInt(scriptTime(ledger, ledger.emulator.now()));
    const proof = await issueBankProof(ledger, m1, terms);
    const boxes = await proofBoxes(terms.nonce);

    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.txHash).toBe(proof.txHash);
    expect(boxes[0]!.assets).toEqual({
      lovelace: BANK_MIN_LOVELACE,
      [bankUnit(m1.membershipPolicy, terms.nonce)]: 1n,
    });

    const datum = decode(boxes[0]!);
    expect(datum.index).toBe(0);
    expect(datum.fields).toHaveLength(7);
    expect(datum.fields[0]).toBe(ledger.roles.bankIssuer);
    expect(datum.fields[1]).toBe("01");
    expect(datum.fields[2]).toBe(2026n);
    expect(datum.fields[3]).toBe(1_000_000n);
    expect(datum.fields[4]).toBe("cc");
    expect(datum.fields[5]).toBe("0a0b");
    expect(datum.fields[6]).toBe(issuedAt);
  });

  test("cancel burns the proof and removes the box", async () => {
    const terms = bankTerms("02", "0a0c");
    const proof = await issueBankProof(ledger, m1, terms);
    await cancelBankProof(ledger, m1, proof, terms.nonce);

    expect(await proofBoxes(terms.nonce)).toHaveLength(0);
  });

  test("spending the proof without burning is rejected", async () => {
    const terms = bankTerms("03", "0a0d");
    const proof = await issueBankProof(ledger, m1, terms);

    const failure = await expectRejected(async () => {
      const tx = await ledger.lucid
        .newTx()
        .collectFrom([proof], Data.void())
        .attach.SpendingValidator(m1.bankValidator)
        .complete();
      await submitTx(tx);
    });

    expect(String(failure)).toContain("failed script execution");
  });

  test("a non-issuer cannot issue", async () => {
    selectActor(ledger, "deployer");

    const failure = await expectRejected(() =>
      issueBankProof(ledger, m1, bankTerms("04", "0a0e")),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("issuing to a wallet is rejected", async () => {
    const terms = bankTerms("05", "0a0f");
    const unit = bankUnit(m1.membershipPolicy, terms.nonce);
    const now = scriptTime(ledger, ledger.emulator.now());
    const wallet = await ledger.lucid.wallet().address();

    const failure = await expectRejected(async () => {
      const tx = await ledger.lucid
        .newTx()
        .addSigner(wallet)
        .readFrom([m1.configUtxo])
        .attach.MintingPolicy(m1.membershipValidator)
        .validFrom(now)
        .mintAssets({ [unit]: 1n }, membershipRedeemer(ISSUE_BANK_PROOF))
        .pay.ToAddress(wallet, { lovelace: BANK_MIN_LOVELACE, [unit]: 1n })
        .complete();
      await submitTx(tx);
    });

    expect(String(failure)).toContain("failed script execution");
  });

  test("a non-issuer cannot cancel", async () => {
    const terms = bankTerms("06", "0a10");
    const proof = await issueBankProof(ledger, m1, terms);
    selectActor(ledger, "deployer");

    const failure = await expectRejected(() =>
      cancelBankProof(ledger, m1, proof, terms.nonce),
    );

    expect(String(failure)).toContain("failed script execution");
  });
});
