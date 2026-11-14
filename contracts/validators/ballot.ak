use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use sequoia/ballot_rules.{BallotRedeemer, Cast, Discard, Reveal}
use sequoia/config_ref

/// The vote box and VOTE NFT policy (ADR 0009 §5). The NFT name is the
/// nullifier, so one vote per member per proposal is enforced by the mint.
validator ballot(state_nft_policy: PolicyId) {
  mint(redeemer: Data, policy_id: PolicyId, self: Transaction) {
    let config = config_ref.find(state_nft_policy, self)
    expect action: BallotRedeemer = redeemer
    when action is {
      Cast { leaf } -> ballot_rules.cast(config, policy_id, leaf, self)
      Reveal { .. } -> fail @"ballot: reveal is a spend action"
      Discard -> ballot_rules.discard_mint(config, policy_id, self)
    }
  }

  spend(
    _datum: Option<Data>,
    redeemer: Data,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    expect action: BallotRedeemer = redeemer
    when action is {
      Cast { .. } -> fail @"ballot: cast is a mint action"
      Reveal { choice, reveal_salt } ->
        ballot_rules.reveal(own_ref, choice, reveal_salt, self)
      Discard -> {
        let config = config_ref.find(state_nft_policy, self)
        ballot_rules.discard(config, own_ref, self)
      }
    }
  }

  else(_) {
    fail @"ballot: unsupported purpose"
  }
}
