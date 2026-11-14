use aiken/crypto.{sha2_256}
use aiken/primitive/bytearray

/// M2 voting primitives (ADR 0009). Hashes are domain-separated by one byte and
/// mirrored by `packages/offchain/src/governance.ts` through the shared vectors.
/// Secrets, salts, and proposal ids must be 32 bytes; the primitives enforce it
/// so a short or empty value cannot collide across members.
pub const leaf_tag: ByteArray = #"01"

pub const nullifier_tag: ByteArray = #"03"

pub const commitment_tag: ByteArray = #"04"

/// Config windows are days; everything on chain is milliseconds.
pub const ms_per_day: Int = 86_400_000

/// Creation and finalize accept a validity window of at most one hour, so a
/// stale lower bound or a late upper bound cannot move the stamped time far
/// from the real one (ADR 0009 §4).
pub const max_window_ms: Int = 3_600_000

/// `Yes = 0`, `No = 1`, `Abstain = 2`.
pub const max_choice_index: Int = 2

/// Tally spends at most this many ballots in one transaction.
pub const max_tally_batch: Int = 10

fn is_32(bytes: ByteArray) -> Bool {
  bytearray.length(bytes) == 32
}

/// `H(0x01 || vote_secret)`. The leaf is the only part of a vote secret that
/// leaves the member's hands.
pub fn eligible_leaf(vote_secret: ByteArray) -> ByteArray {
  if !is_32(vote_secret) {
    fail @"voting: vote secret must be 32 bytes"
  } else {
    sha2_256(bytearray.concat(leaf_tag, vote_secret))
  }
}

/// `H(0x03 || vote_secret || proposal_id)`, the `VOTE` NFT name.
pub fn nullifier(vote_secret: ByteArray, proposal_id: ByteArray) -> ByteArray {
  if !is_32(vote_secret) {
    fail @"voting: vote secret must be 32 bytes"
  } else if !is_32(proposal_id) {
    fail @"voting: proposal id must be 32 bytes"
  } else {
    sha2_256(
      bytearray.concat(
        bytearray.concat(nullifier_tag, vote_secret),
        proposal_id,
      ),
    )
  }
}

/// `H(0x04 || choice_index || reveal_salt)`.
pub fn choice_commitment(choice_index: Int, reveal_salt: ByteArray) -> ByteArray {
  if choice_index < 0 || choice_index > max_choice_index {
    fail @"voting: choice index must be Yes, No, or Abstain"
  } else if !is_32(reveal_salt) {
    fail @"voting: reveal salt must be 32 bytes"
  } else {
    sha2_256(
      bytearray.concat(
        bytearray.concat(
          commitment_tag,
          bytearray.from_int_big_endian(choice_index, 1),
        ),
        reveal_salt,
      ),
    )
  }
}

pub fn commitment_matches(
  commitment: ByteArray,
  choice_index: Int,
  reveal_salt: ByteArray,
) -> Bool {
  commitment == choice_commitment(choice_index, reveal_salt)
}

pub fn end_of_voting(start: Int, voting_days: Int) -> Int {
  start + voting_days * ms_per_day
}

pub fn end_of_reveal(end: Int, reveal_days: Int) -> Int {
  end + reveal_days * ms_per_day
}

pub fn timelock_end(finalized_at: Int, timelock_days: Int) -> Int {
  finalized_at + timelock_days * ms_per_day
}

/// "Not before `at`": the transaction cannot land earlier than its lower bound.
pub fn not_before(lower_bound: Int, at: Int) -> Bool {
  lower_bound >= at
}

/// "Not after `at`": the transaction cannot land later than its upper bound.
pub fn not_after(upper_bound: Int, at: Int) -> Bool {
  upper_bound <= at
}

pub fn window_is_tight(lower_bound: Int, upper_bound: Int) -> Bool {
  upper_bound >= lower_bound && upper_bound - lower_bound <= max_window_ms
}

/// `votes` counts revealed and tallied ballots, abstentions included; the
/// denominator is the board-attested eligible leaf count.
pub fn quorum_met(votes: Int, eligible_count: Int, quorum_bps: Int) -> Bool {
  votes * 10_000 >= quorum_bps * eligible_count
}

/// `yes` over `yes + no`; abstentions do not count, and no counted yes/no vote
/// can ever meet a positive threshold.
pub fn threshold_met(yes: Int, no: Int, threshold_bps: Int) -> Bool {
  let cast = yes + no
  cast > 0 && yes * 10_000 >= threshold_bps * cast
}
