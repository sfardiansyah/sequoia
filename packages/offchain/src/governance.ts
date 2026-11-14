import { createHash } from "node:crypto";

/**
 * M2 voting primitives, mirroring `contracts/lib/sequoia/voting.ak` (ADR 0009).
 * Hashes are hex strings because Lucid asset names and datums are hex.
 */

export const LEAF_TAG = "01";
export const NULLIFIER_TAG = "03";
export const COMMITMENT_TAG = "04";

export const MS_PER_DAY = 86_400_000;
export const MAX_WINDOW_MS = 3_600_000;
export const MAX_CHOICE_INDEX = 2;
export const MAX_TALLY_BATCH = 10;

const sha256 = (...parts: Uint8Array[]): string =>
  createHash("sha256")
    .update(Buffer.concat(parts))
    .digest("hex");

const hexBytes = (hex: string, name: string): Buffer => {
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(`${name} must be 32 bytes of lower-case hex`);
  }
  return Buffer.from(hex, "hex");
};

/** `H(0x01 || vote_secret)`. */
export function eligibleLeaf(voteSecret: string): string {
  return sha256(Buffer.from(LEAF_TAG, "hex"), hexBytes(voteSecret, "vote secret"));
}

/** `H(0x03 || vote_secret || proposal_id)`, the `VOTE` NFT name. */
export function nullifier(voteSecret: string, proposalId: string): string {
  return sha256(
    Buffer.from(NULLIFIER_TAG, "hex"),
    hexBytes(voteSecret, "vote secret"),
    hexBytes(proposalId, "proposal id"),
  );
}

/** `H(0x04 || choice_index || reveal_salt)`. `Yes = 0`, `No = 1`, `Abstain = 2`. */
export function choiceCommitment(choiceIndex: number, revealSalt: string): string {
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > MAX_CHOICE_INDEX) {
    throw new Error("choice index must be Yes, No, or Abstain");
  }
  return sha256(
    Buffer.from(COMMITMENT_TAG, "hex"),
    Uint8Array.of(choiceIndex),
    hexBytes(revealSalt, "reveal salt"),
  );
}

export function commitmentMatches(
  commitment: string,
  choiceIndex: number,
  revealSalt: string,
): boolean {
  return commitment === choiceCommitment(choiceIndex, revealSalt);
}

export function endOfVoting(start: number, votingDays: number): number {
  return start + votingDays * MS_PER_DAY;
}

export function endOfReveal(end: number, revealDays: number): number {
  return end + revealDays * MS_PER_DAY;
}

export function timelockEnd(finalizedAt: number, timelockDays: number): number {
  return finalizedAt + timelockDays * MS_PER_DAY;
}

/** "Not before `at`": the transaction cannot land earlier than its lower bound. */
export function notBefore(lowerBound: number, at: number): boolean {
  return lowerBound >= at;
}

/** "Not after `at`": the transaction cannot land later than its upper bound. */
export function notAfter(upperBound: number, at: number): boolean {
  return upperBound <= at;
}

export function windowIsTight(lowerBound: number, upperBound: number): boolean {
  return upperBound >= lowerBound && upperBound - lowerBound <= MAX_WINDOW_MS;
}

export function quorumMet(votes: number, eligibleCount: number, quorumBps: number): boolean {
  return votes * 10_000 >= quorumBps * eligibleCount;
}

export function thresholdMet(yes: number, no: number, thresholdBps: number): boolean {
  const cast = yes + no;
  return cast > 0 && yes * 10_000 >= thresholdBps * cast;
}
