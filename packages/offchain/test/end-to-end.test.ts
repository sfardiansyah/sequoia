import { beforeAll, describe, expect, test } from "bun:test";
import { Data, type UTxO } from "@lucid-evolution/lucid";
import { eligibleLeaf, MS_PER_DAY } from "../src/governance";
import {
  advanceTo,
  castVote,
  executeProposal,
  finalizeProposal,
  revealVote,
  tallyProposal,
  type ChoiceName,
} from "./helpers/ballot";
import {
  CONFIG_MIN_LOVELACE,
  MEMBER_MIN_LOVELACE,
  configDatum,
  expectRejected,
  genesis,
  keyHash,
  testLedger,
  testConfig,
  membershipRedeemer,
  selectActor,
  scriptTime,
  stateUnit,
  submitTx,
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
  TRANSFER,
  asConstr,
  contributeMember,
  decodeDatum,
  joinMember,
  joinedMember,
  kycFor,
  memberBoxes,
  memberUnit,
  proofFor,
} from "./helpers/membership";
import {
  createProposal,
  decodeProposalDatum,
  proposalUnit,
  withExecuted,
  withFinalized,
} from "./helpers/proposal";

const config = testConfig();

/** The config the co-op votes for: a new year and a new annual amount. */
const nextConfig = {
  ...config,
  contributionYear: 2027n,
  annualAmount: 2_000_000n,
};

const voteSecret = (index: number): string =>
  (index + 1).toString(16).padStart(2, "0").repeat(32);
const leaf = (index: number): string => eligibleLeaf(voteSecret(index));
const voteSalt = "d1".repeat(32);

const governanceIds = {
  pass: "f1".repeat(32),
  twoOfThree: "f2".repeat(32),
  quorumShort: "f3".repeat(32),
  ineligible: "f4".repeat(32),
  stale: "f5".repeat(32),
};

const passChoices: ChoiceName[] = ["Yes", "Yes", "Yes", "No", "Abstain"];

/**
 * One ledger for the whole v2 slice (ADR 0009 §11): genesis, KYC, bank proof,
 * join, contribution, then governance from a board-signed leaf list to a
 * config execution. Focused suites in the other files stay; this one proves the
 * slice end to end and carries the §11 negative matrix.
 */
describe("M2 end to end", () => {
  let ledger: Ledger;
  let m1: Genesis;

  beforeAll(async () => {
    ledger = await testLedger();
    m1 = await genesis(ledger, config);
  });

  const contributedAssets = (memberId: string) => ({
    lovelace: MEMBER_MIN_LOVELACE,
    [memberUnit(m1.membershipPolicy, memberId)]: 1n,
    [m1.membershipPolicy + MEMBER_CAPITAL_ASSET_NAME]:
      CONTRIBUTION_MEMBER_CAPITAL,
    [m1.membershipPolicy + CAPITAL_PARTICIPATION_ASSET_NAME]:
      CONTRIBUTION_PARTICIPATION,
  });

  const proofBoxes = async (nonce: string): Promise<UTxO[]> =>
    (await ledger.lucid.utxosAt(m1.bankAddress)).filter(
      (utxo) => utxo.assets[bankUnit(m1.membershipPolicy, nonce)] === 1n,
    );

  test("genesis → KYC → bank proof → join → contribute", async () => {
    const standard = "41";
    const founder = "42";
    const standardKyc = await kycFor(ledger, m1, standard);
    const founderKyc = await kycFor(ledger, m1, founder);
    const standardProof = await proofFor(ledger, m1, standard, "2a01");
    const founderProof = await proofFor(ledger, m1, founder, "2a02");

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
    expect(asConstr(decodeDatum(founderBox).fields[2])).toEqual({
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
    expect(decodeDatum(standardAfter).fields[0]).toBe(
      keyHash(ledger.actors.member.address),
    );
    expect(decodeDatum(standardAfter).fields[1]).toBe(standard);
    expect(asConstr(decodeDatum(standardAfter).fields[3])).toEqual({
      index: 0,
      fields: [],
    });
    expect(asConstr(decodeDatum(standardAfter).fields[5])).toEqual({
      index: 0,
      fields: [2026n],
    });
    expect(asConstr(decodeDatum(founderAfter).fields[2])).toEqual({
      index: 1,
      fields: [],
    });
    expect(asConstr(decodeDatum(founderAfter).fields[5])).toEqual({
      index: 0,
      fields: [2026n],
    });

    expect(await memberBoxes(ledger, m1, standard)).toHaveLength(1);
    expect(await memberBoxes(ledger, m1, founder)).toHaveLength(1);
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
    const kyc = await kycFor(ledger, m1, memberId);
    selectActor(ledger, "member");

    const failure = await expectRejected(() =>
      joinMember(ledger, m1, { memberId }, kyc, 1),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a join with expired KYC fails", async () => {
    const memberId = "44";
    const kyc = await kycFor(ledger, m1, memberId, 10_000);
    selectActor(ledger, "member");

    const failure = await expectRejected(() =>
      joinMember(ledger, m1, { memberId }, kyc),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a join with revoked KYC fails", async () => {
    const memberId = "45";
    const kyc = await kycFor(ledger, m1, memberId);
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
    const { kyc, box } = await joinedMember(ledger, m1, memberId);
    const proof = await proofFor(ledger, m1, memberId, "2a05");
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
    const { kyc, box } = await joinedMember(ledger, m1, memberId);
    const firstProof = await proofFor(ledger, m1, memberId, "2a06");
    const secondProof = await proofFor(ledger, m1, memberId, "2a07");
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
    const { box } = await joinedMember(ledger, m1, memberId);
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

  // Governance state, built by the tests in order on the same ledger.
  let proposals: Record<keyof typeof governanceIds, UTxO>;
  let proposerKyc: UTxO;
  let passVotes: UTxO[];
  let twoOfThreeVotes: UTxO[];
  let quorumShortVote: UTxO;
  let ineligibleVote: UTxO;
  let staleVote: UTxO;

  const proposalBox = async (id: string): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(proposalUnit(m1.governancePolicy, id));

  const proposalFields = async (id: string) =>
    decodeProposalDatum((await proposalBox(id)).datum!);

  test("a board-signed eligible leaf list opens the proposals", async () => {
    const { kyc, box } = await joinedMember(ledger, m1, "50");
    proposerKyc = kyc;
    const proposer = keyHash(ledger.actors.member.address);

    // Each creation lands a block, so each proposal opens at its own time.
    const openProposal = async (id: string, from: number, count: number) => {
      const start = BigInt(scriptTime(ledger, ledger.emulator.now()));
      const leaves = Array.from({ length: count }, (_, index) =>
        leaf(from + index),
      );
      return createProposal(
        ledger,
        m1,
        nextConfig,
        { id, proposer, leaves, start },
        box,
        kyc,
      );
    };

    proposals = {
      pass: await openProposal(governanceIds.pass, 0, 5),
      twoOfThree: await openProposal(governanceIds.twoOfThree, 5, 3),
      quorumShort: await openProposal(governanceIds.quorumShort, 8, 4),
      ineligible: await openProposal(governanceIds.ineligible, 12, 2),
      stale: await openProposal(governanceIds.stale, 14, 2),
    };

    const pass = await proposalFields(governanceIds.pass);
    expect(pass.eligible_leaves).toHaveLength(5);
    expect(pass.status).toBe("Open");
    expect(pass.nullifiers).toEqual([]);
  });

  test("a non-board creator cannot open a proposal", async () => {
    const proposerBox = (await memberBoxes(ledger, m1, "50"))[0]!;
    const start = BigInt(scriptTime(ledger, ledger.emulator.now()));

    const failure = await expectRejected(() =>
      createProposal(
        ledger,
        m1,
        config,
        {
          id: "f6".repeat(32),
          proposer: keyHash(ledger.actors.member.address),
          leaves: [leaf(20)],
          start,
        },
        proposerBox,
        proposerKyc,
        1,
      ),
    );

    expect(failure).toBeInstanceOf(Error);
  });

  test("casts Yes, No, and Abstain; an ineligible leaf and a duplicate nullifier fail", async () => {
    // Casting is permissionless; the deployer pays for the vote boxes.
    selectActor(ledger, "deployer");
    passVotes = [];
    for (const [index, choice] of passChoices.entries()) {
      passVotes.push(
        await castVote(ledger, m1, await proposalBox(governanceIds.pass), {
          leaf: leaf(index),
          voteSecret: voteSecret(index),
          choice,
          salt: voteSalt,
        }),
      );
    }

    twoOfThreeVotes = [];
    const twoOfThreeChoices: ChoiceName[] = ["Yes", "Yes", "No"];
    for (const [index, choice] of twoOfThreeChoices.entries()) {
      twoOfThreeVotes.push(
        await castVote(ledger, m1, await proposalBox(governanceIds.twoOfThree), {
          leaf: leaf(5 + index),
          voteSecret: voteSecret(5 + index),
          choice,
          salt: voteSalt,
        }),
      );
    }

    quorumShortVote = await castVote(
      ledger,
      m1,
      await proposalBox(governanceIds.quorumShort),
      {
        leaf: leaf(8),
        voteSecret: voteSecret(8),
        choice: "Yes",
        salt: voteSalt,
      },
    );

    const ineligible = await expectRejected(() =>
      castVote(ledger, m1, proposals.ineligible, {
        leaf: leaf(99),
        voteSecret: voteSecret(99),
        choice: "Yes",
        salt: voteSalt,
      }),
    );
    expect(ineligible).toBeInstanceOf(Error);

    ineligibleVote = await castVote(
      ledger,
      m1,
      await proposalBox(governanceIds.ineligible),
      {
        leaf: leaf(12),
        voteSecret: voteSecret(12),
        choice: "Yes",
        salt: voteSalt,
      },
    );
    const duplicate = await expectRejected(async () =>
      castVote(ledger, m1, await proposalBox(governanceIds.ineligible), {
        leaf: leaf(12),
        voteSecret: voteSecret(12),
        choice: "No",
        salt: voteSalt,
      }),
    );
    expect(duplicate).toBeInstanceOf(Error);

    staleVote = await castVote(
      ledger,
      m1,
      await proposalBox(governanceIds.stale),
      {
        leaf: leaf(14),
        voteSecret: voteSecret(14),
        choice: "Yes",
        salt: voteSalt,
      },
    );

    // Open the reveal phase for every proposal before trying a late cast.
    const ends = [
      (await proposalFields(governanceIds.pass)).end,
      (await proposalFields(governanceIds.twoOfThree)).end,
      (await proposalFields(governanceIds.quorumShort)).end,
    ];
    advanceTo(
      ledger,
      Number(ends.reduce((max, end) => (end > max ? end : max))),
    );

    const staleEnd = Number((await proposalFields(governanceIds.stale)).end);
    const lateCast = await expectRejected(async () =>
      castVote(ledger, m1, await proposalBox(governanceIds.stale), {
        leaf: leaf(15),
        voteSecret: voteSecret(15),
        choice: "Yes",
        salt: voteSalt,
        validFrom: staleEnd - 60_000,
        validTo: staleEnd + 60_000,
      }),
    );
    expect(lateCast).toBeInstanceOf(Error);
  });

  test("reveals every ballot; a wrong salt and a late reveal fail", async () => {
    for (const [index, choice] of passChoices.entries()) {
      passVotes[index] = await revealVote(ledger, m1, passVotes[index]!, {
        choice,
        salt: voteSalt,
      });
    }
    for (const [index, choice] of (
      ["Yes", "Yes", "No"] as ChoiceName[]
    ).entries()) {
      twoOfThreeVotes[index] = await revealVote(
        ledger,
        m1,
        twoOfThreeVotes[index]!,
        { choice, salt: voteSalt },
      );
    }
    quorumShortVote = await revealVote(ledger, m1, quorumShortVote, {
      choice: "Yes",
      salt: voteSalt,
    });

    const wrongSalt = await expectRejected(() =>
      revealVote(ledger, m1, ineligibleVote, {
        choice: "Yes",
        salt: "d2".repeat(32),
      }),
    );
    expect(wrongSalt).toBeInstanceOf(Error);

    const staleRevealEnd = Number(
      (await proposalFields(governanceIds.stale)).reveal_end,
    );
    advanceTo(ledger, staleRevealEnd);
    const lateReveal = await expectRejected(() =>
      revealVote(ledger, m1, staleVote, {
        choice: "Yes",
        salt: voteSalt,
        validFrom: staleRevealEnd,
        validTo: staleRevealEnd + 60_000,
      }),
    );
    expect(lateReveal).toBeInstanceOf(Error);
  });

  test("an unrevealed ballot cannot be tallied", async () => {
    const failure = await expectRejected(async () =>
      tallyProposal(
        ledger,
        m1,
        await proposalBox(governanceIds.ineligible),
        [ineligibleVote],
      ),
    );

    expect(failure).toBeInstanceOf(Error);
  });

  test("tallies, finalizes passed and rejected, and records 2-of-3 below 6667", async () => {
    await tallyProposal(
      ledger,
      m1,
      await proposalBox(governanceIds.pass),
      passVotes,
    );
    await tallyProposal(
      ledger,
      m1,
      await proposalBox(governanceIds.twoOfThree),
      twoOfThreeVotes,
    );
    await tallyProposal(
      ledger,
      m1,
      await proposalBox(governanceIds.quorumShort),
      [quorumShortVote],
    );

    const passed = await finalizeProposal(
      ledger,
      m1,
      config,
      await proposalBox(governanceIds.pass),
    );
    const belowThreshold = await finalizeProposal(
      ledger,
      m1,
      config,
      await proposalBox(governanceIds.twoOfThree),
    );
    const missingQuorum = await finalizeProposal(
      ledger,
      m1,
      config,
      await proposalBox(governanceIds.quorumShort),
    );

    expect(decodeProposalDatum(passed.datum!).status).toBe("Passed");
    expect(decodeProposalDatum(passed.datum!).tallied).toBe(5n);
    expect(decodeProposalDatum(passed.datum!).yes).toBe(3n);
    expect(decodeProposalDatum(passed.datum!).no).toBe(1n);
    expect(decodeProposalDatum(passed.datum!).abstain).toBe(1n);
    expect(decodeProposalDatum(belowThreshold.datum!).status).toBe("Rejected");
    expect(decodeProposalDatum(missingQuorum.datum!).status).toBe("Rejected");
  });

  test("executes after the timelock and refuses early, tampered, and repeated execution", async () => {
    const passed = await proposalBox(governanceIds.pass);
    const fields = decodeProposalDatum(passed.datum!);
    const finalizedAt = Number(fields.finalizedAt);
    const timelockEnd = finalizedAt + Number(config.timelockDays) * MS_PER_DAY;

    const early = await expectRejected(() =>
      executeProposal(ledger, m1, m1.configUtxo, passed, {
        validFrom: finalizedAt + MS_PER_DAY,
      }),
    );
    expect(early).toBeInstanceOf(Error);

    const tampered = withExecuted(
      withFinalized(
        passed.datum!,
        "Passed",
        BigInt(finalizedAt - 30 * MS_PER_DAY),
      ),
    );
    const backdated = await expectRejected(() =>
      executeProposal(ledger, m1, m1.configUtxo, passed, {
        proposalDatum: tampered,
      }),
    );
    expect(backdated).toBeInstanceOf(Error);

    const changed = configDatum(
      ledger.roles,
      { ...nextConfig, network: 1n },
      {
        membership: m1.membershipPolicy,
        kyc: m1.kycPolicy,
        bank: m1.bankPolicy,
        governance: m1.governancePolicy,
        ballot: m1.ballotPolicy,
      },
    );
    const immutable = await expectRejected(() =>
      executeProposal(ledger, m1, m1.configUtxo, passed, {
        configDatum: changed,
      }),
    );
    expect(immutable).toBeInstanceOf(Error);

    advanceTo(ledger, timelockEnd);
    const executed = await executeProposal(ledger, m1, m1.configUtxo, passed);

    const written = Data.from(executed.config.datum!) as {
      index: number;
      fields: unknown[];
    };
    expect(executed.config.address).toBe(m1.configAddress);
    expect(executed.config.assets[stateUnit(m1.stateNftPolicy)]).toBe(1n);
    expect(written.fields[0]).toBe(2027n);
    expect(written.fields[1]).toBe(2_000_000n);

    const proposal = decodeProposalDatum(executed.proposal.datum!);
    expect(proposal.status).toBe("Executed");
    expect(proposal.finalizedAt).toBe(fields.finalizedAt);
    expect(proposal.nullifiers).toHaveLength(5);
    expect(
      executed.proposal.assets[
        proposalUnit(m1.governancePolicy, governanceIds.pass)
      ],
    ).toBe(1n);

    const configBox = await ledger.lucid.utxoByUnit(
      stateUnit(m1.stateNftPolicy),
    );
    const again = await expectRejected(() =>
      executeProposal(ledger, m1, configBox, executed.proposal),
    );
    expect(again).toBeInstanceOf(Error);
  });
});
