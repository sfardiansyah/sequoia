use aiken/collection/dict
use aiken/collection/list
use aiken/primitive/bytearray
use cardano/address.{Script}
use cardano/assets.{PolicyId, flatten, quantity_of, tokens, without_lovelace}
use cardano/transaction.{Output, OutputReference, Transaction}
use sequoia/tx.{inline_datum, lower_bound, one_token_output, require_key_signer}
use sequoia/types.{BankProofDatum, ConfigDatum}

// Bank proof rules (ADR 0008 §3, §5, §6). The proof NFT is minted under the
// membership policy and locked at the parameterless bank guard, which requires
// the NFT to be burned whenever the box is spent.

fn datum_of(output: Output) -> BankProofDatum {
  expect datum: BankProofDatum = inline_datum(output)
  datum
}

pub fn issue(
  config: ConfigDatum,
  policy_id: PolicyId,
  self: Transaction,
) -> Bool {
  if config.membership_policy != policy_id {
    fail @"bank_rules: config names a different membership policy"
  } else {
    let issuer = require_key_signer(config.bank_issuer, self)
    expect [Pair(nonce, 1)] = tokens(self.mint, policy_id) |> dict.to_pairs()
    let output = one_token_output(policy_id, nonce, config.bank_policy, self)
    let datum = datum_of(output)
    if nonce == #"" {
      fail @"bank_rules: nonce must not be empty"
    } else if datum.nonce != nonce {
      fail @"bank_rules: datum nonce must match the token name"
    } else if datum.issuer != issuer {
      fail @"bank_rules: datum issuer must be the signer"
    } else if datum.contribution_year != config.contribution_year {
      fail @"bank_rules: contribution year must match the config"
    } else if datum.amount != config.annual_amount {
      fail @"bank_rules: amount must match the annual amount"
    } else if datum.member_id == #"" {
      fail @"bank_rules: member id must not be empty"
    } else if bytearray.length(datum.member_id) > 32 {
      fail @"bank_rules: member id must be at most 32 bytes"
    } else if datum.bank_ref_hash == #"" {
      fail @"bank_rules: bank reference hash must not be empty"
    } else if datum.issued_at != lower_bound(self) {
      fail @"bank_rules: issued_at must equal the validity lower bound"
    } else if flatten(without_lovelace(output.value)) != [(policy_id, nonce, 1)] {
      fail @"bank_rules: the proof box must hold only the proof token"
    } else {
      True
    }
  }
}

/// The treasurer cancels a stale proof. The config issuer is the authority; the
/// datum issuer is an audit snapshot and is not compared (ADR 0008 §7).
pub fn cancel(
  config: ConfigDatum,
  policy_id: PolicyId,
  self: Transaction,
) -> Bool {
  if config.membership_policy != policy_id {
    fail @"bank_rules: config names a different membership policy"
  } else {
    expect _issuer = require_key_signer(config.bank_issuer, self)
    expect [Pair(nonce, -1)] = tokens(self.mint, policy_id) |> dict.to_pairs()
    let sources = list.filter(
      self.inputs,
      fn(input) {
        quantity_of(input.output.value, policy_id, nonce) == 1 && input.output.address.payment_credential == Script(
          config.bank_policy,
        )
      },
    )
    if list.any(
      self.outputs,
      fn(output) { quantity_of(output.value, policy_id, nonce) != 0 },
    ) {
      fail @"bank_rules: a cancelled proof cannot be recreated"
    } else {
      when sources is {
        [input] -> {
          let datum = datum_of(input.output)
          if datum.nonce != nonce {
            fail @"bank_rules: datum nonce must match the token name"
          } else {
            True
          }
        }
        _ -> fail @"bank_rules: cancel must spend one bank proof"
      }
    }
  }
}

/// The bank guard: the box holds exactly one token, that exact token is burned,
/// and nothing recreates it. The spender is not constrained here; the burn is
/// authorized by the membership mint handler's branch.
pub fn guard(own_ref: OutputReference, self: Transaction) -> Bool {
  let spent = list.find(
    self.inputs,
    fn(input) { input.output_reference == own_ref },
  )
  expect Some(input) = spent
  expect [(policy_id, asset_name, 1)] = flatten(
    without_lovelace(input.output.value),
  )
  if quantity_of(self.mint, policy_id, asset_name) != -1 {
    fail @"bank_rules: the proof NFT must be burned"
  } else if list.any(
    self.outputs,
    fn(output) { quantity_of(output.value, policy_id, asset_name) != 0 },
  ) {
    fail @"bank_rules: a burned proof cannot be recreated"
  } else {
    True
  }
}
