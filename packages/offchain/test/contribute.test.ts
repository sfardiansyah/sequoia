import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Data, type UTxO } from "@lucid-evolution/lucid";
import {
  MEMBER_MIN_LOVELACE,
  expectRejected,
  genesis,
  keyHash,
  m1Ledger,
  m1TestConfig,
  scriptTime,
  selectActor,
  type Genesis,
  type M1Ledger,
} from "./helpers/m1";
import { issueKyc, kycTerms, revokeKyc } from "./helpers/kyc";
import {
  bankTerms,
  bankUnit,
  issueBankProof,
} from "./helpers/bank";
import {
  CONTRIBUTION_MEMBER_CAPITAL,
  CONTRIBUTION_PARTICIPATION,
  contributeMember,
  joinMember,
  memberUnit,
} from "./helpers/membership";

const config = m1TestConfig();
const MEMBER_CAPITAL_UNIT = Buffer.from("MCAP").toString("hex");
const CAPITAL_PARTICIPATION_UNIT = Buffer.from("PROJ").toString("hex");

describe("membership contribution", () => {
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

  /** Issue KYC, join, and leave the member wallet selected. */
  async function joinedMember(memberId: string, kycMs = 120_000) {
    selectActor(ledger, "kycIssuer");
    const kyc = await issueKyc(ledger, m1, kycTerms(memberId, expiry(kycMs)));
    selectActor(ledger, "member");
    const box = await joinMember(ledger, m1, { memberId }, kyc);
    return { kyc, box };
  }

  async function proofFor(memberId: string, nonce: string) {
    selectActor(ledger, "bankIssuer");
    return issueBankProof(ledger, m1, bankTerms(memberId, nonce));
  }

  test("a matching proof mints the split and updates the year", async () => {
    const memberId = "31";
    const { kyc, box } = await joinedMember(memberId);
    const proof = await proofFor(memberId, "1a01");
    selectActor(ledger, "member");
    const contributed = await contributeMember(
      ledger,
      m1,
      box,
      proof,
      kyc,
      memberId,
    );
    const boxes = await memberBoxes(memberId);
    const owner = keyHash(ledger.actors.member.address);

    expect(boxes).toHaveLength(1);
    expect(contributed.assets).toEqual({
      lovelace: MEMBER_MIN_LOVELACE,
      [memberUnit(m1.membershipPolicy, memberId)]: 1n,
      [m1.membershipPolicy + MEMBER_CAPITAL_UNIT]:
        CONTRIBUTION_MEMBER_CAPITAL,
      [m1.membershipPolicy + CAPITAL_PARTICIPATION_UNIT]:
        CONTRIBUTION_PARTICIPATION,
    });

    const datum = decode(contributed);
    expect(datum.fields[0]).toBe(owner);
    expect(datum.fields[1]).toBe(memberId);
    expect(constr(datum.fields[2])).toEqual({ index: 0, fields: [] });
    expect(constr(datum.fields[3])).toEqual({ index: 0, fields: [] });
    expect(constr(datum.fields[5])).toEqual({
      index: 0,
      fields: [2026n],
    });
    expect(constr(datum.fields[6])).toEqual({ index: 1, fields: [] });

    const proofs = (await ledger.lucid.utxosAt(m1.bankAddress)).filter(
      (utxo) =>
        utxo.assets[bankUnit(m1.membershipPolicy, "1a01")] === 1n,
    );
    expect(proofs).toHaveLength(0);
  });

  test("a second contribution in the same year fails", async () => {
    const memberId = "32";
    const { kyc, box } = await joinedMember(memberId);
    const firstProof = await proofFor(memberId, "1a02");
    const secondProof = await proofFor(memberId, "1a03");
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

  test("a spent proof cannot be reused", async () => {
    const memberId = "33";
    const { kyc, box } = await joinedMember(memberId);
    const proof = await proofFor(memberId, "1a04");
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

  test("a contribution with expired KYC fails", async () => {
    const memberId = "34";
    const { kyc, box } = await joinedMember(memberId, 30_000);
    const proof = await proofFor(memberId, "1a05");
    selectActor(ledger, "member");

    const failure = await expectRejected(() =>
      contributeMember(ledger, m1, box, proof, kyc, memberId),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a contribution with revoked KYC fails", async () => {
    const memberId = "35";
    const { kyc, box } = await joinedMember(memberId);
    selectActor(ledger, "kycIssuer");
    await revokeKyc(ledger, m1, kyc, memberId);
    const proof = await proofFor(memberId, "1a06");
    selectActor(ledger, "member");

    const failure = await expectRejected(() =>
      contributeMember(ledger, m1, box, proof, kyc, memberId),
    );

    expect(failure).toBeInstanceOf(Error);
  });

  test("a proof for the wrong year cannot be issued", async () => {
    selectActor(ledger, "bankIssuer");

    const failure = await expectRejected(() =>
      issueBankProof(ledger, m1, bankTerms("36", "1a07", 2025n)),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a proof for the wrong amount cannot be issued", async () => {
    selectActor(ledger, "bankIssuer");

    const failure = await expectRejected(() =>
      issueBankProof(ledger, m1, bankTerms("37", "1a08", 2026n, 999_999n)),
    );

    expect(String(failure)).toContain("failed script execution");
  });
});
