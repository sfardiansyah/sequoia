import { beforeAll, describe, expect, test } from "bun:test";
import type { UTxO } from "@lucid-evolution/lucid";
import {
  eligibleLeaf,
  MAX_TALLY_BATCH,
  MS_PER_DAY,
} from "../src/governance";
import {
  advanceTo,
  castVote,
  decodeVoteDatum,
  discardVote,
  finalizeProposal,
  revealVote,
  tallyProposal,
  type ChoiceName,
} from "./helpers/ballot";
import { issueKyc, kycTerms } from "./helpers/kyc";
import {
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
import { joinMember } from "./helpers/membership";
import {
  createProposal,
  decodeProposalDatum,
  proposalUnit,
} from "./helpers/proposal";

const config = m1TestConfig();

const secret = (index: number): string =>
  (index + 1).toString(16).padStart(2, "0").repeat(32);
const salt = "d1".repeat(32);

const ids = {
  batch: "b1".repeat(32),
  twoOfThree: "b2".repeat(32),
  threeOfFour: "b3".repeat(32),
  quorumShort: "b4".repeat(32),
  missingTally: "b5".repeat(32),
  noVotes: "b6".repeat(32),
  liveConfig: "b7".repeat(32),
};

type Vote = {
  box: UTxO;
  index: number;
  choice: ChoiceName;
};

const choices = {
  batch: [
    "Yes",
    "Yes",
    "Yes",
    "Yes",
    "Yes",
    "Yes",
    "Yes",
    "Yes",
    "No",
    "No",
    "Abstain",
  ] as ChoiceName[],
  twoOfThree: ["Yes", "Yes", "No"] as ChoiceName[],
  threeOfFour: ["Yes", "Yes", "Yes", "No"] as ChoiceName[],
  quorumShort: ["Yes", "Yes"] as ChoiceName[],
  missingTally: ["Yes", "Yes"] as ChoiceName[],
  noVotes: ["No"] as ChoiceName[],
  liveConfig: ["Yes", "Yes"] as ChoiceName[],
};

describe("batched tally and finalize", () => {
  let ledger: M1Ledger;
  let m1: Genesis;
  let leaves: string[];
  let proposals: Record<keyof typeof ids, UTxO>;
  let votes: Record<keyof typeof ids, Vote[]>;

  const proposalBox = async (key: keyof typeof ids): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(
      proposalUnit(m1.governancePolicy, ids[key]),
    );

  beforeAll(async () => {
    ledger = await m1Ledger();
    m1 = await genesis(ledger, config);
    leaves = Array.from({ length: 11 }, (_, index) =>
      eligibleLeaf(secret(index)),
    );

    selectActor(ledger, "kycIssuer");
    const expiry =
      BigInt(scriptTime(ledger, ledger.emulator.now())) +
      30n * BigInt(MS_PER_DAY);
    const kyc = await issueKyc(ledger, m1, kycTerms("51", expiry));
    selectActor(ledger, "member");
    const memberBox = await joinMember(ledger, m1, { memberId: "51" }, kyc);
    const proposer = keyHash(ledger.actors.member.address);

    const counts = {
      batch: 11,
      twoOfThree: 3,
      threeOfFour: 4,
      quorumShort: 5,
      missingTally: 2,
      noVotes: 1,
      liveConfig: 5,
    };
    const created = {} as Record<keyof typeof ids, UTxO>;
    for (const key of Object.keys(ids) as (keyof typeof ids)[]) {
      const start = BigInt(scriptTime(ledger, ledger.emulator.now()));
      const proposalConfig =
        key === "liveConfig"
          ? { ...config, quorumBps: 1n, structuralThresholdBps: 1n }
          : config;
      created[key] = await createProposal(
        ledger,
        m1,
        proposalConfig,
        { id: ids[key], proposer, leaves: leaves.slice(0, counts[key]), start },
        memberBox,
        kyc,
      );
    }
    proposals = created;
    // Casting is permissionless; the deployer pays for the many vote boxes.
    selectActor(ledger, "deployer");
    votes = {
      batch: [],
      twoOfThree: [],
      threeOfFour: [],
      quorumShort: [],
      missingTally: [],
      noVotes: [],
      liveConfig: [],
    };
  }, 60_000);

  test("casts 11 and other batches", async () => {
    for (const key of Object.keys(ids) as (keyof typeof ids)[]) {
      let proposal = proposals[key];
      for (let index = 0; index < choices[key].length; index += 1) {
        const vote = await castVote(ledger, m1, proposal, {
          leaf: leaves[index]!,
          voteSecret: secret(index),
          choice: choices[key][index]!,
          salt,
        });
        votes[key].push({ box: vote, index, choice: choices[key][index]! });
        proposal = await proposalBox(key);
      }
      proposals[key] = proposal;
    }

    expect(decodeProposalDatum(proposals.batch.datum!).nullifiers).toHaveLength(
      11,
    );
  }, 60_000);

  test("reveals every ballot and rejects an early finalize", async () => {
    const latestEnd = Math.max(
      ...Object.values(proposals).map((proposal) =>
        Number(decodeProposalDatum(proposal.datum!).end),
      ),
    );
    advanceTo(ledger, latestEnd + 60_000);

    for (const key of Object.keys(ids) as (keyof typeof ids)[]) {
      if (key === "noVotes") continue;
      const revealed: Vote[] = [];
      for (const vote of votes[key]) {
        revealed.push({
          ...vote,
          box: await revealVote(ledger, m1, vote.box, {
            choice: vote.choice,
            salt,
          }),
        });
      }
      votes[key] = revealed;
      // Touching one vote per key keeps the proposal box current.
      proposals[key] = await proposalBox(key);
    }

    expect(
      decodeVoteDatum(votes.batch[0]!.box.datum!).revealed,
    ).toBe("Yes");
    expect(
      decodeVoteDatum(votes.threeOfFour[3]!.box.datum!).revealed,
    ).toBe("No");

    const early = await expectRejected(() =>
      finalizeProposal(ledger, m1, config, proposals.threeOfFour),
    );
    expect(early).toBeInstanceOf(Error);
  }, 60_000);

  test("tallies 10 then 1, and refuses batches over the cap", async () => {
    const allBatch = votes.batch.map((vote) => vote.box);
    const oversized = await expectRejected(() =>
      tallyProposal(ledger, m1, proposals.batch, allBatch),
    );
    expect(oversized).toBeInstanceOf(Error);

    const mixed = await expectRejected(() =>
      tallyProposal(ledger, m1, proposals.batch, [
        allBatch[0]!,
        votes.twoOfThree[0]!.box,
      ]),
    );
    expect(mixed).toBeInstanceOf(Error);

    const unrevealed = await expectRejected(() =>
      tallyProposal(ledger, m1, proposals.noVotes, [votes.noVotes[0]!.box], {
        counts: { count: 1n, yes: 0n, no: 1n, abstain: 0n },
      }),
    );
    expect(unrevealed).toBeInstanceOf(Error);

    const first = allBatch.slice(0, MAX_TALLY_BATCH);
    let batchProposal = await tallyProposal(
      ledger,
      m1,
      proposals.batch,
      first,
    );
    let fields = decodeProposalDatum(batchProposal.datum!);
    expect({
      tallied: fields.tallied,
      yes: fields.yes,
      no: fields.no,
      abstain: fields.abstain,
    }).toEqual({ tallied: 10n, yes: 8n, no: 2n, abstain: 0n });

    const burned = await expectRejected(() =>
      tallyProposal(ledger, m1, batchProposal, [allBatch[0]!]),
    );
    expect(burned).toBeInstanceOf(Error);

    batchProposal = await tallyProposal(
      ledger,
      m1,
      batchProposal,
      allBatch.slice(MAX_TALLY_BATCH),
    );
    fields = decodeProposalDatum(batchProposal.datum!);
    expect({
      tallied: fields.tallied,
      abstain: fields.abstain,
    }).toEqual({ tallied: 11n, abstain: 1n });
    proposals.batch = batchProposal;

    for (const key of [
      "twoOfThree",
      "threeOfFour",
      "quorumShort",
      "liveConfig",
    ] as const) {
      proposals[key] = await tallyProposal(
        ledger,
        m1,
        proposals[key],
        votes[key].map((vote) => vote.box),
      );
    }
    proposals.missingTally = await tallyProposal(
      ledger,
      m1,
      proposals.missingTally,
      [votes.missingTally[0]!.box],
    );
  }, 60_000);

  test("finalizes passed, rejected, and missing-ballot proposals", async () => {
    const latestRevealEnd = Math.max(
      ...Object.values(proposals).map((proposal) =>
        Number(decodeProposalDatum(proposal.datum!).reveal_end),
      ),
    );
    advanceTo(ledger, latestRevealEnd + 60_000);

    const validTo = ledger.emulator.now() + 60_000;
    const batch = await finalizeProposal(ledger, m1, config, proposals.batch, {
      validTo,
    });
    const batchFields = decodeProposalDatum(batch.datum!);
    expect(batchFields.status).toBe("Passed");
    expect(batchFields.finalizedAt).toBe(BigInt(scriptTime(ledger, validTo)));

    const twoOfThree = decodeProposalDatum(
      (await finalizeProposal(ledger, m1, config, proposals.twoOfThree)).datum!,
    );
    expect(twoOfThree.status).toBe("Rejected");
    expect(twoOfThree.finalizedAt).not.toBeNull();
    expect(
      decodeProposalDatum(
        (await finalizeProposal(ledger, m1, config, proposals.threeOfFour))
          .datum!,
      ).status,
    ).toBe("Passed");
    expect(
      decodeProposalDatum(
        (await finalizeProposal(ledger, m1, config, proposals.quorumShort))
          .datum!,
      ).status,
    ).toBe("Rejected");
    // The proposed config lowers the bar; finalize must use the live config.
    expect(
      decodeProposalDatum(
        (await finalizeProposal(ledger, m1, config, proposals.liveConfig))
          .datum!,
      ).status,
    ).toBe("Rejected");

    const missing = await expectRejected(() =>
      finalizeProposal(ledger, m1, config, proposals.missingTally),
    );
    expect(missing).toBeInstanceOf(Error);

    expect(
      decodeProposalDatum(proposals.noVotes.datum!).nullifiers,
    ).toHaveLength(1);
    await discardVote(
      ledger,
      m1,
      proposals.noVotes,
      votes.noVotes[0]!.box,
    );
    const noVotes = await finalizeProposal(
      ledger,
      m1,
      config,
      await proposalBox("noVotes"),
    );
    expect(decodeProposalDatum(noVotes.datum!).status).toBe("Rejected");
  }, 60_000);
});
