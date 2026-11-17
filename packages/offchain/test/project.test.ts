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
  PROJECT_MIN_LOVELACE,
  attestPool,
  decodePoolDatum,
  decodeProjectDatum,
  executeProject,
  projectUnit,
} from "./helpers/treasury";

const config = testConfig();

const secret = (index: number): string =>
  (index + 1).toString(16).padStart(2, "0").repeat(32);
const salt = "d1".repeat(32);

const ids = {
  passed: "e1".repeat(32),
  rejected: "e2".repeat(32),
  open: "e3".repeat(32),
};

const recipientCommitment = "ab".repeat(32);
const evidence = ["a1".repeat(32), "a2".repeat(32)];
const milestones = [
  { amount: 3_000_000n, evidenceCommitment: evidence[0]! },
  { amount: 2_000_000n, evidenceCommitment: evidence[1]! },
];

/**
 * Executing a passed `Project` proposal creates the project box and reserves
 * the budget (ADR 0010 §1, §4; spec §7). The pool is attested accounting, so
 * `committed` is the only money that moves at approval.
 */
describe("project execution", () => {
  let ledger: Ledger;
  let m1: Genesis;
  let passed: UTxO;
  let rejected: UTxO;
  let open: UTxO;
  let spec: ProjectSpecTerms;

  const poolBox = (): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(poolUnit(m1.stateNftPolicy));

  const proposalBox = (id: string): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(proposalUnit(m1.governancePolicy, id));

  beforeAll(async () => {
    ledger = await testLedger();
    m1 = await genesis(ledger, config);

    selectActor(ledger, "kycIssuer");
    const expiry =
      BigInt(scriptTime(ledger, ledger.emulator.now())) +
      30n * BigInt(MS_PER_DAY);
    const kyc = await issueKyc(ledger, m1, kycTerms("71", expiry));
    selectActor(ledger, "member");
    const memberBox = await joinMember(ledger, m1, { memberId: "71" }, kyc);

    const proposer = keyHash(ledger.actors.member.address);
    const start = BigInt(scriptTime(ledger, ledger.emulator.now()));
    const leaves = [eligibleLeaf(secret(0)), eligibleLeaf(secret(1))];
    spec = {
      recipientCommitment,
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

    passed = await createProposal(
      ledger,
      m1,
      config,
      terms(ids.passed),
      memberBox,
      kyc,
    );
    rejected = await createProposal(
      ledger,
      m1,
      config,
      terms(ids.rejected),
      memberBox,
      kyc,
    );
    open = await createProposal(
      ledger,
      m1,
      config,
      terms(ids.open),
      memberBox,
      kyc,
    );

    // Casting is permissionless; the deployer pays for the ballot.
    selectActor(ledger, "deployer");
    const vote = await castVote(ledger, m1, passed, {
      leaf: leaves[0]!,
      voteSecret: secret(0),
      choice: "Yes",
      salt,
    });
    const fields = decodeProposalDatum((await proposalBox(ids.passed)).datum!);
    advanceTo(ledger, Number(fields.end));
    const revealed = await revealVote(ledger, m1, vote, { choice: "Yes", salt });
    const tallied = await tallyProposal(
      ledger,
      m1,
      await proposalBox(ids.passed),
      [revealed],
    );
    advanceTo(ledger, Number(fields.reveal_end));
    passed = await finalizeProposal(ledger, m1, config, tallied);
    rejected = await finalizeProposal(ledger, m1, config, rejected);

    expect(decodeProposalDatum(passed.datum!).status).toBe("Passed");
    expect(decodeProposalDatum(rejected.datum!).status).toBe("Rejected");
  }, 60_000);

  test("an unfunded pool rejects the execution", async () => {
    const failure = await expectRejected(() =>
      executeProject(ledger, m1, passed),
    );

    expect(String(failure)).toContain("failed script execution");
    expect(decodePoolDatum((await poolBox()).datum!)).toEqual({
      balance: 0n,
      committed: 0n,
    });
    // The vote survives a failed execution, so a top-up can be retried.
    expect(decodeProposalDatum((await proposalBox(ids.passed)).datum!).status).toBe(
      "Passed",
    );
  });

  test("the treasurer funds the pool", async () => {
    selectActor(ledger, "bankIssuer");
    await attestPool(ledger, m1, { balance: 25_000_000n });
    selectActor(ledger, "deployer");
  });

  test("a tampered spec is rejected", async () => {
    // Same budget, different recipient: only the spec equality can fail.
    const tampered: ProjectSpecTerms = {
      ...spec,
      recipientCommitment: "cd".repeat(32),
    };
    const failure = await expectRejected(() =>
      executeProject(ledger, m1, passed, { spec: tampered }),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a second PROJECT name is rejected", async () => {
    const failure = await expectRejected(() =>
      executeProject(ledger, m1, passed, {
        extraMint: { name: "ef".repeat(32), quantity: 1n },
      }),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("an open proposal cannot execute", async () => {
    const failure = await expectRejected(() =>
      executeProject(ledger, m1, open),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a rejected proposal cannot execute", async () => {
    const failure = await expectRejected(() =>
      executeProject(ledger, m1, rejected),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a passed project reserves the budget and writes the project box", async () => {
    const executed = await executeProject(ledger, m1, passed);
    const unit = projectUnit(m1.treasuryPolicy, ids.passed);

    expect(executed.project.address).toBe(m1.treasuryAddress);
    expect(executed.project.assets[unit]).toBe(1n);
    expect(executed.project.assets.lovelace).toBe(PROJECT_MIN_LOVELACE);

    const project = decodeProjectDatum(executed.project.datum!);
    expect(project.projectId).toBe(ids.passed);
    expect(project.nextMilestone).toBe(0n);
    expect(project.status).toBe("ProjectOpen");
    expect(project.spec).toEqual(spec);

    expect(decodePoolDatum(executed.pool.datum!)).toEqual({
      balance: 25_000_000n,
      committed: 5_000_000n,
    });
    expect(decodeProposalDatum(executed.proposal.datum!).status).toBe(
      "Executed",
    );
  });

  test("a second execution fails", async () => {
    const executed = await proposalBox(ids.passed);
    const failure = await expectRejected(() =>
      executeProject(ledger, m1, executed),
    );

    expect(failure).toBeInstanceOf(Error);
  });
});
