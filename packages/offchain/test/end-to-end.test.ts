import { beforeAll, describe, expect, test } from "bun:test";
import type { UTxO } from "@lucid-evolution/lucid";
import { eligibleLeaf, MS_PER_DAY } from "../src/governance";
import {
  advanceTo,
  castVote,
  finalizeProposal,
  revealVote,
  tallyProposal,
  type ChoiceName,
} from "./helpers/ballot";
import {
  CONFIG_MIN_LOVELACE,
  MEMBER_MIN_LOVELACE,
  expectRejected,
  genesis,
  keyHash,
  poolDatum,
  poolUnit,
  scriptTime,
  selectActor,
  stateUnit,
  testConfig,
  testLedger,
  type Genesis,
  type Ledger,
} from "./helpers/harness";
import {
  CAPITAL_PARTICIPATION_ASSET_NAME,
  CONTRIBUTION_MEMBER_CAPITAL,
  CONTRIBUTION_PARTICIPATION,
  MEMBER_CAPITAL_ASSET_NAME,
  contributeMember,
  joinedMember,
  memberUnit,
  proofFor,
} from "./helpers/membership";
import {
  createProposal,
  decodeProposalDatum,
  proposalUnit,
  type ProjectSpecTerms,
} from "./helpers/proposal";
import {
  attestPool,
  closeProject,
  decodePoolDatum,
  decodeProjectDatum,
  executeCancel,
  executeProject,
  projectDatum,
  projectUnit,
  spendTranche,
  type SpendTrancheOptions,
} from "./helpers/treasury";

const config = testConfig();

const memberId = "50";
const voteSecret = (index: number): string =>
  (index + 1).toString(16).padStart(2, "0").repeat(32);
const leaf = (index: number): string => eligibleLeaf(voteSecret(index));
const voteSalt = "d1".repeat(32);

const ids = {
  fullProject: "a1".repeat(32),
  lateProject: "b2".repeat(32),
  cancelledProject: "c3".repeat(32),
  cancelProposal: "d4".repeat(32),
};

const evidence = ["e1".repeat(32), "e2".repeat(32), "e3".repeat(32)];
const recipient = "ab".repeat(32);
const days = (count: number): bigint => BigInt(count) * BigInt(MS_PER_DAY);

const fullMilestones = [
  { amount: 3_000_000n, evidenceCommitment: evidence[0]! },
  { amount: 2_000_000n, evidenceCommitment: evidence[1]! },
];
const lateMilestones = [
  { amount: 1_000_000n, evidenceCommitment: evidence[2]! },
];
const cancelledMilestones = [
  { amount: 4_000_000n, evidenceCommitment: evidence[0]! },
];

const projectSpec = (
  start: bigint,
  deadlineDays: number,
  milestones: ProjectSpecTerms["milestones"],
): ProjectSpecTerms => ({
  recipientCommitment: recipient,
  deadline: start + days(deadlineDays),
  milestones,
});

/**
 * One ledger for the whole v3 slice (spec §7 and §11): genesis, KYC, join,
 * contribution, a treasurer-funded pool, a project proposal voted through to
 * execution, milestone tranches, a board close, a late project closed by
 * anyone, and a cancel proposal. Focused suites in the other files stay; this
 * one proves the slice end to end and carries the spec §11 negative matrix.
 */
describe("M3 treasury end to end", () => {
  let ledger: Ledger;
  let chain: Genesis;
  let proposerBox: UTxO;
  let proposerKyc: UTxO;

  let fullSpec: ProjectSpecTerms;
  let lateSpec: ProjectSpecTerms;
  let fullVotes: UTxO[];
  let lateVote: UTxO;
  let cancelledVote: UTxO;
  let cancelVote: UTxO;

  const proposalBox = (id: string): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(proposalUnit(chain.governancePolicy, id));
  const proposalFields = async (id: string) =>
    decodeProposalDatum((await proposalBox(id)).datum!);
  const projectBox = (id: string): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(projectUnit(chain.treasuryPolicy, id));
  const poolBox = (): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(poolUnit(chain.stateNftPolicy));
  const pool = async () => decodePoolDatum((await poolBox()).datum!);
  // The project set is discovered by token; genesis has none.
  const projectBoxes = async (): Promise<UTxO[]> =>
    (await ledger.lucid.utxosAt(chain.treasuryAddress)).filter((utxo) =>
      Object.keys(utxo.assets).some((unit) =>
        unit.startsWith(chain.treasuryPolicy),
      ),
    );
  const advancePast = async (
    proposalIds: string[],
    field: "end" | "reveal_end" = "end",
  ): Promise<void> => {
    const times = await Promise.all(
      proposalIds.map(async (id) => (await proposalFields(id))[field]),
    );
    advanceTo(ledger, Number(times.reduce((max, time) => (time > max ? time : max))));
  };
  const spendFull = (
    evidenceHash: string,
    options: Omit<SpendTrancheOptions, "projectId" | "evidenceHash"> = {},
  ) =>
    spendTranche(ledger, chain, {
      projectId: ids.fullProject,
      evidenceHash,
      ...options,
    });

  beforeAll(async () => {
    ledger = await testLedger();
    chain = await genesis(ledger, config);
  });

  test("genesis → KYC → bank proof → join → contribute", async () => {
    const joined = await joinedMember(ledger, chain, memberId, {
      kycMs: 30 * MS_PER_DAY,
    });
    proposerKyc = joined.kyc;

    const proof = await proofFor(ledger, chain, memberId, "2a01");
    selectActor(ledger, "member");
    proposerBox = await contributeMember(
      ledger,
      chain,
      joined.box,
      proof,
      proposerKyc,
      memberId,
    );

    expect(proposerBox.assets).toEqual({
      lovelace: MEMBER_MIN_LOVELACE,
      [memberUnit(chain.membershipPolicy, memberId)]: 1n,
      [chain.membershipPolicy + MEMBER_CAPITAL_ASSET_NAME]:
        CONTRIBUTION_MEMBER_CAPITAL,
      [chain.membershipPolicy + CAPITAL_PARTICIPATION_ASSET_NAME]:
        CONTRIBUTION_PARTICIPATION,
    });
    expect((await ledger.lucid.utxosAt(chain.configAddress))[0]!.assets).toEqual({
      lovelace: CONFIG_MIN_LOVELACE,
      [stateUnit(chain.stateNftPolicy)]: 1n,
    });
    expect(await pool()).toEqual({ balance: 0n, committed: 0n });
  });

  test("a board-signed leaf list opens the project and cancel proposals", async () => {
    const proposer = keyHash(ledger.actors.member.address);
    const start = () => BigInt(scriptTime(ledger, ledger.emulator.now()));
    const createProject = async (
      id: string,
      leaves: string[],
      deadlineDays: number,
      milestones: ProjectSpecTerms["milestones"],
    ): Promise<ProjectSpecTerms> => {
      const openedAt = start();
      const spec = projectSpec(openedAt, deadlineDays, milestones);
      await createProposal(
        ledger,
        chain,
        config,
        {
          id,
          proposer,
          leaves,
          start: openedAt,
          payload: { kind: "Project", spec },
        },
        proposerBox,
        proposerKyc,
      );
      return spec;
    };

    fullSpec = await createProject(
      ids.fullProject,
      [leaf(0), leaf(1), leaf(2)],
      30,
      fullMilestones,
    );
    // The late project's deadline is after the vote windows but before the
    // full project's, so it can go past its deadline while the rest is open.
    lateSpec = await createProject(ids.lateProject, [leaf(3), leaf(6)], 11, lateMilestones);
    await createProject(
      ids.cancelledProject,
      [leaf(4)],
      30,
      cancelledMilestones,
    );

    const cancelStart = start();
    await createProposal(
      ledger,
      chain,
      config,
      {
        id: ids.cancelProposal,
        proposer,
        leaves: [leaf(5)],
        start: cancelStart,
        payload: { kind: "Cancel", projectId: ids.cancelledProject },
      },
      proposerBox,
      proposerKyc,
    );

    expect(await proposalFields(ids.fullProject)).toMatchObject({
      kind: "Project",
      status: "Open",
      nullifiers: [],
    });
    expect(await proposalFields(ids.cancelProposal)).toMatchObject({
      kind: "Cancel",
      status: "Open",
    });
    expect(await projectBoxes()).toHaveLength(0);
  });

  test("casts, reveals, tallies, and finalizes the project and cancel proposals", async () => {
    // Casting is permissionless; the deployer pays for the vote boxes.
    selectActor(ledger, "deployer");

    const fullChoices: ChoiceName[] = ["Yes", "Yes", "No"];
    fullVotes = [];
    for (const [index, choice] of fullChoices.entries()) {
      fullVotes.push(
        await castVote(ledger, chain, await proposalBox(ids.fullProject), {
          leaf: leaf(index),
          voteSecret: voteSecret(index),
          choice,
          salt: voteSalt,
        }),
      );
    }
    const cast = async (id: string, index: number, choice: ChoiceName) =>
      castVote(ledger, chain, await proposalBox(id), {
        leaf: leaf(index),
        voteSecret: voteSecret(index),
        choice,
        salt: voteSalt,
      });
    lateVote = await cast(ids.lateProject, 3, "Yes");
    cancelledVote = await cast(ids.cancelledProject, 4, "Yes");
    cancelVote = await cast(ids.cancelProposal, 5, "Yes");

    // A late cast is rejected before the good path.
    await advancePast([
      ids.fullProject,
      ids.lateProject,
      ids.cancelledProject,
      ids.cancelProposal,
    ]);
    const lateCast = await expectRejected(async () =>
      castVote(ledger, chain, await proposalBox(ids.lateProject), {
        leaf: leaf(6),
        voteSecret: voteSecret(6),
        choice: "Yes",
        salt: voteSalt,
      }),
    );
    expect(lateCast).toBeInstanceOf(Error);

    const reveal = async (box: UTxO, choice: ChoiceName) =>
      revealVote(ledger, chain, box, { choice, salt: voteSalt });
    for (const [index, choice] of fullChoices.entries()) {
      fullVotes[index] = await reveal(fullVotes[index]!, choice);
    }
    lateVote = await reveal(lateVote, "Yes");
    cancelledVote = await reveal(cancelledVote, "Yes");
    cancelVote = await reveal(cancelVote, "Yes");

    const talliedFull = await tallyProposal(
      ledger,
      chain,
      await proposalBox(ids.fullProject),
      fullVotes,
    );
    const talliedLate = await tallyProposal(
      ledger,
      chain,
      await proposalBox(ids.lateProject),
      [lateVote],
    );
    const talliedCancelled = await tallyProposal(
      ledger,
      chain,
      await proposalBox(ids.cancelledProject),
      [cancelledVote],
    );
    const talliedCancel = await tallyProposal(
      ledger,
      chain,
      await proposalBox(ids.cancelProposal),
      [cancelVote],
    );

    await advancePast(
      [
        ids.fullProject,
        ids.lateProject,
        ids.cancelledProject,
        ids.cancelProposal,
      ],
      "reveal_end",
    );

    const finalized = [
      await finalizeProposal(ledger, chain, config, talliedFull),
      await finalizeProposal(ledger, chain, config, talliedLate),
      await finalizeProposal(ledger, chain, config, talliedCancelled),
      await finalizeProposal(ledger, chain, config, talliedCancel),
    ];
    for (const box of finalized) {
      expect(decodeProposalDatum(box.datum!).status).toBe("Passed");
    }
    // 2-of-3 passes at the project threshold (5001) though it would fail at
    // the structural 6667: the kind selects the bar.
    expect((await proposalFields(ids.fullProject)).yes).toBe(2n);
    expect((await proposalFields(ids.fullProject)).no).toBe(1n);
  });

  test("an unfunded pool rejects project execution and keeps the vote", async () => {
    const failure = await expectRejected(async () =>
      executeProject(ledger, chain, await proposalBox(ids.fullProject)),
    );

    expect(String(failure)).toContain("failed script execution");
    expect((await proposalFields(ids.fullProject)).status).toBe("Passed");
    expect(await pool()).toEqual({ balance: 0n, committed: 0n });
  });

  test("the treasurer funds the pool", async () => {
    selectActor(ledger, "bankIssuer");
    await attestPool(ledger, chain, { balance: 25_000_000n });
    expect(await pool()).toEqual({ balance: 25_000_000n, committed: 0n });
    selectActor(ledger, "deployer");
  });

  test("a tampered project and a second PROJECT name are rejected", async () => {
    const tampered: ProjectSpecTerms = {
      ...fullSpec,
      recipientCommitment: "cd".repeat(32),
    };
    const spec = await expectRejected(async () =>
      executeProject(ledger, chain, await proposalBox(ids.fullProject), { spec: tampered }),
    );
    const second = await expectRejected(async () =>
      executeProject(ledger, chain, await proposalBox(ids.fullProject), {
        extraMint: { name: "ff".repeat(32), quantity: 1n },
      }),
    );

    expect(String(spec)).toContain("failed script execution");
    expect(String(second)).toContain("failed script execution");
  });

  test("a passed project reserves its budget and writes the project box", async () => {
    const executed = await executeProject(
      ledger,
      chain,
      await proposalBox(ids.fullProject),
    );
    const project = decodeProjectDatum(executed.project.datum!);

    expect(executed.project.address).toBe(chain.treasuryAddress);
    expect(executed.project.assets[projectUnit(chain.treasuryPolicy, ids.fullProject)]).toBe(
      1n,
    );
    expect(project).toMatchObject({
      projectId: ids.fullProject,
      nextMilestone: 0n,
      status: "ProjectOpen",
    });
    expect(project.spec).toEqual(fullSpec);
    expect(decodeProposalDatum(executed.proposal.datum!).status).toBe(
      "Executed",
    );
    expect(await pool()).toEqual({ balance: 25_000_000n, committed: 5_000_000n });
  });

  test("wrong evidence, missing signatures, and tampered datums are rejected", async () => {
    selectActor(ledger, "bankIssuer");
    const wrongEvidence = await expectRejected(() =>
      spendFull(evidence[1]!),
    );
    const missingBoard = await expectRejected(() =>
      spendFull(evidence[0]!, { boardSigners: 0 }),
    );

    selectActor(ledger, "deployer");
    const missingTreasurer = await expectRejected(() =>
      spendFull(evidence[0]!),
    );

    selectActor(ledger, "bankIssuer");
    const tamperedProject = await expectRejected(() =>
      spendFull(evidence[0]!, {
        projectDatum: projectDatum(
          ids.fullProject,
          { ...fullSpec, recipientCommitment: "cd".repeat(32) },
          1n,
        ),
      }),
    );
    const tamperedPool = await expectRejected(() =>
      spendFull(evidence[0]!, {
        poolDatum: poolDatum(24_000_000n, 5_000_000n),
      }),
    );

    for (const failure of [
      wrongEvidence,
      missingBoard,
      missingTreasurer,
      tamperedProject,
      tamperedPool,
    ]) {
      expect(String(failure)).toContain("failed script execution");
    }
    expect((await proposalFields(ids.fullProject)).status).toBe("Executed");
    expect(await pool()).toEqual({ balance: 25_000_000n, committed: 5_000_000n });
  });

  test("the first tranche pays the next milestone", async () => {
    selectActor(ledger, "bankIssuer");
    const spent = await spendFull(evidence[0]!);

    expect(decodeProjectDatum(spent.project.datum!)).toMatchObject({
      projectId: ids.fullProject,
      nextMilestone: 1n,
      status: "ProjectOpen",
    });
    expect(await pool()).toEqual({
      balance: 22_000_000n,
      committed: 2_000_000n,
    });
  });

  test("nobody may close a project before its deadline, but the board may", async () => {
    selectActor(ledger, "deployer");
    const permissionless = await expectRejected(() =>
      closeProject(ledger, chain, {
        projectId: ids.fullProject,
        boardSigners: 0,
      }),
    );
    expect(String(permissionless)).toContain("failed script execution");
    expect(decodeProjectDatum((await projectBox(ids.fullProject)).datum!).status).toBe(
      "ProjectOpen",
    );

    const closed = await closeProject(ledger, chain, {
      projectId: ids.fullProject,
    });
    expect(decodeProjectDatum(closed.project.datum!)).toMatchObject({
      projectId: ids.fullProject,
      nextMilestone: 1n,
      status: "ProjectClosed",
    });
    expect(await pool()).toEqual({
      balance: 22_000_000n,
      committed: 0n,
    });
  });

  test("a cancel mismatch is rejected and the passed cancel returns the remainder", async () => {
    selectActor(ledger, "deployer");
    await executeProject(ledger, chain, await proposalBox(ids.lateProject));
    await executeProject(ledger, chain, await proposalBox(ids.cancelledProject));
    expect(await pool()).toEqual({ balance: 22_000_000n, committed: 5_000_000n });

    // The target is open, so only the proposal's payload mismatch can reject.
    const mismatch = await expectRejected(async () =>
      executeCancel(ledger, chain, await proposalBox(ids.cancelProposal), {
        projectId: ids.lateProject,
      }),
    );
    expect(String(mismatch)).toContain("failed script execution");
    expect((await proposalFields(ids.cancelProposal)).status).toBe("Passed");

    const cancelled = await executeCancel(
      ledger,
      chain,
      await proposalBox(ids.cancelProposal),
    );
    expect(decodeProposalDatum(cancelled.proposal.datum!).status).toBe(
      "Executed",
    );
    expect(decodeProjectDatum(cancelled.project.datum!)).toMatchObject({
      projectId: ids.cancelledProject,
      nextMilestone: 0n,
      status: "ProjectCancelled",
    });
    expect(await pool()).toEqual({
      balance: 22_000_000n,
      committed: 1_000_000n,
    });
  });

  test("a late tranche is rejected and anyone may close the expired project", async () => {
    advanceTo(ledger, Number(lateSpec.deadline) + 1_000);
    selectActor(ledger, "bankIssuer");
    const late = await expectRejected(() =>
      spendTranche(ledger, chain, {
        projectId: ids.lateProject,
        evidenceHash: evidence[2]!,
      }),
    );
    expect(String(late)).toContain("failed script execution");

    // From the deadline the close is permissionless: no board or config.
    selectActor(ledger, "deployer");
    const closed = await closeProject(ledger, chain, {
      projectId: ids.lateProject,
      boardSigners: 0,
    });
    expect(decodeProjectDatum(closed.project.datum!).status).toBe(
      "ProjectClosed",
    );
    expect(await pool()).toEqual({ balance: 22_000_000n, committed: 0n });
  });
});
