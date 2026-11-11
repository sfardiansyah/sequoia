import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Data, type UTxO } from "@lucid-evolution/lucid";
import {
  CONFIG_MIN_LOVELACE,
  MEMBER_MIN_LOVELACE,
  expectRejected,
  genesis,
  keyHash,
  m1Ledger,
  m1TestConfig,
  membershipRedeemer,
  scriptTime,
  selectActor,
  stateUnit,
  submitTx,
  type Genesis,
  type M1Ledger,
} from "./helpers/m1";
import { issueKyc, kycTerms, revokeKyc } from "./helpers/kyc";
import { bankTerms, bankUnit, issueBankProof } from "./helpers/bank";
import {
  CONTRIBUTION_MEMBER_CAPITAL,
  CONTRIBUTION_PARTICIPATION,
  TRANSFER,
  contributeMember,
  joinMember,
  memberUnit,
} from "./helpers/membership";

const config = m1TestConfig();
const MEMBER_CAPITAL_UNIT = Buffer.from("MCAP").toString("hex");
const CAPITAL_PARTICIPATION_UNIT = Buffer.from("PROJ").toString("hex");

/**
 * One ledger for the whole M1 slice (ADR 0008 §11): genesis, KYC, bank proof,
 * join, contribution, and the negative cases. Focused suites in the other files
 * stay; this one proves the slice end to end.
 */
describe("M1 end to end", () => {
  let ledger: M1Ledger;
  let m1: Genesis;

  beforeAll(async () => {
    ledger = await m1Ledger();
    m1 = await genesis(ledger, config);
  });

  beforeEach(() => selectActor(ledger, "kycIssuer"));

  const expiry = (ms: number) =>
    BigInt(scriptTime(ledger, ledger.emulator.now())) + BigInt(ms);

  const decode = (box: UTxO) =>
    Data.from(box.datum!) as { index: number; fields: unknown[] };

  const constr = (value: unknown) =>
    value as { index: number; fields: unknown[] };

  const memberBoxes = async (memberId: string) =>
    (await ledger.lucid.utxosAt(m1.membershipAddress)).filter(
      (utxo) => utxo.assets[memberUnit(m1.membershipPolicy, memberId)] === 1n,
    );

  const contributedAssets = (memberId: string) => ({
    lovelace: MEMBER_MIN_LOVELACE,
    [memberUnit(m1.membershipPolicy, memberId)]: 1n,
    [m1.membershipPolicy + MEMBER_CAPITAL_UNIT]: CONTRIBUTION_MEMBER_CAPITAL,
    [m1.membershipPolicy + CAPITAL_PARTICIPATION_UNIT]:
      CONTRIBUTION_PARTICIPATION,
  });

  const proofBoxes = async (nonce: string) =>
    (await ledger.lucid.utxosAt(m1.bankAddress)).filter(
      (utxo) => utxo.assets[bankUnit(m1.membershipPolicy, nonce)] === 1n,
    );

  async function kycFor(memberId: string, kycMs = 600_000) {
    selectActor(ledger, "kycIssuer");
    return issueKyc(ledger, m1, kycTerms(memberId, expiry(kycMs)));
  }

  async function proofFor(memberId: string, nonce: string) {
    selectActor(ledger, "bankIssuer");
    return issueBankProof(ledger, m1, bankTerms(memberId, nonce));
  }

  async function joinedMember(memberId: string, founder = false) {
    const kyc = await kycFor(memberId);
    selectActor(ledger, "member");
    const box = await joinMember(
      ledger,
      m1,
      { memberId, class: founder ? "Founder" : "Standard" },
      kyc,
    );
    return { kyc, box };
  }

  test("genesis → KYC → bank proof → join → contribute", async () => {
    const standard = "41";
    const founder = "42";
    const standardKyc = await kycFor(standard);
    const founderKyc = await kycFor(founder);
    const standardProof = await proofFor(standard, "2a01");
    const founderProof = await proofFor(founder, "2a02");

    selectActor(ledger, "member");
    const standardBox = await joinMember(
      ledger,
      m1,
      { memberId: standard },
      standardKyc,
    );
    const founderBox = await joinMember(
      ledger,
      m1,
      { memberId: founder, class: "Founder" },
      founderKyc,
    );

    expect(standardBox.assets).toEqual({
      lovelace: MEMBER_MIN_LOVELACE,
      [memberUnit(m1.membershipPolicy, standard)]: 1n,
    });
    expect(constr(decode(founderBox).fields[2])).toEqual({
      index: 1,
      fields: [],
    });

    const standardAfter = await contributeMember(
      ledger,
      m1,
      standardBox,
      standardProof,
      standardKyc,
      standard,
    );
    const founderAfter = await contributeMember(
      ledger,
      m1,
      founderBox,
      founderProof,
      founderKyc,
      founder,
    );

    expect(standardAfter.assets).toEqual(contributedAssets(standard));
    expect(founderAfter.assets).toEqual(contributedAssets(founder));
    expect(decode(standardAfter).fields[0]).toBe(
      keyHash(ledger.actors.member.address),
    );
    expect(decode(standardAfter).fields[1]).toBe(standard);
    expect(constr(decode(standardAfter).fields[3])).toEqual({
      index: 0,
      fields: [],
    });
    expect(constr(decode(standardAfter).fields[5])).toEqual({
      index: 0,
      fields: [2026n],
    });
    expect(constr(decode(founderAfter).fields[2])).toEqual({
      index: 1,
      fields: [],
    });
    expect(constr(decode(founderAfter).fields[5])).toEqual({
      index: 0,
      fields: [2026n],
    });

    expect(await memberBoxes(standard)).toHaveLength(1);
    expect(await memberBoxes(founder)).toHaveLength(1);
    expect(await proofBoxes("2a01")).toHaveLength(0);
    expect(await proofBoxes("2a02")).toHaveLength(0);

    const configBoxes = await ledger.lucid.utxosAt(m1.configAddress);
    expect(configBoxes).toHaveLength(1);
    expect(configBoxes[0]!.assets).toEqual({
      lovelace: CONFIG_MIN_LOVELACE,
      [stateUnit(m1.stateNftPolicy)]: 1n,
    });
    expect(configBoxes[0]!.datum?.replace(/^0x/, "")).toBe(m1.datum);
  });

  test("a non-board signer cannot join", async () => {
    const memberId = "43";
    const kyc = await kycFor(memberId);
    selectActor(ledger, "member");

    const failure = await expectRejected(() =>
      joinMember(ledger, m1, { memberId }, kyc, 1),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a join with expired KYC fails", async () => {
    const memberId = "44";
    const kyc = await kycFor(memberId, 10_000);
    selectActor(ledger, "member");

    const failure = await expectRejected(() =>
      joinMember(ledger, m1, { memberId }, kyc),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a join with revoked KYC fails", async () => {
    const memberId = "45";
    const kyc = await kycFor(memberId);
    selectActor(ledger, "kycIssuer");
    await revokeKyc(ledger, m1, kyc, memberId);
    selectActor(ledger, "member");

    const failure = await expectRejected(() =>
      joinMember(ledger, m1, { memberId }, kyc),
    );

    expect(failure).toBeInstanceOf(Error);
  });

  test("a proof for the wrong year or amount cannot be issued", async () => {
    selectActor(ledger, "bankIssuer");

    const wrongYear = await expectRejected(() =>
      issueBankProof(ledger, m1, bankTerms("46", "2a03", 2025n)),
    );
    const wrongAmount = await expectRejected(() =>
      issueBankProof(ledger, m1, bankTerms("47", "2a04", 2026n, 999_999n)),
    );

    expect(String(wrongYear)).toContain("failed script execution");
    expect(String(wrongAmount)).toContain("failed script execution");
  });

  test("a spent proof cannot be reused", async () => {
    const memberId = "48";
    const { kyc, box } = await joinedMember(memberId);
    const proof = await proofFor(memberId, "2a05");
    selectActor(ledger, "member");
    const contributed = await contributeMember(
      ledger,
      m1,
      box,
      proof,
      kyc,
      memberId,
    );

    const failure = await expectRejected(() =>
      contributeMember(ledger, m1, contributed, proof, kyc, memberId),
    );

    expect(failure).toBeInstanceOf(Error);
  });

  test("a second contribution in the same year fails", async () => {
    const memberId = "49";
    const { kyc, box } = await joinedMember(memberId);
    const firstProof = await proofFor(memberId, "2a06");
    const secondProof = await proofFor(memberId, "2a07");
    selectActor(ledger, "member");
    const contributed = await contributeMember(
      ledger,
      m1,
      box,
      firstProof,
      kyc,
      memberId,
    );

    const failure = await expectRejected(() =>
      contributeMember(ledger, m1, contributed, secondProof, kyc, memberId),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("sending MEMBER to a wallet fails", async () => {
    const memberId = "4a";
    const { box } = await joinedMember(memberId);
    selectActor(ledger, "member");

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
});
