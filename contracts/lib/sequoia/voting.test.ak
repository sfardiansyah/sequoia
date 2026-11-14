use aiken/collection/list
use aiken/fuzz
use aiken/primitive/bytearray
use sequoia/voting
use sequoia/voting_vectors.{
  commitment_cases, leaf_cases, nullifier_cases, quorum_cases, threshold_cases,
  window_cases,
}

test hashes_match_shared_vectors() {
  and {
    list.all(
      leaf_cases,
      fn(vector) {
        let (vote_secret, leaf) = vector
        voting.eligible_leaf(vote_secret) == leaf
      },
    ),
    list.all(
      nullifier_cases,
      fn(vector) {
        let (vote_secret, proposal_id, expected) = vector
        voting.nullifier(vote_secret, proposal_id) == expected
      },
    ),
    list.all(
      commitment_cases,
      fn(vector) {
        let (choice, salt, expected) = vector
        voting.choice_commitment(choice, salt) == expected
      },
    ),
  }
}

test windows_match_shared_vectors() {
  list.all(
    window_cases,
    fn(vector) {
      let  
          (
            start,
            voting_days,
            reveal_days,
            timelock_days,
            end,
            reveal_end,
            finalized_at,
            timelock_end,
          )
        = vector
      and {
        voting.end_of_voting(start, voting_days) == end,
        voting.end_of_reveal(end, reveal_days) == reveal_end,
        voting.timelock_end(finalized_at, timelock_days) == timelock_end,
      }
    },
  )
}

test quorum_matches_shared_vectors() {
  list.all(
    quorum_cases,
    fn(vector) {
      let (votes, eligible_count, quorum_bps, met) = vector
      voting.quorum_met(votes, eligible_count, quorum_bps) == met
    },
  )
}

test threshold_matches_shared_vectors() {
  list.all(
    threshold_cases,
    fn(vector) {
      let (yes, no, threshold_bps, met) = vector
      voting.threshold_met(yes, no, threshold_bps) == met
    },
  )
}

test hashes_are_domain_separated() {
  let vote_secret = bytearray.replicate(32, 0x11)
  let proposal_id = bytearray.replicate(32, 0x33)
  let salt = bytearray.replicate(32, 0x22)
  let other = bytearray.replicate(32, 0x44)
  and {
    voting.eligible_leaf(vote_secret) != voting.nullifier(
      vote_secret,
      proposal_id,
    ),
    voting.eligible_leaf(vote_secret) != voting.choice_commitment(0, salt),
    voting.nullifier(vote_secret, proposal_id) != voting.nullifier(
      vote_secret,
      other,
    ),
    voting.choice_commitment(0, salt) != voting.choice_commitment(1, salt),
    voting.choice_commitment(1, salt) != voting.choice_commitment(1, other),
  }
}

test commitment_rejects_an_unknown_choice() fail {
  let commitment = voting.choice_commitment(3, bytearray.replicate(32, 0x22))
  commitment == commitment
}

test commitment_matches_accepts_the_opening() {
  let salt = bytearray.replicate(32, 0x22)
  let commitment = voting.choice_commitment(2, salt)
  voting.commitment_matches(commitment, 2, salt)
}

test commitment_matches_rejects_a_wrong_choice() {
  let salt = bytearray.replicate(32, 0x22)
  let commitment = voting.choice_commitment(0, salt)
  !voting.commitment_matches(commitment, 1, salt)
}

test time_rule_is_inclusive_at_the_bound() {
  and {
    voting.not_before(100, 100),
    voting.not_after(100, 100),
    !voting.not_before(99, 100),
    !voting.not_after(101, 100),
  }
}

test window_is_tight_at_one_hour() {
  and {
    voting.window_is_tight(0, voting.max_window_ms),
    !voting.window_is_tight(0, voting.max_window_ms + 1),
    !voting.window_is_tight(100, 99),
  }
}

test quorum_needs_half_the_eligible_count() {
  and {
    voting.quorum_met(3, 5, 5_000),
    !voting.quorum_met(2, 5, 5_000),
  }
}

test structural_threshold_rejects_two_of_three() {
  and {
    !voting.threshold_met(2, 1, 6_667),
    voting.threshold_met(3, 1, 6_667),
  }
}

test project_threshold_is_more_than_half() {
  and {
    !voting.threshold_met(2, 2, 5_001),
    voting.threshold_met(3, 2, 5_001),
  }
}

test threshold_needs_a_counted_vote() {
  !voting.threshold_met(0, 0, 6_667)
}

test a_short_secret_is_rejected() fail {
  let leaf = voting.eligible_leaf(#"11")
  leaf == leaf
}

test a_short_salt_is_rejected() fail {
  let commitment = voting.choice_commitment(0, #"22")
  commitment == commitment
}

test a_short_proposal_id_is_rejected() fail {
  let nul = voting.nullifier(bytearray.replicate(32, 0x11), #"aa")
  nul == nul
}

test hashes_are_32_bytes(secret via fuzz.bytearray_fixed(32)) {
  bytearray.length(voting.eligible_leaf(secret)) == 32
}

test nullifiers_change_with_the_proposal(
  vector via fuzz.tuple3(
    fuzz.bytearray_fixed(32),
    fuzz.bytearray_fixed(32),
    fuzz.bytearray_fixed(32),
  ),
) {
  let (secret, first_id, second_id) = vector
  if first_id == second_id {
    True
  } else {
    voting.nullifier(secret, first_id) != voting.nullifier(secret, second_id)
  }
}

test commitments_open(
  vector via fuzz.tuple(fuzz.int_between(0, 2), fuzz.bytearray_fixed(32)),
) {
  let (choice, salt) = vector
  voting.commitment_matches(
    voting.choice_commitment(choice, salt),
    choice,
    salt,
  )
}

test quorum_is_monotonic_in_votes(
  vector via fuzz.tuple3(
    fuzz.int_between(0, 100),
    fuzz.int_between(0, 100),
    fuzz.int_between(0, 10_000),
  ),
) {
  let (votes, eligible_count, quorum_bps) = vector
  if voting.quorum_met(votes, eligible_count, quorum_bps) && votes < eligible_count {
    voting.quorum_met(votes + 1, eligible_count, quorum_bps)
  } else {
    True
  }
}

test threshold_is_monotonic_in_yes(
  vector via fuzz.tuple3(
    fuzz.int_between(0, 1_000),
    fuzz.int_between(0, 1_000),
    fuzz.int_between(1, 10_000),
  ),
) {
  let (yes, no, threshold_bps) = vector
  if voting.threshold_met(yes, no, threshold_bps) {
    voting.threshold_met(yes + 1, no, threshold_bps)
  } else {
    True
  }
}
