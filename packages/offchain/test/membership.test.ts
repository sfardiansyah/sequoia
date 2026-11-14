import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Data, type UTxO } from "@lucid-evolution/lucid";
import {
  MEMBER_MIN_LOVELACE,
  expectRejected,
  genesis,
  keyHash,
  testLedger,
  testConfig,
  membershipRedeemer,
  scriptTime,
  selectActor,
  submitTx,
  type Genesis,
  type Ledger,
} from "./helpers/harness";
import { issueKyc, kycTerms, revokeKyc } from "./helpers/kyc";
import {
  TRANSFER,
  joinMember,
  memberUnit,
  transferMember,
} from "./helpers/membership";

const config = testConfig();

describe("membership join and non-transferability", () => {
  let ledger: Ledger;
  let m1: Genesis;

  beforeAll(async () => {
    ledger = await testLedger();
    m1 = await genesis(ledger, config);
  });

  beforeEach(() => selectActor(ledger, "kycIssuer"));

  const expiry = (ms: number) =>
    BigInt(scriptTime(ledger, ledger.emulator.now())) + BigInt(ms);

  const memberBoxes = async (memberId: string) =>
    (await ledger.lucid.utxosAt(m1.membershipAddress)).filter(
      (utxo) => utxo.assets[memberUnit(m1.membershipPolicy, memberId)] === 1n,
    );

  const decode = (box: UTxO) =>
    Data.from(box.datum!) as { index: number; fields: unknown[] };

  const constr = (value: unknown) =>
    value as { index: number; fields: unknown[] };

  test("a standard join creates one member box", async () => {
    const memberId = "21";
    const kyc = await issueKyc(ledger, m1, kycTerms(memberId, expiry(120_000)));
    const owner = keyHash(ledger.actors.member.address);
    selectActor(ledger, "member");
    const joinedAt = BigInt(scriptTime(ledger, ledger.emulator.now()));
    const joined = await joinMember(ledger, m1, { memberId }, kyc);
    const boxes = await memberBoxes(memberId);

    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.txHash).toBe(joined.txHash);
    expect(boxes[0]!.assets).toEqual({
      lovelace: MEMBER_MIN_LOVELACE,
      [memberUnit(m1.membershipPolicy, memberId)]: 1n,
    });

    const datum = decode(boxes[0]!);
    expect(datum.index).toBe(0);
    expect(datum.fields).toHaveLength(6);
    expect(datum.fields[0]).toBe(owner);
    expect(datum.fields[1]).toBe(memberId);
    expect(constr(datum.fields[2])).toEqual({ index: 0, fields: [] });
    expect(constr(datum.fields[3])).toEqual({ index: 0, fields: [] });
    expect(datum.fields[4]).toBe(joinedAt);
    expect(constr(datum.fields[5])).toEqual({ index: 1, fields: [] });
  });

  test("a founder join is accepted and labelled", async () => {
    const memberId = "22";
    const kyc = await issueKyc(ledger, m1, kycTerms(memberId, expiry(120_000)));
    selectActor(ledger, "member");
    await joinMember(ledger, m1, { memberId, class: "Founder" }, kyc);

    const boxes = await memberBoxes(memberId);
    expect(boxes).toHaveLength(1);
    expect(constr(decode(boxes[0]!).fields[2])).toEqual({
      index: 1,
      fields: [],
    });
  });

  test("a join with one board signature fails", async () => {
    const memberId = "23";
    const kyc = await issueKyc(ledger, m1, kycTerms(memberId, expiry(120_000)));
    selectActor(ledger, "member");

    const failure = await expectRejected(() =>
      joinMember(ledger, m1, { memberId }, kyc, 1),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a join with expired KYC fails", async () => {
    const memberId = "24";
    const kyc = await issueKyc(ledger, m1, kycTerms(memberId, expiry(10_000)));
    selectActor(ledger, "member");

    const failure = await expectRejected(() =>
      joinMember(ledger, m1, { memberId }, kyc),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a join with revoked KYC fails", async () => {
    const memberId = "25";
    const kyc = await issueKyc(ledger, m1, kycTerms(memberId, expiry(120_000)));
    await revokeKyc(ledger, m1, kyc, memberId);
    selectActor(ledger, "member");

    const failure = await expectRejected(() =>
      joinMember(ledger, m1, { memberId }, kyc),
    );

    expect(failure).toBeInstanceOf(Error);
  });

  test("a join with a KYC member id mismatch fails", async () => {
    const kyc = await issueKyc(ledger, m1, kycTerms("26", expiry(120_000)));
    selectActor(ledger, "member");

    const failure = await expectRejected(() =>
      joinMember(ledger, m1, { memberId: "27" }, kyc),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("sending MEMBER to a wallet fails", async () => {
    const memberId = "28";
    const kyc = await issueKyc(ledger, m1, kycTerms(memberId, expiry(120_000)));
    selectActor(ledger, "member");
    const box = await joinMember(ledger, m1, { memberId }, kyc);

    const failure = await expectRejected(async () => {
      const tx = await ledger.lucid
        .newTx()
        .addSigner(ledger.actors.member.address)
        .collectFrom([box], membershipRedeemer(TRANSFER))
        .attach.SpendingValidator(m1.membershipValidator)
        .pay.ToAddress(ledger.actors.member.address, box.assets)
        .complete();
      await submitTx(tx);
    });

    expect(String(failure)).toContain("failed script execution");
  });

  test("a spend keeps the same owner and tokens", async () => {
    const memberId = "29";
    const kyc = await issueKyc(ledger, m1, kycTerms(memberId, expiry(120_000)));
    selectActor(ledger, "member");
    const box = await joinMember(ledger, m1, { memberId }, kyc);
    const moved = await transferMember(ledger, m1, box, memberId);

    expect(moved.txHash).not.toBe(box.txHash);
    expect(moved.assets).toEqual(box.assets);
    expect(moved.datum).toBe(box.datum);
    expect(decode(moved).fields[0]).toBe(
      keyHash(ledger.actors.member.address),
    );
    expect(await memberBoxes(memberId)).toHaveLength(1);
  });
});
