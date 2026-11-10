import {
  Constr,
  Data,
  slotToBeginUnixTime,
  unixTimeToEnclosingSlot,
  type UTxO,
} from "@lucid-evolution/lucid";
import {
  KYC_MIN_LOVELACE,
  encode,
  submitTx,
  type Genesis,
  type M1Ledger,
} from "./m1";

/**
 * KYC attestation transactions (ADR 0008 §5). The selected wallet signs; tests
 * call `selectActor(ledger, "kycIssuer")` before issuing or revoking.
 *
 * `txInfoSignatories` is the transaction's required-signers list, so the signer
 * is added explicitly; paying for the transaction alone is not enough.
 */

// Constructor order of `KycRedeemer` in `contracts/lib/sequoia/types.ak`.
export const ISSUE = 0;
export const RENEW = 1;
export const REVOKE = 2;

export type KycTerms = {
  memberId: string; // hex; also the asset name
  commitment: string; // hex
  level: bigint;
  expiresAt: bigint;
};

const kycDatumSchema = Data.Object({
  issuer: Data.Bytes(),
  member_id: Data.Bytes(),
  commitment: Data.Bytes(),
  level: Data.Integer(),
  issued_at: Data.Integer(),
  expires_at: Data.Integer(),
});

export function kycDatum(
  issuer: string,
  terms: KycTerms,
  issuedAt: bigint,
): string {
  return encode(
    {
      issuer,
      member_id: terms.memberId,
      commitment: terms.commitment,
      level: terms.level,
      issued_at: issuedAt,
      expires_at: terms.expiresAt,
    },
    kycDatumSchema,
  );
}

export function kycUnit(kycPolicy: string, memberId: string): string {
  return kycPolicy + memberId;
}

export const kycRedeemer = (index: number) => Data.to(new Constr(index, []));

/**
 * A validator sees the transaction's lower bound as the start of the enclosing
 * slot, not the wall-clock time passed to `validFrom`. Issuance and renewal pin
 * `issued_at` to that bound, so builders must use this value for both.
 */
export function scriptTime(ledger: M1Ledger, unixTime: number): number {
  return slotToBeginUnixTime(
    unixTimeToEnclosingSlot(unixTime, ledger.slotConfig),
    ledger.slotConfig,
  );
}

export async function issueKyc(
  ledger: M1Ledger,
  m1: Genesis,
  terms: KycTerms,
): Promise<UTxO> {
  const now = scriptTime(ledger, ledger.emulator.now());
  const unit = kycUnit(m1.kycPolicy, terms.memberId);
  const tx = await ledger.lucid
    .newTx()
    .addSigner(await ledger.lucid.wallet().address())
    .readFrom([m1.configUtxo])
    .attach.MintingPolicy(m1.kycValidator)
    .validFrom(now)
    .mintAssets({ [unit]: 1n }, kycRedeemer(ISSUE))
    .pay.ToContract(
      m1.kycAddress,
      { kind: "inline", value: kycDatum(ledger.roles.kycIssuer, terms, BigInt(now)) },
      { lovelace: KYC_MIN_LOVELACE, [unit]: 1n },
    )
    .complete();
  await submitTx(tx);
  ledger.emulator.awaitBlock(1);
  return ledger.lucid.utxoByUnit(unit);
}

export async function renewKyc(
  ledger: M1Ledger,
  m1: Genesis,
  old: UTxO,
  terms: KycTerms,
): Promise<UTxO> {
  const now = scriptTime(ledger, ledger.emulator.now());
  const unit = kycUnit(m1.kycPolicy, terms.memberId);
  const tx = await ledger.lucid
    .newTx()
    .addSigner(await ledger.lucid.wallet().address())
    .readFrom([m1.configUtxo])
    .collectFrom([old], kycRedeemer(RENEW))
    .attach.SpendingValidator(m1.kycValidator)
    .validFrom(now)
    .pay.ToContract(
      m1.kycAddress,
      { kind: "inline", value: kycDatum(ledger.roles.kycIssuer, terms, BigInt(now)) },
      { lovelace: KYC_MIN_LOVELACE, [unit]: 1n },
    )
    .complete();
  await submitTx(tx);
  ledger.emulator.awaitBlock(1);
  return ledger.lucid.utxoByUnit(unit);
}

export async function revokeKyc(
  ledger: M1Ledger,
  m1: Genesis,
  old: UTxO,
  memberId: string,
): Promise<void> {
  const now = scriptTime(ledger, ledger.emulator.now());
  const unit = kycUnit(m1.kycPolicy, memberId);
  const tx = await ledger.lucid
    .newTx()
    .addSigner(await ledger.lucid.wallet().address())
    .readFrom([m1.configUtxo])
    .collectFrom([old], kycRedeemer(REVOKE))
    .attach.SpendingValidator(m1.kycValidator)
    .attach.MintingPolicy(m1.kycValidator)
    .validFrom(now)
    .mintAssets({ [unit]: -1n }, kycRedeemer(REVOKE))
    .complete();
  await submitTx(tx);
  ledger.emulator.awaitBlock(1);
}

export function kycTerms(
  memberId: string,
  expiresAt: bigint,
  level = 1n,
  commitment = "aabbcc",
): KycTerms {
  return { memberId, commitment, level, expiresAt };
}
