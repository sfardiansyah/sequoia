import { beforeAll, describe, expect, test } from "bun:test";
import {
  MEMBER_MIN_LOVELACE,
  expectRejected,
  genesis,
  keyHash,
  testLedger,
  testConfig,
  selectActor,
  type Genesis,
  type Ledger,
} from "./helpers/harness";
import { revokeKyc } from "./helpers/kyc";
import { bankTerms, bankUnit, issueBankProof } from "./helpers/bank";
import {
  CAPITAL_PARTICIPATION_ASSET_NAME,
  CONTRIBUTION_MEMBER_CAPITAL,
  CONTRIBUTION_PARTICIPATION,
  MEMBER_CAPITAL_ASSET_NAME,
  asConstr,
  contributeMember,
  decodeDatum,
  joinedMember,
  memberBoxes,
  memberUnit,
  proofFor,
} from "./helpers/membership";

const config = testConfig();

describe("membership contribution", () => {
  let ledger: Ledger;
  let m1: Genesis;

  beforeAll(async () => {
    ledger = await testLedger();
    m1 = await genesis(ledger, config);
  });

  test("a matching proof mints the split and updates the year", async () => {
    const memberId = "31";
    const { kyc, box } = await joinedMember(ledger, m1, memberId);
    const proof = await proofFor(ledger, m1, memberId, "1a01");
    selectActor(ledger, "member");
    const contributed = await contributeMember(
      ledger,
      m1,
      box,
      proof,
      kyc,
      memberId,
    );
    const boxes = await memberBoxes(ledger, m1, memberId);
    const owner = keyHash(ledger.actors.member.address);

    expect(boxes).toHaveLength(1);
    expect(contributed.assets).toEqual({
      lovelace: MEMBER_MIN_LOVELACE,
      [memberUnit(m1.membershipPolicy, memberId)]: 1n,
      [m1.membershipPolicy + MEMBER_CAPITAL_ASSET_NAME]:
        CONTRIBUTION_MEMBER_CAPITAL,
      [m1.membershipPolicy + CAPITAL_PARTICIPATION_ASSET_NAME]:
        CONTRIBUTION_PARTICIPATION,
    });

    const datum = decodeDatum(contributed);
    expect(datum.fields[0]).toBe(owner);
    expect(datum.fields[1]).toBe(memberId);
    expect(asConstr(datum.fields[2])).toEqual({ index: 0, fields: [] });
    expect(asConstr(datum.fields[3])).toEqual({ index: 0, fields: [] });
    expect(asConstr(datum.fields[5])).toEqual({
      index: 0,
      fields: [2026n],
    });

    const proofs = (await ledger.lucid.utxosAt(m1.bankAddress)).filter(
      (utxo) => utxo.assets[bankUnit(m1.membershipPolicy, "1a01")] === 1n,
    );
    expect(proofs).toHaveLength(0);
  });

  test("a second contribution in the same year fails", async () => {
    const memberId = "32";
    const { kyc, box } = await joinedMember(ledger, m1, memberId);
    const firstProof = await proofFor(ledger, m1, memberId, "1a02");
    const secondProof = await proofFor(ledger, m1, memberId, "1a03");
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
    const { kyc, box } = await joinedMember(ledger, m1, memberId);
    const proof = await proofFor(ledger, m1, memberId, "1a04");
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
    const { kyc, box } = await joinedMember(ledger, m1, memberId, {
      kycMs: 30_000,
    });
    const proof = await proofFor(ledger, m1, memberId, "1a05");
    selectActor(ledger, "member");

    const failure = await expectRejected(() =>
      contributeMember(ledger, m1, box, proof, kyc, memberId),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a contribution with revoked KYC fails", async () => {
    const memberId = "35";
    const { kyc, box } = await joinedMember(ledger, m1, memberId);
    selectActor(ledger, "kycIssuer");
    await revokeKyc(ledger, m1, kyc, memberId);
    const proof = await proofFor(ledger, m1, memberId, "1a06");
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
