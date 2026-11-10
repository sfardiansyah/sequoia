use aiken/collection/list
use cardano/assets.{PolicyId, from_asset, quantity_of, restricted_to}
use cardano/transaction.{OutputReference, Transaction}
use sequoia/types.{state_asset_name}

/// One-shot State NFT: the policy is compiled against one seed output, so the
/// `STATE` token can exist only in the transaction that spends that output.
validator state_nft(seed_ref: OutputReference) {
  mint(_redeemer: Data, policy_id: PolicyId, self: Transaction) {
    let seed_spent = list.any(
      self.inputs,
      fn(input) { input.output_reference == seed_ref },
    )
    // Only this policy's own mint is constrained; other policies may mint too.
    let this_policy_mints = restricted_to(self.mint, [policy_id])
    let mint_is_one = this_policy_mints == from_asset(
      policy_id,
      state_asset_name,
      1,
    )
    let one_output_holds_state = list.count(
      self.outputs,
      fn(output) { quantity_of(output.value, policy_id, state_asset_name) == 1 },
    ) == 1

    if !seed_spent {
      fail @"state_nft: seed must be spent"
    } else if !mint_is_one {
      fail @"state_nft: mint exactly one STATE"
    } else if !one_output_holds_state {
      fail @"state_nft: exactly one output must hold STATE"
    } else {
      True
    }
  }

  else(_) {
    fail @"state_nft: unsupported purpose"
  }
}
