use aiken/collection/list
use cardano/assets.{PolicyId, from_asset_list, quantity_of, restricted_to}
use cardano/transaction.{OutputReference, Transaction}
use sequoia/types.{pool_asset_name, state_asset_name}

/// One-shot state policy: the policy is compiled against one seed output, so the
/// `STATE` and `POOL` tokens can exist only in the transaction that spends that
/// output. Genesis mints one of each and opens the config and pool boxes.
validator state_nft(seed_ref: OutputReference) {
  mint(_redeemer: Data, policy_id: PolicyId, self: Transaction) {
    let seed_spent = list.any(
      self.inputs,
      fn(input) { input.output_reference == seed_ref },
    )
    // Only this policy's own mint is constrained; other policies may mint too.
    let this_policy_mints = restricted_to(self.mint, [policy_id])
    // `from_asset_list` wants ascending asset names: `POOL` sorts before `STATE`.
    let mint_is_one_each = this_policy_mints == from_asset_list(
      [Pair(policy_id, [Pair(pool_asset_name, 1), Pair(state_asset_name, 1)])],
    )
    let one_output_holds = fn(asset_name) {
      list.count(
        self.outputs,
        fn(output) { quantity_of(output.value, policy_id, asset_name) == 1 },
      ) == 1
    }

    // Value conservation already forces one output per unit once the mint is
    // exactly one each; the count keeps the genesis shape explicit.
    if !seed_spent {
      fail @"state_nft: seed must be spent"
    } else if !mint_is_one_each {
      fail @"state_nft: mint exactly one STATE and one POOL"
    } else if !and {
      one_output_holds(state_asset_name),
      one_output_holds(pool_asset_name),
    } {
      fail @"state_nft: exactly one output must hold each token"
    } else {
      True
    }
  }

  else(_) {
    fail @"state_nft: unsupported purpose"
  }
}
