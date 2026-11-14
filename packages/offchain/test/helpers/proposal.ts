import { Constr, Data, type UTxO } from "@lucid-evolution/lucid";
import { endOfReveal, endOfVoting } from "../../src/governance";
import {
  configDatumFields,
  configDatumSchema,
  encode,
  submitWithBoard,
  type Genesis,
  type M1Ledger,
  type M1Roles,
  type PolicyHashes,
  type TestConfig,
} from "./m1";

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
  roles: M1Roles,
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

export type ProposalFields = {
  id: string;
  eligible_leaves: string[];
  start: bigint;
  end: bigint;
  reveal_end: bigint;
  nullifiers: string[];
  discarded: bigint;
};

type ProposalConstr = { index: number; fields: unknown[] };

function proposalConstr(datum: string): ProposalConstr {
  return Data.from(datum) as ProposalConstr;
}

export function decodeProposalDatum(datum: string): ProposalFields {
  const { fields } = proposalConstr(datum);
  return {
    id: fields[0] as string,
    eligible_leaves: fields[4] as string[],
    start: fields[5] as bigint,
    end: fields[6] as bigint,
    reveal_end: fields[7] as bigint,
    nullifiers: fields[8] as string[],
    discarded: fields[9] as bigint,
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

/** The proposer's wallet must be selected; the board co-signs. */
export async function createProposal(
  ledger: M1Ledger,
  m1: Genesis,
  config: TestConfig,
  terms: ProposalTerms,
  memberBox: UTxO,
  kycBox: UTxO,
): Promise<UTxO> {
  const unit = proposalUnit(m1.governancePolicy, terms.id);
  const datum = proposalDatum(
    ledger.roles,
    config,
    {
      membership: m1.membershipPolicy,
      kyc: m1.kycPolicy,
      bank: m1.bankPolicy,
      governance: m1.governancePolicy,
      ballot: m1.ballotPolicy,
    },
    terms,
  );

  let tx = ledger.lucid.newTx().addSignerKey(terms.proposer);
  for (const key of ledger.roles.boardKeys.slice(0, 2)) {
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
  await submitWithBoard(built, ledger, 2);
  ledger.emulator.awaitBlock(1);
  return ledger.lucid.utxoByUnit(unit);
}
