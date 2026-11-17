import { Constr, Data, type UTxO } from "@lucid-evolution/lucid";
import {
  decodeProposalDatum,
  proposalUnit,
  payloadProjectSpec,
  projectSpecSchema,
  specFields,
  specTerms,
  withExecuted,
  type ProjectSpecFields,
  type ProjectSpecTerms,
} from "./proposal";
import { governanceExecute } from "./ballot";
import {
  encode,
  poolDatum,
  poolUnit,
  scriptTime,
  submitTx,
  submitWithBoard,
  type Genesis,
  type Ledger,
} from "./harness";

const poolDatumSchema = Data.Object({
  balance: Data.Integer(),
  committed: Data.Integer(),
});

export type PoolFields = { balance: bigint; committed: bigint };

export function decodePoolDatum(datum: string): PoolFields {
  return Data.from(datum, poolDatumSchema) as unknown as PoolFields;
}

/** `TreasuryRedeemer.AttestPool { balance, bank_ref_hash }` (types.ak). */
export const attestPoolRedeemer = (
  balance: bigint,
  bankRefHash: string,
): string => Data.to(new Constr(0, [balance, bankRefHash]));

/** `TreasuryRedeemer.ReserveProject`: the pool spend beside the `PROJECT` mint. */
export const reserveProjectRedeemer = Data.to(new Constr(4, []));

/** `TreasuryRedeemer.SpendTranche { evidence_hash, bank_ref_hash }` (types.ak). */
export const spendTrancheRedeemer = (
  evidenceHash: string,
  bankRefHash: string,
): string => Data.to(new Constr(1, [evidenceHash, bankRefHash]));

export type AttestOptions = {
  balance: bigint;
  bankRefHash?: string;
  /** Negative tests only: spend a different box, write a different datum or address, or mint on the spend path. */
  box?: UTxO;
  datum?: string;
  address?: string;
  mint?: { name: string; quantity: bigint };
};

/**
 * `AttestPool`: the treasurer writes the absolute balance and `committed` is
 * unchanged (ADR 0010 §2). The pool box is found by the one-shot `POOL` token.
 */
export async function attestPool(
  ledger: Ledger,
  m1: Genesis,
  options: AttestOptions,
): Promise<UTxO> {
  const box =
    options.box ??
    (await ledger.lucid.utxoByUnit(poolUnit(m1.stateNftPolicy)));
  const committed = decodePoolDatum(box.datum!).committed;
  const now = scriptTime(ledger, ledger.emulator.now());
  let tx = ledger.lucid
    .newTx()
    .addSigner(await ledger.lucid.wallet().address())
    .collectFrom(
      [box],
      attestPoolRedeemer(options.balance, options.bankRefHash ?? "ab".repeat(32)),
    )
    .readFrom([m1.configUtxo])
    .attach.SpendingValidator(m1.treasuryValidator)
    .validFrom(now)
    .validTo(now + 60_000);
  if (options.mint) {
    tx = tx
      .attach.MintingPolicy(m1.treasuryValidator)
      .mintAssets(
        { [m1.treasuryPolicy + options.mint.name]: options.mint.quantity },
        Data.void(),
      );
  }
  const built = await tx
    .pay.ToContract(
      options.address ?? m1.treasuryAddress,
      {
        kind: "inline",
        value: options.datum ?? poolDatum(options.balance, committed),
      },
      box.assets,
    )
    .complete();
  await submitTx(built);
  ledger.emulator.awaitBlock(1);
  return ledger.lucid.utxoByUnit(poolUnit(m1.stateNftPolicy));
}

/** Minimum ADA a project box holds. */
export const PROJECT_MIN_LOVELACE = 5_000_000n;

export type ProjectStatusName =
  | "ProjectOpen"
  | "ProjectClosed"
  | "ProjectCancelled";

const projectDatumSchema = Data.Object({
  project_id: Data.Bytes(),
  spec: projectSpecSchema,
  next_milestone: Data.Integer(),
  status: Data.Enum([
    Data.Literal("ProjectOpen"),
    Data.Literal("ProjectClosed"),
    Data.Literal("ProjectCancelled"),
  ]),
});

export type ProjectFields = {
  projectId: string;
  spec: ProjectSpecTerms;
  nextMilestone: bigint;
  status: ProjectStatusName;
};

/** The `PROJECT` NFT name is the proposal id, under the treasury policy. */
export function projectUnit(treasuryPolicy: string, id: string): string {
  return treasuryPolicy + id;
}

/** The project box datum, in `types.ak` field order. */
export function projectDatum(
  projectId: string,
  spec: ProjectSpecTerms,
  nextMilestone = 0n,
  status: ProjectStatusName = "ProjectOpen",
): string {
  return encode(
    {
      project_id: projectId,
      spec: specFields(spec),
      next_milestone: nextMilestone,
      status,
    },
    projectDatumSchema,
  );
}

export function decodeProjectDatum(datum: string): ProjectFields {
  const raw = Data.from(datum, projectDatumSchema) as unknown as {
    project_id: string;
    spec: ProjectSpecFields;
    next_milestone: bigint;
    status: ProjectStatusName;
  };
  return {
    projectId: raw.project_id,
    spec: specTerms(raw.spec),
    nextMilestone: raw.next_milestone,
    status: raw.status,
  };
}

export type ExecuteProjectOptions = {
  /** Negative tests only: a spec other than the approved payload. */
  spec?: ProjectSpecTerms;
  /** Negative tests only: mint a second `PROJECT` name in the same transaction. */
  extraMint?: { name: string; quantity: bigint };
};

/**
 * Execute a passed `Project` proposal (ADR 0010 §1–§4): spend the proposal and
 * the pool, mint the `PROJECT` NFT, reserve the budget, and write the project
 * box. Permissionless, and no timelock.
 */
export async function executeProject(
  ledger: Ledger,
  m1: Genesis,
  proposalBox: UTxO,
  options: ExecuteProjectOptions = {},
): Promise<{ proposal: UTxO; project: UTxO; pool: UTxO }> {
  const proposal = decodeProposalDatum(proposalBox.datum!);
  const spec = options.spec ?? payloadProjectSpec(proposalBox.datum!);
  const budget = spec.milestones.reduce(
    (total, milestone) => total + milestone.amount,
    0n,
  );
  const pool = await ledger.lucid.utxoByUnit(poolUnit(m1.stateNftPolicy));
  const fields = decodePoolDatum(pool.datum!);
  const unit = projectUnit(m1.treasuryPolicy, proposal.id);
  const now = scriptTime(ledger, ledger.emulator.now());
  const mint: Record<string, bigint> = { [unit]: 1n };
  if (options.extraMint !== undefined) {
    mint[m1.treasuryPolicy + options.extraMint.name] =
      options.extraMint.quantity;
  }

  const built = await ledger.lucid
    .newTx()
    .collectFrom([proposalBox], governanceExecute)
    .collectFrom([pool], reserveProjectRedeemer)
    .readFrom([m1.configUtxo])
    .attach.SpendingValidator(m1.governanceValidator)
    .attach.SpendingValidator(m1.treasuryValidator)
    .attach.MintingPolicy(m1.treasuryValidator)
    .mintAssets(mint, Data.void())
    .pay.ToContract(
      m1.governanceAddress,
      { kind: "inline", value: withExecuted(proposalBox.datum!) },
      proposalBox.assets,
    )
    .pay.ToContract(
      m1.treasuryAddress,
      {
        kind: "inline",
        value: poolDatum(fields.balance, fields.committed + budget),
      },
      pool.assets,
    )
    .pay.ToContract(
      m1.treasuryAddress,
      { kind: "inline", value: projectDatum(proposal.id, spec) },
      { lovelace: PROJECT_MIN_LOVELACE, [unit]: 1n },
    )
    .validFrom(now)
    .validTo(now + 60_000)
    .complete();
  await submitTx(built);
  ledger.emulator.awaitBlock(1);
  return {
    proposal: await ledger.lucid.utxoByUnit(
      proposalUnit(m1.governancePolicy, proposal.id),
    ),
    project: await ledger.lucid.utxoByUnit(unit),
    pool: await ledger.lucid.utxoByUnit(poolUnit(m1.stateNftPolicy)),
  };
}

export type SpendTrancheOptions = {
  projectId: string;
  evidenceHash: string;
  bankRefHash?: string;
  /** Board co-signers to add; defaults to two, the test config's threshold. */
  boardSigners?: number;
  /** Negative tests only: the exact validity bounds. */
  validFrom?: number;
  validTo?: number;
  /** Negative tests only: write these datums instead of the derived ones. */
  poolDatum?: string;
  projectDatum?: string;
};

/**
 * `SpendTranche` (ADR 0010 §5): the board threshold and the treasurer sign the
 * project and pool spend, the next milestone pays, and the last one closes the
 * project. The selected wallet is the treasurer; the board co-signs.
 */
export async function spendTranche(
  ledger: Ledger,
  m1: Genesis,
  options: SpendTrancheOptions,
): Promise<{ project: UTxO; pool: UTxO }> {
  const unit = projectUnit(m1.treasuryPolicy, options.projectId);
  const projectBox = await ledger.lucid.utxoByUnit(unit);
  const project = decodeProjectDatum(projectBox.datum!);
  const milestone = project.spec.milestones[Number(project.nextMilestone)];
  const poolBox = await ledger.lucid.utxoByUnit(poolUnit(m1.stateNftPolicy));
  const pool = decodePoolDatum(poolBox.datum!);
  // A fully spent project has no next milestone; a zero tranche still lets the
  // negative tests reach the rule's status check.
  const amount = milestone?.amount ?? 0n;
  const nextMilestone = milestone
    ? project.nextMilestone + 1n
    : project.nextMilestone;
  const status: ProjectStatusName = milestone
    ? nextMilestone === BigInt(project.spec.milestones.length)
      ? "ProjectClosed"
      : "ProjectOpen"
    : project.status;
  const now = scriptTime(ledger, ledger.emulator.now());
  const redeemer = spendTrancheRedeemer(
    options.evidenceHash,
    options.bankRefHash ?? "ab".repeat(32),
  );
  // The selected wallet is the treasurer; the rule needs it as a required
  // signer, not merely the fee payer (the board keys are added below).
  const treasurer = await ledger.lucid.wallet().address();
  const boardSigners = options.boardSigners ?? 2;

  let tx = ledger.lucid
    .newTx()
    .addSigner(treasurer)
    .collectFrom([projectBox, poolBox], redeemer)
    .readFrom([m1.configUtxo])
    .attach.SpendingValidator(m1.treasuryValidator)
    .validFrom(options.validFrom ?? now)
    .validTo(options.validTo ?? now + 60_000);
  for (const key of ledger.roles.boardKeys.slice(0, boardSigners)) {
    tx = tx.addSignerKey(key);
  }
  const built = await tx
    .pay.ToContract(
      m1.treasuryAddress,
      {
        kind: "inline",
        value:
          options.poolDatum ??
          poolDatum(pool.balance - amount, pool.committed - amount),
      },
      poolBox.assets,
    )
    .pay.ToContract(
      m1.treasuryAddress,
      {
        kind: "inline",
        value:
          options.projectDatum ??
          projectDatum(options.projectId, project.spec, nextMilestone, status),
      },
      projectBox.assets,
    )
    .complete();
  await submitWithBoard(built, ledger, boardSigners);
  ledger.emulator.awaitBlock(1);
  return {
    project: await ledger.lucid.utxoByUnit(unit),
    pool: await ledger.lucid.utxoByUnit(poolUnit(m1.stateNftPolicy)),
  };
}
