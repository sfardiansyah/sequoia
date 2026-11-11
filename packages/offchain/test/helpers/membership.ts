import { Data, type UTxO } from "@lucid-evolution/lucid";
import {
  MEMBER_MIN_LOVELACE,
  encode,
  keyHash,
  membershipRedeemer,
  scriptTime,
  submitTx,
  submitWithBoard,
  type Genesis,
  type M1Ledger,
} from "./m1";

/**
 * Member record transactions (ADR 0008 §5, §6). Joining is a mint paid by the
 * member; the board co-signs and the KYC box is read as a reference input.
 */

// Constructor order of `MembershipRedeemer` in `contracts/lib/sequoia/types.ak`.
export const JOIN = 2;
export const TRANSFER = 3;

export type MemberClass = "Standard" | "Founder";

export type MemberTerms = {
  memberId: string; // hex; also the MEMBER asset name
  class?: MemberClass;
};

const memberClass = Data.Enum([Data.Literal("Standard"), Data.Literal("Founder")]);

const memberStatus = Data.Enum([
  Data.Literal("Active"),
  Data.Literal("Inactive"),
  Data.Literal("PendingExit"),
  Data.Literal("Exited"),
]);

const memberDatumSchema = Data.Object({
  owner: Data.Bytes(),
  member_id: Data.Bytes(),
  class: memberClass,
  status: memberStatus,
  joined_at: Data.Integer(),
  last_contribution_year: Data.Nullable(Data.Integer()),
  last_voted_proposal: Data.Nullable(Data.Integer()),
});

/** Field order mirrors `contracts/lib/sequoia/types.ak`. */
export function memberDatum(
  owner: string,
  terms: MemberTerms,
  joinedAt: bigint,
): string {
  return encode(
    {
      owner,
      member_id: terms.memberId,
      class: terms.class ?? "Standard",
      status: "Active",
      joined_at: joinedAt,
      last_contribution_year: null,
      last_voted_proposal: null,
    },
    memberDatumSchema,
  );
}

export function memberUnit(membershipPolicy: string, memberId: string): string {
  return membershipPolicy + memberId;
}

export async function joinMember(
  ledger: M1Ledger,
  m1: Genesis,
  terms: MemberTerms,
  kyc: UTxO,
  boardSigners = 2,
): Promise<UTxO> {
  const now = scriptTime(ledger, ledger.emulator.now());
  const owner = keyHash(ledger.actors.member.address);
  const unit = memberUnit(m1.membershipPolicy, terms.memberId);
  let tx = ledger.lucid.newTx().addSignerKey(owner);
  for (const key of ledger.roles.boardKeys.slice(0, boardSigners)) {
    tx = tx.addSignerKey(key);
  }
  const built = await tx
    .readFrom([m1.configUtxo, kyc])
    .attach.MintingPolicy(m1.membershipValidator)
    .validFrom(now)
    .mintAssets({ [unit]: 1n }, membershipRedeemer(JOIN))
    .pay.ToContract(
      m1.membershipAddress,
      { kind: "inline", value: memberDatum(owner, terms, BigInt(now)) },
      { lovelace: MEMBER_MIN_LOVELACE, [unit]: 1n },
    )
    .complete();
  await submitWithBoard(built, ledger, boardSigners);
  ledger.emulator.awaitBlock(1);
  return ledger.lucid.utxoByUnit(unit);
}

/** A plain spend keeps the record intact; the member pays the fee. */
export async function transferMember(
  ledger: M1Ledger,
  m1: Genesis,
  box: UTxO,
  memberId: string,
): Promise<UTxO> {
  const tx = await ledger.lucid
    .newTx()
    .addSigner(ledger.actors.member.address)
    .collectFrom([box], membershipRedeemer(TRANSFER))
    .attach.SpendingValidator(m1.membershipValidator)
    .pay.ToContract(
      m1.membershipAddress,
      { kind: "inline", value: box.datum! },
      box.assets,
    )
    .complete();
  await submitTx(tx);
  ledger.emulator.awaitBlock(1);
  return ledger.lucid.utxoByUnit(
    memberUnit(m1.membershipPolicy, memberId),
  );
}
