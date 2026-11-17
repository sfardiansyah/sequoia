import { beforeAll, describe, expect, test } from "bun:test";
import type { UTxO } from "@lucid-evolution/lucid";
import { eligibleLeaf, MS_PER_DAY } from "../src/governance";
import {
  advanceTo,
  castVote,
  finalizeProposal,
  revealVote,
  tallyProposal,
} from "./helpers/ballot";
import {
  expectRejected,
  genesis,
  keyHash,
  poolUnit,
  scriptTime,
  selectActor,
  testConfig,
  testLedger,
  type Genesis,
  type Ledger,
} from "./helpers/harness";
import { issueKyc, kycTerms } from "./helpers/kyc";
import { joinMember } from "./helpers/membership";
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
  projectUnit,
  spendTranche,
} from "./helpers/treasury";

const config = testConfig();

const secret = (index: number): string =>
  (index + 1).toString(16).padStart(2, "0").repeat(32);
const salt = "d1".repeat(32);

const ids = {
  partlySpent: "91".repeat(32),
  cancelled: "92".repeat(32),
  expired: "93".repeat(32),
  boardLate: "94".repeat(32),
  cancelCancelled: "95".repeat(32),
  cancelClosed: "96".repeat(32),
};

const evidence = ["a1".repeat(32), "a2".repeat(32)];
const milestones = [
  { amount: 3_000_000n, evidenceCommitment: evidence[0]! },
  { amount: 2_000_000n, evidenceCommitment: evidence[1]! },
];

/**
 * `CloseProject` and `CancelProject` (ADR 0010 §6; spec §7): the unspent
 * milestones return to the pool, the project box keeps its id and milestone
 * position and locks at its final status, and the balance never moves because
 * the cash stayed at the bank.
 */
describe("close and cancel", () => {
  let ledger: Ledger;
  let m1: Genesis;
  let spec: ProjectSpecTerms;

  const poolBox = (): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(poolUnit(m1.stateNftPolicy));

  const proposalBox = (id: string): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(proposalUnit(m1.governancePolicy, id));

  const projectBox = (id: string): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(projectUnit(m1.treasuryPolicy, id));

  const pool = async () => decodePoolDatum((await poolBox()).datum!);

  beforeAll(async () => {
    ledger = await testLedger();
    m1 = await genesis(ledger, config);

    selectActor(ledger, "kycIssuer");
    const expiry =
      BigInt(scriptTime(ledger, ledger.emulator.now())) +
      30n * BigInt(MS_PER_DAY);
    const kyc = await issueKyc(ledger, m1, kycTerms("91", expiry));
    selectActor(ledger, "member");
    const memberBox = await joinMember(ledger, m1, { memberId: "91" }, kyc);

    const proposer = keyHash(ledger.actors.member.address);
    const leaves = [eligibleLeaf(secret(0)), eligibleLeaf(secret(1))];
    spec = {
      recipientCommitment: "ab".repeat(32),
      deadline:
        BigInt(scriptTime(ledger, ledger.emulator.now())) +
        20n * BigInt(MS_PER_DAY),
      milestones,
    };
    // Each creation lands a block, so each proposal opens at its own time.
    const now = () => BigInt(scriptTime(ledger, ledger.emulator.now()));
    const project = (id: string) =>
      createProposal(
        ledger,
        m1,
        config,
        {
          id,
          proposer,
          leaves,
          start: now(),
          payload: { kind: "Project", spec },
        },
        memberBox,
        kyc,
      );
    const cancel = (id: string, projectId: string) =>
      createProposal(
        ledger,
        m1,
        config,
        {
          id,
          proposer,
          leaves,
          start: now(),
          payload: { kind: "Cancel", projectId },
        },
        memberBox,
        kyc,
      );

    const proposals: [string, UTxO][] = [
      [ids.partlySpent, await project(ids.partlySpent)],
      [ids.cancelled, await project(ids.cancelled)],
      [ids.expired, await project(ids.expired)],
      [ids.boardLate, await project(ids.boardLate)],
      [ids.cancelCancelled, await cancel(ids.cancelCancelled, ids.cancelled)],
      [ids.cancelClosed, await cancel(ids.cancelClosed, ids.partlySpent)],
    ];

    // Casting is permissionless; the deployer pays for every ballot.
    selectActor(ledger, "deployer");
    const votes = new Map<string, UTxO>();
    for (const [id, box] of proposals) {
      votes.set(
        id,
        await castVote(ledger, m1, box, {
          leaf: leaves[0]!,
          voteSecret: secret(0),
          choice: "Yes",
          salt,
        }),
      );
    }

    const end = Math.max(
      ...proposals.map(([, box]) => Number(decodeProposalDatum(box.datum!).end)),
    );
    const revealEnd = Math.max(
      ...proposals.map(([, box]) =>
        Number(decodeProposalDatum(box.datum!).reveal_end),
      ),
    );
    advanceTo(ledger, end);
    const revealed = new Map<string, UTxO>();
    for (const [id, vote] of votes) {
      revealed.set(
        id,
        await revealVote(ledger, m1, vote, { choice: "Yes", salt }),
      );
    }
    const tallied = new Map<string, UTxO>();
    for (const [id, vote] of revealed) {
      tallied.set(
        id,
        await tallyProposal(ledger, m1, await proposalBox(id), [vote]),
      );
    }
    advanceTo(ledger, revealEnd);
    for (const [id, box] of tallied) {
      const finalized = await finalizeProposal(ledger, m1, config, box);
      expect(decodeProposalDatum(finalized.datum!).status).toBe("Passed");
    }

    selectActor(ledger, "bankIssuer");
    await attestPool(ledger, m1, { balance: 25_000_000n });

    selectActor(ledger, "deployer");
    for (const id of [
      ids.partlySpent,
      ids.cancelled,
      ids.expired,
      ids.boardLate,
    ]) {
      await executeProject(ledger, m1, await proposalBox(id));
    }

    // A partly spent project: the first milestone pays before the close.
    selectActor(ledger, "bankIssuer");
    await spendTranche(ledger, m1, {
      projectId: ids.partlySpent,
      evidenceHash: evidence[0]!,
    });
    selectActor(ledger, "deployer");
  }, 120_000);

  test("a permissionless close before the deadline is rejected", async () => {
    const failure = await expectRejected(() =>
      closeProject(ledger, m1, { projectId: ids.expired, boardSigners: 0 }),
    );

    expect(String(failure)).toContain("failed script execution");
    expect(decodeProjectDatum((await projectBox(ids.expired)).datum!).status).toBe(
      "ProjectOpen",
    );
  });

  test("a board close returns the remainder of a partly spent project", async () => {
    const closed = await closeProject(ledger, m1, {
      projectId: ids.partlySpent,
    });

    expect(decodeProjectDatum(closed.project.datum!)).toMatchObject({
      projectId: ids.partlySpent,
      spec,
      nextMilestone: 1n,
      status: "ProjectClosed",
    });
    expect(decodePoolDatum(closed.pool.datum!)).toEqual({
      balance: 22_000_000n,
      committed: 15_000_000n,
    });
  });

  test("a closed project cannot close again", async () => {
    const failure = await expectRejected(() =>
      closeProject(ledger, m1, { projectId: ids.partlySpent }),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a cancel with a mismatched project is rejected", async () => {
    const proposal = await proposalBox(ids.cancelCancelled);
    const failure = await expectRejected(() =>
      executeCancel(ledger, m1, proposal, { projectId: ids.expired }),
    );

    expect(String(failure)).toContain("failed script execution");
    expect(
      decodeProposalDatum((await proposalBox(ids.cancelCancelled)).datum!)
        .status,
    ).toBe("Passed");
  });

  test("a passed cancel proposal returns the remainder", async () => {
    const cancelled = await executeCancel(
      ledger,
      m1,
      await proposalBox(ids.cancelCancelled),
    );

    expect(decodeProposalDatum(cancelled.proposal.datum!).status).toBe(
      "Executed",
    );
    expect(decodeProjectDatum(cancelled.project.datum!)).toMatchObject({
      projectId: ids.cancelled,
      spec,
      nextMilestone: 0n,
      status: "ProjectCancelled",
    });
    expect(decodePoolDatum(cancelled.pool.datum!)).toEqual({
      balance: 22_000_000n,
      committed: 10_000_000n,
    });
  });

  test("a cancelled project cannot close", async () => {
    const failure = await expectRejected(() =>
      closeProject(ledger, m1, { projectId: ids.cancelled }),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a cancel for a closed project is rejected", async () => {
    const proposal = await proposalBox(ids.cancelClosed);
    const failure = await expectRejected(() =>
      executeCancel(ledger, m1, proposal),
    );

    expect(String(failure)).toContain("failed script execution");
    expect(
      decodeProposalDatum((await proposalBox(ids.cancelClosed)).datum!).status,
    ).toBe("Passed");
  });

  test("a permissionless close after the deadline returns the remainder", async () => {
    advanceTo(ledger, Number(spec.deadline) + 120_000);
    const closed = await closeProject(ledger, m1, {
      projectId: ids.expired,
      boardSigners: 0,
    });

    expect(decodeProjectDatum(closed.project.datum!).status).toBe(
      "ProjectClosed",
    );
    expect(decodePoolDatum(closed.pool.datum!)).toEqual({
      balance: 22_000_000n,
      committed: 5_000_000n,
    });
  });

  test("a board close after the deadline is allowed", async () => {
    const closed = await closeProject(ledger, m1, {
      projectId: ids.boardLate,
    });

    expect(decodeProjectDatum(closed.project.datum!).status).toBe(
      "ProjectClosed",
    );
    expect(await pool()).toEqual({ balance: 22_000_000n, committed: 0n });
  });
});
