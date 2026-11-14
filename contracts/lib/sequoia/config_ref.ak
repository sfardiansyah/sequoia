use aiken/collection/list
use cardano/assets.{PolicyId, quantity_of}
use cardano/transaction.{InlineDatum, Transaction}
use sequoia/types.{ConfigDatum, state_asset_name}

/// Read actions find the config box among reference inputs: exactly one must
/// hold the STATE token, with an inline ConfigDatum (ADR 0008 §1, §5). Execute
/// spends the box instead and reads it from its input.
pub fn find(state_nft_policy: PolicyId, self: Transaction) -> ConfigDatum {
  let configs = list.filter(
    self.reference_inputs,
    fn(input) {
      quantity_of(input.output.value, state_nft_policy, state_asset_name) == 1
    },
  )
  when configs is {
    [config_input] ->
      when config_input.output.datum is {
        InlineDatum(raw) -> {
          expect config: ConfigDatum = raw
          config
        }
        _ -> fail @"config_ref: config datum must be inline"
      }
    _ -> fail @"config_ref: exactly one config reference input required"
  }
}
