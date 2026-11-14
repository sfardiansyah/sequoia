import { Data } from "@lucid-evolution/lucid";
import { endOfReveal, endOfVoting } from "../../src/governance";
import {
  configDatumFields,
  configDatumSchema,
  encode,
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
