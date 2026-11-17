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

const milestoneSchema = Data.Object({
  amount: Data.Integer(),
  evidence_commitment: Data.Bytes(),
});

export const projectSpecSchema = Data.Object({
  recipient_commitment: Data.Bytes(),
  deadline: Data.Integer(),
  milestones: Data.Array(milestoneSchema),
});

/**
 * Mirrors `ProposalPayload` in types.ak: the constructor is the kind, and each
 * variant carries exactly one nested value. Lucid's `Data.Enum` inlines an
 * object variant's fields into the constructor, so a single-field variant wraps
 * its value in a one-item `Data.Tuple` to keep the nesting: `Config` encodes as
 * `Constr(0, [Constr(0, configFields)])`.
 */
const proposalPayloadSchema = Data.Enum([
  Data.Object({ Config: Data.Tuple([configDatumSchema]) }),
  Data.Object({ Project: Data.Tuple([projectSpecSchema]) }),
  Data.Object({ Cancel: Data.Tuple([Data.Bytes()]) }),
]);

const proposalDatumSchema = Data.Object({
  id: Data.Bytes(),
  proposer: Data.Bytes(),
  payload: proposalPayloadSchema,
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

export type MilestoneTerms = {
  amount: bigint;
  evidenceCommitment: string;
};

export type ProjectSpecTerms = {
  recipientCommitment: string;
  deadline: bigint;
  milestones: MilestoneTerms[];
};

/** The spec fields as `types.ak` encodes them; the one snake-case mapping. */
export type ProjectSpecFields = {
  recipient_commitment: string;
  deadline: bigint;
  milestones: { amount: bigint; evidence_commitment: string }[];
};

export function specFields(spec: ProjectSpecTerms): ProjectSpecFields {
  return {
    recipient_commitment: spec.recipientCommitment,
    deadline: spec.deadline,
    milestones: spec.milestones.map((milestone) => ({
      amount: milestone.amount,
      evidence_commitment: milestone.evidenceCommitment,
    })),
  };
}

export function specTerms(fields: ProjectSpecFields): ProjectSpecTerms {
  return {
    recipientCommitment: fields.recipient_commitment,
    deadline: fields.deadline,
    milestones: fields.milestones.map((milestone) => ({
      amount: milestone.amount,
      evidenceCommitment: milestone.evidence_commitment,
    })),
  };
}

/** The three proposal kinds; the payload constructor is the kind. */
export type ProposalPayloadTerms =
  | { kind: "Config" }
  | { kind: "Project"; spec: ProjectSpecTerms }
  | { kind: "Cancel"; projectId: string };

export type ProposalTerms = {
  id: string;
  proposer: string;
  leaves: string[];
  start: bigint;
  payload?: ProposalPayloadTerms;
};

/**
 * The payload for the requested kind. A single-field variant wraps its value in
 * a one-item tuple so the nesting matches `Constr(1, [Constr(0, specFields)])`.
 */
function proposalPayload(
  roles: Roles,
  config: TestConfig,
  policies: PolicyHashes,
  payload: ProposalPayloadTerms | undefined,
): unknown {
  if (payload?.kind === "Project") {
    return { Project: [specFields(payload.spec)] };
  }
  if (payload?.kind === "Cancel") {
    return { Cancel: [payload.projectId] };
  }
  return { Config: [configDatumFields(roles, config, policies)] };
}

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
      payload: proposalPayload(roles, config, policies, terms.payload),
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

export type ProposalKind = "Config" | "Project" | "Cancel";

const KIND_BY_INDEX: ProposalKind[] = ["Config", "Project", "Cancel"];

export type ProposalFields = {
  id: string;
  kind: ProposalKind;
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
  const payload = fields[2] as { index: number };
  const status = fields[13] as { index: number };
  const finalizedAt = fields[14] as { index: number; fields: unknown[] };
  return {
    id: fields[0] as string,
    kind: KIND_BY_INDEX[payload.index]!,
    eligible_leaves: fields[3] as string[],
    start: fields[4] as bigint,
    end: fields[5] as bigint,
    reveal_end: fields[6] as bigint,
    nullifiers: fields[7] as string[],
    discarded: fields[8] as bigint,
    tallied: fields[9] as bigint,
    yes: fields[10] as bigint,
    no: fields[11] as bigint,
    abstain: fields[12] as bigint,
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
  fields[7] = [...(fields[7] as string[]), nullifier];
  return reencodeProposal(constr, fields);
}

/** The proposal datum after one discard; the action owns only `discarded`. */
export function withDiscarded(datum: string): string {
  const constr = proposalConstr(datum);
  const fields = [...constr.fields];
  fields[8] = (fields[8] as bigint) + 1n;
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
  fields[9] = (fields[9] as bigint) + counts.count;
  fields[10] = (fields[10] as bigint) + counts.yes;
  fields[11] = (fields[11] as bigint) + counts.no;
  fields[12] = (fields[12] as bigint) + counts.abstain;
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
  fields[13] = new Constr(STATUS_INDEX[status], []);
  fields[14] = new Constr(0, [finalizedAt]);
  return reencodeProposal(constr, fields);
}

/** The proposal datum after execute; only status changes. */
export function withExecuted(datum: string): string {
  const constr = proposalConstr(datum);
  const fields = [...constr.fields];
  fields[13] = new Constr(STATUS_INDEX.Executed, []);
  return reencodeProposal(constr, fields);
}

/** The config a `Config` proposal carries, re-encoded for the config output. */
export function payloadConfigDatum(datum: string): string {
  const payload = proposalConstr(datum).fields[2] as ProposalConstr;
  if (payload.index !== 0) throw new Error("proposal payload is not Config");
  return Data.to(payload.fields[0] as never);
}

/** The project id a `Cancel` proposal targets. */
export function payloadCancelProjectId(datum: string): string {
  const payload = proposalConstr(datum).fields[2] as ProposalConstr;
  if (payload.index !== 2) throw new Error("proposal payload is not Cancel");
  return payload.fields[0] as string;
}

/** The spec a `Project` proposal carries, re-encoded for the project box. */
export function payloadProjectSpec(datum: string): ProjectSpecTerms {
  const payload = proposalConstr(datum).fields[2] as ProposalConstr;
  if (payload.index !== 1) throw new Error("proposal payload is not Project");
  return specTerms(
    Data.from(
      Data.to(payload.fields[0] as never),
      projectSpecSchema,
    ) as unknown as ProjectSpecFields,
  );
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
