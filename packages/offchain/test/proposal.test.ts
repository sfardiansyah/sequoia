import { beforeAll, describe, expect, test } from "bun:test";
import { Data, type UTxO } from "@lucid-evolution/lucid";
import { eligibleLeaf, MS_PER_DAY } from "../src/governance";
import {
  advanceTo,
  castVote,
  finalizeProposal,
  revealVote,
  tallyProposal,
} from "./helpers/ballot";
import { issueKyc, kycTerms } from "./helpers/kyc";
import {
  genesis,
  keyHash,
  testLedger,
  testConfig,
  scriptTime,
  selectActor,
  type Genesis,
  type Ledger,
} from "./helpers/harness";
import { joinMember, memberUnit } from "./helpers/membership";
import {
  createProposal,
  decodeProposalDatum,
  PROPOSAL_MIN_LOVELACE,
  proposalUnit,
} from "./helpers/proposal";

const config = testConfig();
const memberId = "41";
const proposalId = "cd".repeat(32);
const projectProposalId = "ce".repeat(32);
const cancelProposalId = "cf".repeat(32);
const voteSecret = "11".repeat(32);
const voteSalt = "d1".repeat(32);

const leafOf = (index: number): string =>
  eligibleLeaf(index.toString(16).padStart(2, "0").repeat(32));

const asConstr = (value: unknown) =>
  value as { index: number; fields: unknown[] };

describe("governance proposal creation", () => {
  let ledger: Ledger;
  let m1: Genesis;
  let memberBox: UTxO;
  let kycBox: UTxO;

  beforeAll(async () => {
    ledger = await testLedger();
    m1 = await genesis(ledger, config);

    selectActor(ledger, "kycIssuer");
    const kyc = await issueKyc(
      ledger,
      m1,
      kycTerms(memberId, BigInt(ledger.emulator.now()) + 3_600_000n),
    );
    selectActor(ledger, "member");
    await joinMember(ledger, m1, { memberId }, kyc);

    memberBox = (await ledger.lucid.utxosAt(m1.membershipAddress)).find(
      (box) => box.assets[memberUnit(m1.membershipPolicy, memberId)] === 1n,
    )!;
    kycBox = (await ledger.lucid.utxosAt(m1.kycAddress)).find(
      (box) => box.assets[m1.kycPolicy + memberId] === 1n,
    )!;
    expect(memberBox).toBeDefined();
    expect(kycBox).toBeDefined();
  });

  test("a board-signed proposal is recorded", async () => {
    const start = BigInt(scriptTime(ledger, ledger.emulator.now()));
    const proposer = keyHash(await ledger.lucid.wallet().address());
    const leaf = eligibleLeaf(voteSecret);
    const unit = proposalUnit(m1.governancePolicy, proposalId);
    const box = await createProposal(
      ledger,
      m1,
      config,
      { id: proposalId, proposer, leaves: [leaf], start },
      memberBox,
      kycBox,
    );

    const boxes = await ledger.lucid.utxosAt(m1.governanceAddress);
    expect(boxes).toHaveLength(1);
    expect(box.assets).toEqual({
      lovelace: PROPOSAL_MIN_LOVELACE,
      [unit]: 1n,
    });

    const decoded = Data.from(box.datum!) as {
      index: number;
      fields: unknown[];
    };
    const constr = (value: unknown) =>
      value as { index: number; fields: unknown[] };

    expect(decoded.index).toBe(0);
    expect(decoded.fields).toHaveLength(15);
    expect(decoded.fields[0]).toBe(proposalId);
    expect(decoded.fields[1]).toBe(proposer);
    // The payload's constructor is the kind: a `Config` wrapping one config datum.
    const payload = constr(decoded.fields[2]);
    expect(payload.index).toBe(0);
    expect(payload.fields).toHaveLength(1);
    const proposedConfig = constr(payload.fields[0]);
    expect(proposedConfig.fields.slice(0, 5)).toEqual([
      2026n,
      1_000_000n,
      7_000n,
      3_000n,
      5_000n,
    ]);
    expect(proposedConfig.fields[5]).toEqual(ledger.roles.boardKeys);
    expect(proposedConfig.fields[6]).toBe(2n);
    expect(proposedConfig.fields.slice(13, 21)).toEqual([
      m1.governancePolicy,
      m1.ballotPolicy,
      5_000n,
      5_001n,
      6_667n,
      7n,
      7n,
      3n,
    ]);
    expect(decoded.fields[3]).toEqual([leaf]);
    expect(decoded.fields[4]).toBe(start);
    expect(decoded.fields[5]).toBe(
      start + config.votingDays * BigInt(MS_PER_DAY),
    );
    expect(decoded.fields[6]).toBe(
      start + (config.votingDays + config.revealDays) * BigInt(MS_PER_DAY),
    );
    expect(decoded.fields.slice(7, 13)).toEqual([[], 0n, 0n, 0n, 0n, 0n]);
    expect(constr(decoded.fields[13])).toEqual({ index: 0, fields: [] });
    expect(constr(decoded.fields[14])).toEqual({ index: 1, fields: [] });
  });

  // The project and cancel kinds carry their own payloads; only the kind tag
  // selects the finalize threshold (ADR 0010 §3).
  let projectBox: UTxO;
  let cancelBox: UTxO;
  const projectLeaves = [leafOf(30), leafOf(31), leafOf(32)];
  const cancelLeaves = [leafOf(33)];

  const proposalBox = (id: string): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(proposalUnit(m1.governancePolicy, id));

  const currentBox = async (id: string) =>
    decodeProposalDatum((await proposalBox(id)).datum!);

  test("a project proposal is recorded with its milestones", async () => {
    const start = BigInt(scriptTime(ledger, ledger.emulator.now()));
    const proposer = keyHash(await ledger.lucid.wallet().address());
    const revealEnd =
      start + (config.votingDays + config.revealDays) * BigInt(MS_PER_DAY);
    const deadline = revealEnd + 1n;
    const milestones = [
      { amount: 1_000_000n, evidenceCommitment: "ab".repeat(32) },
      { amount: 500_000n, evidenceCommitment: "bc".repeat(32) },
    ];

    projectBox = await createProposal(
      ledger,
      m1,
      config,
      {
        id: projectProposalId,
        proposer,
        leaves: projectLeaves,
        start,
        payload: {
          kind: "Project",
          spec: {
            recipientCommitment: "ed".repeat(32),
            deadline,
            milestones,
          },
        },
      },
      memberBox,
      kycBox,
    );

    const decoded = Data.from(projectBox.datum!) as { fields: unknown[] };
    const payload = asConstr(decoded.fields[2]);
    expect(payload.index).toBe(1);
    const spec = asConstr(payload.fields[0]);
    expect(spec.fields[0]).toBe("ed".repeat(32));
    expect(spec.fields[1]).toBe(deadline);
    expect((spec.fields[2] as unknown[]).map(asConstr)).toEqual([
      { index: 0, fields: [1_000_000n, "ab".repeat(32)] },
      { index: 0, fields: [500_000n, "bc".repeat(32)] },
    ]);
    expect(decodeProposalDatum(projectBox.datum!).kind).toBe("Project");
  });

  test("a cancel proposal records its target project", async () => {
    const start = BigInt(scriptTime(ledger, ledger.emulator.now()));
    const proposer = keyHash(await ledger.lucid.wallet().address());

    cancelBox = await createProposal(
      ledger,
      m1,
      config,
      {
        id: cancelProposalId,
        proposer,
        leaves: cancelLeaves,
        start,
        payload: { kind: "Cancel", projectId: projectProposalId },
      },
      memberBox,
      kycBox,
    );

    const decoded = Data.from(cancelBox.datum!) as { fields: unknown[] };
    const payload = asConstr(decoded.fields[2]);
    expect(payload.index).toBe(2);
    expect(payload.fields[0]).toBe(projectProposalId);
    expect(decodeProposalDatum(cancelBox.datum!).kind).toBe("Cancel");
  });

  test("project and cancel proposals finalize on the project threshold", async () => {
    selectActor(ledger, "deployer");

    const projectVotes: UTxO[] = [];
    const projectChoices = ["Yes", "Yes", "No"] as const;
    for (const [index, choice] of projectChoices.entries()) {
      projectVotes.push(
        await castVote(ledger, m1, await proposalBox(projectProposalId), {
          leaf: leafOf(30 + index),
          voteSecret: (30 + index).toString(16).padStart(2, "0").repeat(32),
          choice,
          salt: voteSalt,
        }),
      );
    }
    let cancelVote = await castVote(
      ledger,
      m1,
      await proposalBox(cancelProposalId),
      {
        leaf: leafOf(33),
        voteSecret: "21".repeat(32),
        choice: "Yes",
        salt: voteSalt,
      },
    );

    // Reveal opens once the voting window closes and closes at `reveal_end`.
    const ends = [
      (await currentBox(projectProposalId)).end,
      (await currentBox(cancelProposalId)).end,
    ];
    advanceTo(
      ledger,
      Number(ends.reduce((max, end) => (end > max ? end : max))),
    );

    for (const [index, choice] of projectChoices.entries()) {
      projectVotes[index] = await revealVote(ledger, m1, projectVotes[index]!, {
        choice,
        salt: voteSalt,
      });
    }
    cancelVote = await revealVote(ledger, m1, cancelVote, {
      choice: "Yes",
      salt: voteSalt,
    });

    await tallyProposal(
      ledger,
      m1,
      await proposalBox(projectProposalId),
      projectVotes,
    );
    await tallyProposal(
      ledger,
      m1,
      await proposalBox(cancelProposalId),
      [cancelVote],
    );

    const revealEnds = [
      (await currentBox(projectProposalId)).reveal_end,
      (await currentBox(cancelProposalId)).reveal_end,
    ];
    advanceTo(
      ledger,
      Number(revealEnds.reduce((max, end) => (end > max ? end : max))),
    );

    const project = await finalizeProposal(
      ledger,
      m1,
      config,
      await proposalBox(projectProposalId),
    );
    const cancel = await finalizeProposal(
      ledger,
      m1,
      config,
      await proposalBox(cancelProposalId),
    );

    // 2-of-3 passes at `project_threshold_bps` (5001) and would fail at the
    // structural 6667, so this proves the kind selects the threshold.
    expect(decodeProposalDatum(project.datum!).status).toBe("Passed");
    expect(decodeProposalDatum(project.datum!).kind).toBe("Project");
    expect(decodeProposalDatum(cancel.datum!).status).toBe("Passed");
    expect(decodeProposalDatum(cancel.datum!).kind).toBe("Cancel");
  });
});
