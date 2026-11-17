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
  poolDatum,
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
  decodePoolDatum,
  decodeProjectDatum,
  executeProject,
  projectDatum,
  projectUnit,
  spendTranche,
  type SpendTrancheOptions,
} from "./helpers/treasury";

const config = testConfig();

const secret = (index: number): string =>
  (index + 1).toString(16).padStart(2, "0").repeat(32);
const salt = "d1".repeat(32);

const ids = {
  tranched: "f1".repeat(32),
  overdue: "f2".repeat(32),
};

const evidence = ["a1".repeat(32), "a2".repeat(32)];
const milestones = [
  { amount: 3_000_000n, evidenceCommitment: evidence[0]! },
  { amount: 2_000_000n, evidenceCommitment: evidence[1]! },
];

/**
 * `SpendTranche` pays exactly the next approved milestone, needs the board and
 * the treasurer, and closes the project on the last milestone (ADR 0010 §5–§6;
 * spec §7). The pool is attested accounting, so the tranche debits both figures.
 */
describe("tranche spending", () => {
  let ledger: Ledger;
  let m1: Genesis;
  let spec: ProjectSpecTerms;

  const poolBox = (): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(poolUnit(m1.stateNftPolicy));

  const proposalBox = (id: string): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(proposalUnit(m1.governancePolicy, id));

  const spend = (
    projectId: string,
    evidenceHash: string,
    extra: Omit<SpendTrancheOptions, "projectId" | "evidenceHash"> = {},
  ) => spendTranche(ledger, m1, { projectId, evidenceHash, ...extra });

  beforeAll(async () => {
    ledger = await testLedger();
    m1 = await genesis(ledger, config);

    selectActor(ledger, "kycIssuer");
    const expiry =
      BigInt(scriptTime(ledger, ledger.emulator.now())) +
      30n * BigInt(MS_PER_DAY);
    const kyc = await issueKyc(ledger, m1, kycTerms("81", expiry));
    selectActor(ledger, "member");
    const memberBox = await joinMember(ledger, m1, { memberId: "81" }, kyc);

    const proposer = keyHash(ledger.actors.member.address);
    const start = BigInt(scriptTime(ledger, ledger.emulator.now()));
    const leaves = [eligibleLeaf(secret(0)), eligibleLeaf(secret(1))];
    spec = {
      recipientCommitment: "ab".repeat(32),
      deadline: start + 20n * BigInt(MS_PER_DAY),
      milestones,
    };
    const terms = (id: string) => ({
      id,
      proposer,
      leaves,
      start,
      payload: { kind: "Project" as const, spec },
    });

    const tranched = await createProposal(
      ledger,
      m1,
      config,
      terms(ids.tranched),
      memberBox,
      kyc,
    );
    const overdue = await createProposal(
      ledger,
      m1,
      config,
      terms(ids.overdue),
      memberBox,
      kyc,
    );

    // Casting is permissionless; the deployer pays for both ballots.
    selectActor(ledger, "deployer");
    const vote = async (proposal: UTxO) =>
      castVote(ledger, m1, proposal, {
        leaf: leaves[0]!,
        voteSecret: secret(0),
        choice: "Yes",
        salt,
      });
    const voteTranched = await vote(tranched);
    const voteOverdue = await vote(overdue);
    const fields = decodeProposalDatum((await proposalBox(ids.tranched)).datum!);
    advanceTo(ledger, Number(fields.end));
    const revealedTranched = await revealVote(ledger, m1, voteTranched, {
      choice: "Yes",
      salt,
    });
    const revealedOverdue = await revealVote(ledger, m1, voteOverdue, {
      choice: "Yes",
      salt,
    });
    const talliedTranched = await tallyProposal(
      ledger,
      m1,
      await proposalBox(ids.tranched),
      [revealedTranched],
    );
    const talliedOverdue = await tallyProposal(
      ledger,
      m1,
      await proposalBox(ids.overdue),
      [revealedOverdue],
    );
    advanceTo(ledger, Number(fields.reveal_end));
    await finalizeProposal(ledger, m1, config, talliedTranched);
    await finalizeProposal(ledger, m1, config, talliedOverdue);

    selectActor(ledger, "bankIssuer");
    await attestPool(ledger, m1, { balance: 25_000_000n });
    selectActor(ledger, "deployer");
    await executeProject(ledger, m1, await proposalBox(ids.tranched));
  }, 90_000);

  test("wrong evidence is rejected", async () => {
    selectActor(ledger, "bankIssuer");
    const failure = await expectRejected(() =>
      spend(ids.tranched, "ff".repeat(32)),
    );

    expect(String(failure)).toContain("failed script execution");
    const project = await ledger.lucid.utxoByUnit(
      projectUnit(m1.treasuryPolicy, ids.tranched),
    );
    expect(decodeProjectDatum(project.datum!).nextMilestone).toBe(0n);
  });

  test("out-of-order evidence is rejected", async () => {
    // The second milestone's evidence cannot pay the first.
    selectActor(ledger, "bankIssuer");
    const failure = await expectRejected(() => spend(ids.tranched, evidence[1]!));

    expect(String(failure)).toContain("failed script execution");
  });

  test("a missing board signature is rejected", async () => {
    selectActor(ledger, "bankIssuer");
    const failure = await expectRejected(() =>
      spend(ids.tranched, evidence[0]!, { boardSigners: 0 }),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a missing treasurer signature is rejected", async () => {
    selectActor(ledger, "deployer");
    const failure = await expectRejected(() => spend(ids.tranched, evidence[0]!));

    expect(String(failure)).toContain("failed script execution");
  });

  test("a skipped milestone is rejected", async () => {
    selectActor(ledger, "bankIssuer");
    const project = decodeProjectDatum(
      (await ledger.lucid.utxoByUnit(
        projectUnit(m1.treasuryPolicy, ids.tranched),
      )).datum!,
    );
    const failure = await expectRejected(() =>
      spend(ids.tranched, evidence[0]!, {
        projectDatum: projectDatum(ids.tranched, project.spec, 2n),
      }),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a wrong amount debit is rejected", async () => {
    selectActor(ledger, "bankIssuer");
    const failure = await expectRejected(() =>
      spend(ids.tranched, evidence[0]!, {
        poolDatum: poolDatum(21_000_000n, 2_000_000n),
      }),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a tampered project datum is rejected", async () => {
    selectActor(ledger, "bankIssuer");
    const project = decodeProjectDatum(
      (await ledger.lucid.utxoByUnit(
        projectUnit(m1.treasuryPolicy, ids.tranched),
      )).datum!,
    );
    const tampered: ProjectSpecTerms = {
      ...project.spec,
      recipientCommitment: "cd".repeat(32),
    };
    const failure = await expectRejected(() =>
      spend(ids.tranched, evidence[0]!, {
        projectDatum: projectDatum(ids.tranched, tampered, 1n),
      }),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("an insufficient balance is rejected", async () => {
    selectActor(ledger, "bankIssuer");
    await attestPool(ledger, m1, { balance: 1_000_000n });
    const failure = await expectRejected(() => spend(ids.tranched, evidence[0]!));

    expect(String(failure)).toContain("failed script execution");
    await attestPool(ledger, m1, { balance: 25_000_000n });
  });

  test("an empty bank reference is rejected", async () => {
    selectActor(ledger, "bankIssuer");
    const failure = await expectRejected(() =>
      spend(ids.tranched, evidence[0]!, { bankRefHash: "" }),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("the first tranche pays the next milestone", async () => {
    selectActor(ledger, "bankIssuer");
    const spent = await spend(ids.tranched, evidence[0]!);

    expect(decodeProjectDatum(spent.project.datum!)).toMatchObject({
      projectId: ids.tranched,
      nextMilestone: 1n,
      status: "ProjectOpen",
      spec,
    });
    expect(decodePoolDatum(spent.pool.datum!)).toEqual({
      balance: 22_000_000n,
      committed: 2_000_000n,
    });
  });

  test("a spent milestone cannot be paid again", async () => {
    selectActor(ledger, "bankIssuer");
    const failure = await expectRejected(() =>
      spend(ids.tranched, evidence[0]!),
    );

    expect(String(failure)).toContain("failed script execution");
    const project = await ledger.lucid.utxoByUnit(
      projectUnit(m1.treasuryPolicy, ids.tranched),
    );
    expect(decodeProjectDatum(project.datum!).nextMilestone).toBe(1n);
  });

  test("the last tranche closes the project and empties committed", async () => {
    selectActor(ledger, "bankIssuer");
    const spent = await spend(ids.tranched, evidence[1]!);

    expect(decodeProjectDatum(spent.project.datum!)).toMatchObject({
      nextMilestone: 2n,
      status: "ProjectClosed",
    });
    expect(decodePoolDatum(spent.pool.datum!)).toEqual({
      balance: 20_000_000n,
      committed: 0n,
    });
    expect(decodePoolDatum((await poolBox()).datum!)).toEqual({
      balance: 20_000_000n,
      committed: 0n,
    });
  });

  test("a closed project cannot spend", async () => {
    selectActor(ledger, "bankIssuer");
    const failure = await expectRejected(() =>
      spend(ids.tranched, evidence[1]!),
    );

    expect(String(failure)).toContain("failed script execution");
    const project = await ledger.lucid.utxoByUnit(
      projectUnit(m1.treasuryPolicy, ids.tranched),
    );
    expect(decodeProjectDatum(project.datum!).status).toBe("ProjectClosed");
  });

  test("a late tranche is rejected", async () => {
    selectActor(ledger, "deployer");
    await executeProject(ledger, m1, await proposalBox(ids.overdue));
    advanceTo(ledger, Number(spec.deadline) + 1_000);
    selectActor(ledger, "bankIssuer");
    const failure = await expectRejected(() => spend(ids.overdue, evidence[0]!));

    expect(String(failure)).toContain("failed script execution");
  });
});
