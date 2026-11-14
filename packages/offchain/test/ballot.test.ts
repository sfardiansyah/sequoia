import { beforeAll, describe, expect, test } from "bun:test";
import type { UTxO } from "@lucid-evolution/lucid";
import { eligibleLeaf, MS_PER_DAY, nullifier } from "../src/governance";
import {
  advanceTo,
  castVote,
  decodeVoteDatum,
  discardVote,
  revealVote,
  voteUnit,
} from "./helpers/ballot";
import { issueKyc, kycTerms } from "./helpers/kyc";
import {
  genesis,
  keyHash,
  testLedger,
  testConfig,
  scriptTime,
  selectActor,
  expectRejected,
  type Genesis,
  type Ledger,
} from "./helpers/harness";
import { joinMember } from "./helpers/membership";
import {
  createProposal,
  decodeProposalDatum,
  proposalUnit,
  type ProposalFields,
} from "./helpers/proposal";

const config = testConfig();

const secretA = "11".repeat(32);
const secretB = "22".repeat(32);
const leafA = eligibleLeaf(secretA);
const leafB = eligibleLeaf(secretB);

const saltA = "c1".repeat(32);
const saltB = "c2".repeat(32);
const saltC = "c3".repeat(32);
const wrongSalt = "c4".repeat(32);

const ids = {
  main: "a1".repeat(32),
  discard: "a2".repeat(32),
  earlyDiscard: "a3".repeat(32),
  lateCast: "a4".repeat(32),
  ineligible: "a5".repeat(32),
  abstain: "a6".repeat(32),
};

type Proposals = Record<keyof typeof ids, UTxO>;

describe("ballot cast, reveal, and discard", () => {
  let ledger: Ledger;
  let m1: Genesis;
  let proposals: Proposals;
  let proposalStart: bigint;
  let voteA: UTxO;
  let voteB: UTxO;
  let discardVoteBox: UTxO;
  let earlyDiscardVote: UTxO;
  let abstainVote: UTxO;

  const proposalBox = async (id: string): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(proposalUnit(m1.governancePolicy, id));
  const proposalFields = async (id: string): Promise<ProposalFields> =>
    decodeProposalDatum((await proposalBox(id)).datum!);
  const latestEnd = (): number =>
    Math.max(
      ...Object.values(proposals).map((proposal) =>
        Number(decodeProposalDatum(proposal.datum!).end),
      ),
    );

  beforeAll(async () => {
    ledger = await testLedger();
    m1 = await genesis(ledger, config);

    selectActor(ledger, "kycIssuer");
    const expiry =
      BigInt(scriptTime(ledger, ledger.emulator.now())) + 30n * BigInt(MS_PER_DAY);
    const kycA = await issueKyc(ledger, m1, kycTerms("41", expiry));
    const kycB = await issueKyc(ledger, m1, kycTerms("42", expiry));

    selectActor(ledger, "member");
    const memberA = await joinMember(ledger, m1, { memberId: "41" }, kycA);
    await joinMember(ledger, m1, { memberId: "42" }, kycB);

    const proposer = keyHash(ledger.actors.member.address);
    const created: Partial<Proposals> = {};
    for (const key of Object.keys(ids) as (keyof typeof ids)[]) {
      proposalStart = BigInt(scriptTime(ledger, ledger.emulator.now()));
      created[key] = await createProposal(
        ledger,
        m1,
        config,
        { id: ids[key], proposer, leaves: [leafA, leafB], start: proposalStart },
        memberA,
        kycA,
      );
    }
    proposals = created as Proposals;
  }, 60_000);

  test("casts copy deadlines and record one nullifier each", async () => {
    voteA = await castVote(ledger, m1, proposals.main, {
      leaf: leafA,
      voteSecret: secretA,
      choice: "Yes",
      salt: saltA,
    });
    voteB = await castVote(ledger, m1, await proposalBox(ids.main), {
      leaf: leafB,
      voteSecret: secretB,
      choice: "No",
      salt: saltB,
    });
    abstainVote = await castVote(ledger, m1, proposals.abstain, {
      leaf: leafA,
      voteSecret: secretA,
      choice: "Abstain",
      salt: saltC,
    });
    discardVoteBox = await castVote(ledger, m1, proposals.discard, {
      leaf: leafA,
      voteSecret: secretA,
      choice: "Yes",
      salt: saltA,
    });
    earlyDiscardVote = await castVote(ledger, m1, proposals.earlyDiscard, {
      leaf: leafA,
      voteSecret: secretA,
      choice: "No",
      salt: saltB,
    });

    const fields = await proposalFields(ids.main);
    expect(fields.nullifiers).toEqual([
      nullifier(secretA, ids.main),
      nullifier(secretB, ids.main),
    ]);

    const datumA = decodeVoteDatum(voteA.datum!);
    expect(datumA.proposal_id).toBe(ids.main);
    expect(datumA.end).toBe(fields.end);
    expect(datumA.reveal_end).toBe(fields.reveal_end);
    expect(datumA.revealed).toBeNull();

    expect(voteA.assets[voteUnit(m1.ballotPolicy, nullifier(secretA, ids.main))]).toBe(
      1n,
    );
  });

  test("an ineligible leaf and a duplicate nullifier fail", async () => {
    const ineligible = await expectRejected(() =>
      castVote(ledger, m1, proposals.ineligible, {
        leaf: "ab".repeat(32),
        voteSecret: secretA,
        choice: "Yes",
        salt: saltA,
      }),
    );
    expect(ineligible).toBeInstanceOf(Error);

    const current = await proposalBox(ids.main);
    const duplicate = await expectRejected(() =>
      castVote(ledger, m1, current, {
        leaf: leafA,
        voteSecret: secretA,
        choice: "Yes",
        salt: saltA,
      }),
    );
    expect(duplicate).toBeInstanceOf(Error);
    expect((await proposalFields(ids.main)).nullifiers).toHaveLength(2);
  });

  test("a reveal before end fails", async () => {
    const failure = await expectRejected(() =>
      revealVote(ledger, m1, voteA, { choice: "Yes", salt: saltA }),
    );
    expect(failure).toBeInstanceOf(Error);
  });

  test("casts after end with a stale lower bound fail", async () => {
    advanceTo(ledger, latestEnd() + 60_000);
    const lateStart = decodeProposalDatum(proposals.lateCast.datum!).start;
    const failure = await expectRejected(() =>
      castVote(ledger, m1, proposals.lateCast, {
        leaf: leafA,
        voteSecret: secretA,
        choice: "Yes",
        salt: saltA,
        validFrom: Number(lateStart),
        validTo: ledger.emulator.now() + 60_000,
      }),
    );
    expect(failure).toBeInstanceOf(Error);
  });

  test("reveals record Yes, No, and Abstain without spending the proposal", async () => {
    // A reveal only touches its ballot, so the proposal box reference is stable.
    const proposalBefore = await proposalBox(ids.main);

    voteA = await revealVote(ledger, m1, voteA, { choice: "Yes", salt: saltA });
    voteB = await revealVote(ledger, m1, voteB, { choice: "No", salt: saltB });
    abstainVote = await revealVote(ledger, m1, abstainVote, {
      choice: "Abstain",
      salt: saltC,
    });

    expect(decodeVoteDatum(voteA.datum!).revealed).toBe("Yes");
    expect(decodeVoteDatum(voteB.datum!).revealed).toBe("No");
    expect(decodeVoteDatum(abstainVote.datum!).revealed).toBe("Abstain");

    const proposalAfter = await proposalBox(ids.main);
    expect(proposalAfter.txHash).toBe(proposalBefore.txHash);
    expect(proposalAfter.outputIndex).toBe(proposalBefore.outputIndex);
  });

  test("a wrong salt and a discard before reveal_end fail", async () => {
    const wrongSaltFailure = await expectRejected(() =>
      revealVote(ledger, m1, earlyDiscardVote, {
        choice: "No",
        salt: wrongSalt,
      }),
    );
    expect(wrongSaltFailure).toBeInstanceOf(Error);

    const currentEarly = await proposalBox(ids.earlyDiscard);
    const earlyDiscardFailure = await expectRejected(() =>
      discardVote(ledger, m1, currentEarly, earlyDiscardVote),
    );
    expect(earlyDiscardFailure).toBeInstanceOf(Error);
    expect(
      await ledger.lucid.utxoByUnit(
        voteUnit(m1.ballotPolicy, nullifier(secretA, ids.earlyDiscard)),
      ),
    ).toBeDefined();
  });

  test("a reveal after reveal_end and then a valid discard", async () => {
    const discardProposal = await proposalBox(ids.discard);
    const revealEnd = decodeProposalDatum(discardProposal.datum!).reveal_end;
    advanceTo(ledger, Number(revealEnd) + 60_000);

    const lateFailure = await expectRejected(() =>
      revealVote(ledger, m1, discardVoteBox, { choice: "Yes", salt: saltA }),
    );
    expect(lateFailure).toBeInstanceOf(Error);

    await discardVote(ledger, m1, discardProposal, discardVoteBox);

    const fields = await proposalFields(ids.discard);
    expect(fields.discarded).toBe(1n);
    expect(fields.nullifiers).toEqual([nullifier(secretA, ids.discard)]);
    expect(
      (await ledger.lucid.utxosAt(m1.ballotAddress)).some(
        (box) => box.assets[voteUnit(m1.ballotPolicy, nullifier(secretA, ids.discard))] === 1n,
      ),
    ).toBe(false);
  });
});
