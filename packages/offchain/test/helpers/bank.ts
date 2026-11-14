import { Data, type UTxO } from "@lucid-evolution/lucid";
import {
  encode,
  membershipRedeemer,
  scriptTime,
  submitTx,
  type Genesis,
  type Ledger,
} from "./harness";

/**
 * Bank proof transactions (ADR 0008 §5). The selected wallet signs; tests call
 * `selectActor(ledger, "bankIssuer")` before issuing or cancelling.
 */

export const BANK_MIN_LOVELACE = 3_000_000n;

// Constructor order of `MembershipRedeemer` in `contracts/lib/sequoia/types.ak`.
export const ISSUE_BANK_PROOF = 0;
export const BURN_BANK_PROOF = 1;

export type BankTerms = {
  memberId: string; // hex; not the token name
  contributionYear: bigint;
  amount: bigint;
  bankRefHash: string; // hex
  nonce: string; // hex; the BANK asset name
};

const bankDatumSchema = Data.Object({
  issuer: Data.Bytes(),
  member_id: Data.Bytes(),
  contribution_year: Data.Integer(),
  amount: Data.Integer(),
  bank_ref_hash: Data.Bytes(),
  nonce: Data.Bytes(),
  issued_at: Data.Integer(),
});

export function bankDatum(
  issuer: string,
  terms: BankTerms,
  issuedAt: bigint,
): string {
  return encode(
    {
      issuer,
      member_id: terms.memberId,
      contribution_year: terms.contributionYear,
      amount: terms.amount,
      bank_ref_hash: terms.bankRefHash,
      nonce: terms.nonce,
      issued_at: issuedAt,
    },
    bankDatumSchema,
  );
}

export function bankUnit(membershipPolicy: string, nonce: string): string {
  return membershipPolicy + nonce;
}

export async function issueBankProof(
  ledger: Ledger,
  m1: Genesis,
  terms: BankTerms,
): Promise<UTxO> {
  const now = scriptTime(ledger, ledger.emulator.now());
  const unit = bankUnit(m1.membershipPolicy, terms.nonce);
  const tx = await ledger.lucid
    .newTx()
    .addSigner(await ledger.lucid.wallet().address())
    .readFrom([m1.configUtxo])
    .attach.MintingPolicy(m1.membershipValidator)
    .validFrom(now)
    .mintAssets({ [unit]: 1n }, membershipRedeemer(ISSUE_BANK_PROOF))
    .pay.ToContract(
      m1.bankAddress,
      { kind: "inline", value: bankDatum(ledger.roles.bankIssuer, terms, BigInt(now)) },
      { lovelace: BANK_MIN_LOVELACE, [unit]: 1n },
    )
    .complete();
  await submitTx(tx);
  ledger.emulator.awaitBlock(1);
  return ledger.lucid.utxoByUnit(unit);
}

export async function cancelBankProof(
  ledger: Ledger,
  m1: Genesis,
  proof: UTxO,
  nonce: string,
): Promise<void> {
  const now = scriptTime(ledger, ledger.emulator.now());
  const unit = bankUnit(m1.membershipPolicy, nonce);
  const tx = await ledger.lucid
    .newTx()
    .addSigner(await ledger.lucid.wallet().address())
    .readFrom([m1.configUtxo])
    .collectFrom([proof], membershipRedeemer(BURN_BANK_PROOF))
    .attach.SpendingValidator(m1.bankValidator)
    .attach.MintingPolicy(m1.membershipValidator)
    .validFrom(now)
    .mintAssets({ [unit]: -1n }, membershipRedeemer(BURN_BANK_PROOF))
    .complete();
  await submitTx(tx);
  ledger.emulator.awaitBlock(1);
}

export function bankTerms(
  memberId: string,
  nonce: string,
  contributionYear = 2026n,
  amount = 1_000_000n,
): BankTerms {
  return { memberId, contributionYear, amount, bankRefHash: "cc", nonce };
}
