use aiken/collection/list
use cardano/assets.{PolicyId, quantity_of}
use cardano/transaction.{Input, Output, OutputReference, Transaction}
use sequoia/config_ref
use sequoia/tx.{inline_datum, require_key_signer}
use sequoia/types.{PoolDatum, pool_asset_name}

/// Treasury rules (ADR 0010 §1–§2). The treasury holds no money: the pool box
/// carries the treasurer-attested IDR figures and the cash stays at the bank.
fn datum_of(output: Output) -> PoolDatum {
  expect datum: PoolDatum = inline_datum(output)
  datum
}

/// The one input holding the pool token, which must be the box being spent. The
/// token is the identity: a project box carries a `PROJECT` NFT instead.
fn pool_input(
  state_nft_policy: PolicyId,
  own_ref: OutputReference,
  self: Transaction,
) -> Input {
  let holders = list.filter(
    self.inputs,
    fn(input) {
      quantity_of(input.output.value, state_nft_policy, pool_asset_name) == 1
    },
  )
  when holders is {
    [input] ->
      if input.output_reference != own_ref {
        fail @"treasury: attestation must spend the pool box"
      } else {
        input
      }
    _ -> fail @"treasury: exactly one pool input required"
  }
}

fn only_pool_output(
  input: Input,
  self: Transaction,
  state_nft_policy: PolicyId,
) -> Output {
  let holders = list.filter(
    self.outputs,
    fn(output) {
      quantity_of(output.value, state_nft_policy, pool_asset_name) == 1
    },
  )
  when holders is {
    [output] ->
      if output.address != input.output.address {
        fail @"treasury: the pool must stay at its script"
      } else {
        output
      }
    _ -> fail @"treasury: exactly one pool output required"
  }
}

/// `AttestPool` (ADR 0010 §2, spec §7): the treasurer writes the absolute
/// balance and `committed` is unchanged. The figure may fall below `committed`,
/// because refusing bad news would leave a stale, higher figure on chain.
pub fn attest_pool(
  state_nft_policy: PolicyId,
  balance: Int,
  bank_ref_hash: ByteArray,
  own_ref: OutputReference,
  self: Transaction,
) -> Bool {
  let input = pool_input(state_nft_policy, own_ref, self)
  let old = datum_of(input.output)
  let config = config_ref.find(state_nft_policy, self)
  expect _treasurer = require_key_signer(config.bank_issuer, self)
  if balance < 0 {
    fail @"treasury: the attested balance cannot be negative"
  } else if bank_ref_hash == #"" {
    fail @"treasury: the bank reference hash must not be empty"
  } else if quantity_of(self.mint, state_nft_policy, pool_asset_name) != 0 {
    fail @"treasury: the pool token cannot be minted or burned"
  } else {
    let written = datum_of(only_pool_output(input, self, state_nft_policy))
    if written != PoolDatum { balance, committed: old.committed } {
      fail @"treasury: attestation writes the balance and keeps committed"
    } else {
      True
    }
  }
}
