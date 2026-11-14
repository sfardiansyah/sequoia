import { Constr, Data, type UTxO } from "@lucid-evolution/lucid";
import { endOfReveal, endOfVoting } from "../../src/governance";
import {
  configDatumFields,
  configDatumSchema,
  encode,
  policyHashes,
  submitWithBoard,
  type Genesis,
  type Ledger,
  type Roles,
  type PolicyHashes,
  type TestConfig,
} from "./harness";

/** Minimum ADA the proposal box holds; datum order mirrors types.ak. */
export const PROPOSAL_MIN_LOVELACE = 5_000_000n;

const proposalDatumSchema = Data.Object({
  id: Data.Bytes(),
  proposer: Data.Bytes(),
  // Lucid's Data.Enum needs at least two literals; `Config` is index 0 and the
  // only kind M2 accepts.
  kind: Data.Enum([Data.Literal("Config"), Data.Literal("Unused")]),
  proposed_config: configDatumSchema,
  eligible_leaves: Data.Array(Data.Bytes()),
  start: Data.Integer(),
  end: Data.Integer(),
  reveal_end: Data.Integer(),
  nullifiers: Data.Array(Data.Bytes()),
  discarded: Data.Integer(),
  tallied: Data.Integer(),
  yes: Data.Integer(),
  no: Data.Integer(),
  abstain: Data.Integer(),
  status: Data.Enum([
    Data.Literal("Open"),
    Data.Literal("Passed"),
    Data.Literal("Rejected"),
    Data.Literal("Executed"),
  ]),
  finalized_at: Data.Nullable(Data.Integer()),
});

export type ProposalTerms = {
  id: string;
  proposer: string;
  leaves: string[];
  start: bigint;
};

export function proposalDatum(
  roles: Roles,
  config: TestConfig,
  policies: PolicyHashes,
  terms: ProposalTerms,
): string {
  const end = BigInt(endOfVoting(Number(terms.start), Number(config.votingDays)));
  const revealEnd = BigInt(
    endOfReveal(Number(end), Number(config.revealDays)),
  );
  return encode(
    {
      id: terms.id,
      proposer: terms.proposer,
      kind: "Config",
      proposed_config: configDatumFields(roles, config, policies),
      eligible_leaves: terms.leaves,
      start: terms.start,
      end,
      reveal_end: revealEnd,
      nullifiers: [],
      discarded: 0n,
      tallied: 0n,
      yes: 0n,
      no: 0n,
      abstain: 0n,
      status: "Open",
      finalized_at: null,
    },
    proposalDatumSchema,
  );
}

export function proposalUnit(governancePolicy: string, id: string): string {
  return governancePolicy + id;
}

export type ProposalStatus = "Open" | "Passed" | "Rejected" | "Executed";

const STATUS_INDEX: Record<ProposalStatus, number> = {
  Open: 0,
  Passed: 1,
  Rejected: 2,
  Executed: 3,
};

const STATUS_BY_INDEX: ProposalStatus[] = [
  "Open",
  "Passed",
  "Rejected",
  "Executed",
];

export type ProposalFields = {
  id: string;
  eligible_leaves: string[];
  start: bigint;
  end: bigint;
  reveal_end: bigint;
  nullifiers: string[];
  discarded: bigint;
  tallied: bigint;
  yes: bigint;
  no: bigint;
  abstain: bigint;
  status: ProposalStatus;
  finalizedAt: bigint | null;
};

type ProposalConstr = { index: number; fields: unknown[] };

function proposalConstr(datum: string): ProposalConstr {
  return Data.from(datum) as ProposalConstr;
}

export function decodeProposalDatum(datum: string): ProposalFields {
  const { fields } = proposalConstr(datum);
  const status = fields[14] as { index: number };
  const finalizedAt = fields[15] as { index: number; fields: unknown[] };
  return {
    id: fields[0] as string,
    eligible_leaves: fields[4] as string[],
    start: fields[5] as bigint,
    end: fields[6] as bigint,
    reveal_end: fields[7] as bigint,
    nullifiers: fields[8] as string[],
    discarded: fields[9] as bigint,
    tallied: fields[10] as bigint,
    yes: fields[11] as bigint,
    no: fields[12] as bigint,
    abstain: fields[13] as bigint,
    status: STATUS_BY_INDEX[status.index]!,
    finalizedAt: finalizedAt.index === 0 ? (finalizedAt.fields[0] as bigint) : null,
  };
}

function reencodeProposal(constr: ProposalConstr, fields: unknown[]): string {
  return Data.to(new Constr(constr.index, fields as never) as never);
}

/** The proposal datum after one cast; the action owns only `nullifiers`. */
export function withNullifier(datum: string, nullifier: string): string {
  const constr = proposalConstr(datum);
  const fields = [...constr.fields];
  fields[8] = [...(fields[8] as string[]), nullifier];
  return reencodeProposal(constr, fields);
}

/** The proposal datum after one discard; the action owns only `discarded`. */
export function withDiscarded(datum: string): string {
  const constr = proposalConstr(datum);
  const fields = [...constr.fields];
  fields[9] = (fields[9] as bigint) + 1n;
  return reencodeProposal(constr, fields);
}

export type TallyCounts = {
  count: bigint;
  yes: bigint;
  no: bigint;
  abstain: bigint;
};

/** The proposal datum after one tally batch. */
export function withTally(datum: string, counts: TallyCounts): string {
  const constr = proposalConstr(datum);
  const fields = [...constr.fields];
  fields[10] = (fields[10] as bigint) + counts.count;
  fields[11] = (fields[11] as bigint) + counts.yes;
  fields[12] = (fields[12] as bigint) + counts.no;
  fields[13] = (fields[13] as bigint) + counts.abstain;
  return reencodeProposal(constr, fields);
}

/** The proposal datum after finalize; only status and finalized_at change. */
export function withFinalized(
  datum: string,
  status: "Passed" | "Rejected",
  finalizedAt: bigint,
): string {
  const constr = proposalConstr(datum);
  const fields = [...constr.fields];
  fields[14] = new Constr(STATUS_INDEX[status], []);
  fields[15] = new Constr(0, [finalizedAt]);
  return reencodeProposal(constr, fields);
}

/** The proposal datum after execute; only status changes. */
export function withExecuted(datum: string): string {
  const constr = proposalConstr(datum);
  const fields = [...constr.fields];
  fields[14] = new Constr(STATUS_INDEX.Executed, []);
  return reencodeProposal(constr, fields);
}

/** The proposed config datum, re-encoded for the config output at execute. */
export function proposedConfigDatum(datum: string): string {
  return Data.to(proposalConstr(datum).fields[3] as never);
}

/** The proposer's wallet must be selected; the board co-signs. */
export async function createProposal(
  ledger: Ledger,
  m1: Genesis,
  config: TestConfig,
  terms: ProposalTerms,
  memberBox: UTxO,
  kycBox: UTxO,
  boardSigners = 2,
): Promise<UTxO> {
  const unit = proposalUnit(m1.governancePolicy, terms.id);
  const datum = proposalDatum(
    ledger.roles,
    config,
    policyHashes(m1),
    terms,
  );

  let tx = ledger.lucid.newTx().addSignerKey(terms.proposer);
  for (const key of ledger.roles.boardKeys.slice(0, boardSigners)) {
    tx = tx.addSignerKey(key);
  }
  const built = await tx
    .attach.MintingPolicy(m1.governanceValidator)
    .mintAssets({ [unit]: 1n }, Data.void())
    .readFrom([m1.configUtxo, memberBox, kycBox])
    .pay.ToAddressWithData(
      m1.governanceAddress,
      { kind: "inline", value: datum },
      { lovelace: PROPOSAL_MIN_LOVELACE, [unit]: 1n },
    )
    .validFrom(Number(terms.start))
    .validTo(Number(terms.start) + 60_000)
    .complete();
  await submitWithBoard(built, ledger, boardSigners);
  ledger.emulator.awaitBlock(1);
  return ledger.lucid.utxoByUnit(unit);
}
