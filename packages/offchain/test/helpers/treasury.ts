import { Constr, Data, type UTxO } from "@lucid-evolution/lucid";
import {
  poolDatum,
  poolUnit,
  scriptTime,
  submitTx,
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
