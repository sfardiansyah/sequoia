import { Constr, Data, type UTxO } from "@lucid-evolution/lucid";
import { choiceCommitment, nullifier } from "../../src/governance";
import { encode, scriptTime, submitTx, type Genesis, type M1Ledger } from "./m1";
import {
  decodeProposalDatum,
  withDiscarded,
  withNullifier,
} from "./proposal";

/**
 * Ballot and governance actions (ADR 0009 §5). Reveal is self-contained: it
 * attaches only the ballot validator and reads no proposal or config.
 */

export const VOTE_MIN_LOVELACE = 3_000_000n;

export type ChoiceName = "Yes" | "No" | "Abstain";

export const CHOICE_INDEX: Record<ChoiceName, number> = {
  Yes: 0,
  No: 1,
  Abstain: 2,
};

// Constructor order of `BallotRedeemer` in `contracts/lib/sequoia/ballot_rules.ak`.
export const BALLOT_CAST = 0;
export const BALLOT_REVEAL = 1;
export const BALLOT_DISCARD = 2;

// Constructor order of `GovernanceRedeemer` in `contracts/lib/sequoia/types.ak`.
export const GOVERNANCE_CAST = 0;
export const GOVERNANCE_DISCARD = 1;

const choiceSchema = Data.Enum([
  Data.Literal("Yes"),
  Data.Literal("No"),
  Data.Literal("Abstain"),
]);

const voteDatumSchema = Data.Object({
  proposal_id: Data.Bytes(),
  end: Data.Integer(),
  reveal_end: Data.Integer(),
  choice_commitment: Data.Bytes(),
  revealed: Data.Nullable(choiceSchema),
});

export function voteDatum(
  proposalId: string,
  end: bigint,
  revealEnd: bigint,
  commitment: string,
): string {
  return encode(
    {
      proposal_id: proposalId,
      end,
      reveal_end: revealEnd,
      choice_commitment: commitment,
      revealed: null,
    },
    voteDatumSchema,
  );
}

export function revealedDatum(datum: string, choice: ChoiceName): string {
  const old = Data.from(datum, voteDatumSchema) as Record<string, unknown>;
  return encode({ ...old, revealed: choice }, voteDatumSchema);
}

export type VoteFields = {
  proposal_id: string;
  end: bigint;
  reveal_end: bigint;
  choice_commitment: string;
  revealed: ChoiceName | null;
};

export function decodeVoteDatum(datum: string): VoteFields {
  return Data.from(datum, voteDatumSchema) as unknown as VoteFields;
}

export const ballotCast = (leaf: string): string =>
  Data.to(new Constr(BALLOT_CAST, [leaf]));

export const ballotReveal = (choice: ChoiceName, salt: string): string =>
  Data.to(new Constr(BALLOT_REVEAL, [new Constr(CHOICE_INDEX[choice], []), salt]));

export const ballotDiscard = Data.to(new Constr(BALLOT_DISCARD, []));

export const governanceCast = Data.to(new Constr(GOVERNANCE_CAST, []));

export const governanceDiscard = Data.to(new Constr(GOVERNANCE_DISCARD, []));

export function voteUnit(ballotPolicy: string, voteNullifier: string): string {
  return ballotPolicy + voteNullifier;
}

function voteUnitOf(voteBox: UTxO): string {
  const unit = Object.keys(voteBox.assets).find((key) => key !== "lovelace");
  if (unit === undefined) throw new Error("vote box holds no VOTE token");
  return unit;
}

/** Advance the emulator clock to at least `time` (unix ms). */
export function advanceTo(ledger: M1Ledger, time: number): void {
  const delta = time - ledger.emulator.now();
  if (delta > 0) {
    ledger.emulator.awaitSlot(Math.ceil(delta / 1_000));
  }
}

export type CastOptions = {
  leaf: string;
  voteSecret: string;
  choice: ChoiceName;
  salt: string;
  validFrom?: number;
  validTo?: number;
};

/** Cast mints the VOTE NFT and spends the proposal to append its nullifier. */
export async function castVote(
  ledger: M1Ledger,
  m1: Genesis,
  proposalBox: UTxO,
  options: CastOptions,
): Promise<UTxO> {
  const proposal = decodeProposalDatum(proposalBox.datum!);
  const voteNullifier = nullifier(options.voteSecret, proposal.id);
  const unit = voteUnit(m1.ballotPolicy, voteNullifier);
  const now = scriptTime(ledger, ledger.emulator.now());
  const commitment = choiceCommitment(
    CHOICE_INDEX[options.choice],
    options.salt,
  );

  const tx = await ledger.lucid
    .newTx()
    .collectFrom([proposalBox], governanceCast)
    .readFrom([m1.configUtxo])
    .attach.SpendingValidator(m1.governanceValidator)
    .attach.MintingPolicy(m1.ballotValidator)
    .validFrom(options.validFrom ?? now)
    .validTo(options.validTo ?? now + 60_000)
    .mintAssets({ [unit]: 1n }, ballotCast(options.leaf))
    .pay.ToContract(
      m1.ballotAddress,
      {
        kind: "inline",
        value: voteDatum(
          proposal.id,
          proposal.end,
          proposal.reveal_end,
          commitment,
        ),
      },
      { lovelace: VOTE_MIN_LOVELACE, [unit]: 1n },
    )
    .pay.ToContract(
      m1.governanceAddress,
      { kind: "inline", value: withNullifier(proposalBox.datum!, voteNullifier) },
      proposalBox.assets,
    )
    .complete();
  await submitTx(tx);
  ledger.emulator.awaitBlock(1);
  return ledger.lucid.utxoByUnit(unit);
}

export type RevealOptions = {
  choice: ChoiceName;
  salt: string;
  validFrom?: number;
  validTo?: number;
};

/** Reveal spends only the vote box; no proposal or config reference. */
export async function revealVote(
  ledger: M1Ledger,
  m1: Genesis,
  voteBox: UTxO,
  options: RevealOptions,
): Promise<UTxO> {
  const unit = voteUnitOf(voteBox);
  const now = scriptTime(ledger, ledger.emulator.now());

  const tx = await ledger.lucid
    .newTx()
    .collectFrom([voteBox], ballotReveal(options.choice, options.salt))
    .attach.SpendingValidator(m1.ballotValidator)
    .validFrom(options.validFrom ?? now)
    .validTo(options.validTo ?? now + 60_000)
    .pay.ToContract(
      m1.ballotAddress,
      { kind: "inline", value: revealedDatum(voteBox.datum!, options.choice) },
      voteBox.assets,
    )
    .complete();
  await submitTx(tx);
  ledger.emulator.awaitBlock(1);
  return ledger.lucid.utxoByUnit(unit);
}

export type DiscardOptions = {
  validFrom?: number;
  validTo?: number;
};

/** Discard burns the unrevealed vote and records it on the proposal. */
export async function discardVote(
  ledger: M1Ledger,
  m1: Genesis,
  proposalBox: UTxO,
  voteBox: UTxO,
  options: DiscardOptions = {},
): Promise<void> {
  const unit = voteUnitOf(voteBox);
  const now = scriptTime(ledger, ledger.emulator.now());

  const tx = await ledger.lucid
    .newTx()
    .collectFrom([proposalBox], governanceDiscard)
    .collectFrom([voteBox], ballotDiscard)
    .readFrom([m1.configUtxo])
    .attach.SpendingValidator(m1.governanceValidator)
    .attach.SpendingValidator(m1.ballotValidator)
    .attach.MintingPolicy(m1.ballotValidator)
    .validFrom(options.validFrom ?? now)
    .validTo(options.validTo ?? now + 60_000)
    .mintAssets({ [unit]: -1n }, ballotDiscard)
    .pay.ToContract(
      m1.governanceAddress,
      { kind: "inline", value: withDiscarded(proposalBox.datum!) },
      proposalBox.assets,
    )
    .complete();
  await submitTx(tx);
  ledger.emulator.awaitBlock(1);
}
