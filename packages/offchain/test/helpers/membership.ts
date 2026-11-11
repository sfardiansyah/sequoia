import { Data, type UTxO } from "@lucid-evolution/lucid";
import {
  MEMBER_MIN_LOVELACE,
  encode,
  keyHash,
  membershipRedeemer,
  scriptTime,
  selectActor,
  submitTx,
  submitWithBoard,
  type Genesis,
  type M1Ledger,
} from "./m1";
import { issueKyc, kycTerms } from "./kyc";
import { bankTerms, issueBankProof } from "./bank";

/**
 * Member record transactions (ADR 0008 §5, §6). Joining is a mint paid by the
 * member; the board co-signs and the KYC box is read as a reference input.
 */

// Constructor order of `MembershipRedeemer` in `contracts/lib/sequoia/types.ak`.
export const JOIN = 2;
export const TRANSFER = 3;
export const CONTRIBUTE = 4;

/** The M1 test config's 70/30 split of the 1,000,000 annual amount. */
export const CONTRIBUTION_MEMBER_CAPITAL = 700_000n;
export const CONTRIBUTION_PARTICIPATION = 300_000n;
const CONTRIBUTION_YEAR = 2026n;

export const MEMBER_CAPITAL_ASSET_NAME = Buffer.from("MCAP").toString("hex");
export const CAPITAL_PARTICIPATION_ASSET_NAME = Buffer.from("PROJ").toString("hex");

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

export type DecodedDatum = { index: number; fields: unknown[] };

export function decodeDatum(box: UTxO): DecodedDatum {
  return Data.from(box.datum!) as DecodedDatum;
}

export function asConstr(value: unknown): DecodedDatum {
  return value as DecodedDatum;
}

export function expiryFrom(ledger: M1Ledger, ms: number): bigint {
  return BigInt(scriptTime(ledger, ledger.emulator.now())) + BigInt(ms);
}

export async function memberBoxes(
  ledger: M1Ledger,
  m1: Genesis,
  memberId: string,
): Promise<UTxO[]> {
  return (await ledger.lucid.utxosAt(m1.membershipAddress)).filter(
    (utxo) => utxo.assets[memberUnit(m1.membershipPolicy, memberId)] === 1n,
  );
}

/** Issue KYC and leave the KYC issuer selected. */
export async function kycFor(
  ledger: M1Ledger,
  m1: Genesis,
  memberId: string,
  kycMs = 600_000,
): Promise<UTxO> {
  selectActor(ledger, "kycIssuer");
  return issueKyc(ledger, m1, kycTerms(memberId, expiryFrom(ledger, kycMs)));
}

/** Issue a bank proof and leave the bank issuer selected. */
export async function proofFor(
  ledger: M1Ledger,
  m1: Genesis,
  memberId: string,
  nonce: string,
): Promise<UTxO> {
  selectActor(ledger, "bankIssuer");
  return issueBankProof(ledger, m1, bankTerms(memberId, nonce));
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

/** The member datum with only the contribution year updated. */
function withContributionYear(datum: string, year: bigint): string {
  const old = Data.from(datum, memberDatumSchema) as Record<string, unknown>;
  return encode({ ...old, last_contribution_year: year }, memberDatumSchema);
}

/**
 * Contribution spends the member box and the bank proof, mints the split, and
 * burns the proof NFT in one transaction (ADR 0008 §5). The same script is
 * attached as both the minting policy and the spending validator.
 */
export async function contributeMember(
  ledger: M1Ledger,
  m1: Genesis,
  box: UTxO,
  proof: UTxO,
  kyc: UTxO,
  memberId: string,
): Promise<UTxO> {
  const memberCapital = CONTRIBUTION_MEMBER_CAPITAL;
  const participation = CONTRIBUTION_PARTICIPATION;
  const now = scriptTime(ledger, ledger.emulator.now());
  const memberCapitalUnit = m1.membershipPolicy + MEMBER_CAPITAL_ASSET_NAME;
  const participationUnit =
    m1.membershipPolicy + CAPITAL_PARTICIPATION_ASSET_NAME;
  const proofUnit = Object.keys(proof.assets).find(
    (unit) => unit !== "lovelace",
  );
  if (proofUnit === undefined) throw new Error("proof box holds no BANK token");

  const tx = await ledger.lucid
    .newTx()
    .addSigner(ledger.actors.member.address)
    .readFrom([m1.configUtxo, kyc])
    .collectFrom([box], membershipRedeemer(CONTRIBUTE))
    .collectFrom([proof], Data.void())
    .attach.SpendingValidator(m1.membershipValidator)
    .attach.SpendingValidator(m1.bankValidator)
    .attach.MintingPolicy(m1.membershipValidator)
    .validFrom(now)
    .mintAssets(
      {
        [memberCapitalUnit]: memberCapital,
        [participationUnit]: participation,
        [proofUnit]: -1n,
      },
      membershipRedeemer(CONTRIBUTE),
    )
    .pay.ToContract(
      m1.membershipAddress,
      {
        kind: "inline",
        value: withContributionYear(box.datum!, CONTRIBUTION_YEAR),
      },
      {
        ...box.assets,
        [memberCapitalUnit]: memberCapital,
        [participationUnit]: participation,
      },
    )
    .complete();
  await submitTx(tx);
  ledger.emulator.awaitBlock(1);
  return ledger.lucid.utxoByUnit(
    memberUnit(m1.membershipPolicy, memberId),
  );
}

/** Issue KYC, join, and leave the member wallet selected. */
export async function joinedMember(
  ledger: M1Ledger,
  m1: Genesis,
  memberId: string,
  options: { founder?: boolean; kycMs?: number } = {},
): Promise<{ kyc: UTxO; box: UTxO }> {
  const kyc = await kycFor(ledger, m1, memberId, options.kycMs);
  selectActor(ledger, "member");
  const box = await joinMember(
    ledger,
    m1,
    { memberId, class: options.founder ? "Founder" : "Standard" },
    kyc,
  );
  return { kyc, box };
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
