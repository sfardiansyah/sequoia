use aiken/collection/list
use cardano/transaction.{OutputReference, Transaction}

/// Toolchain probe, removed by ticket #21 when the config validator lands.
///
/// Succeeds only when the transaction carries at least one reference input.
/// `packages/offchain/test/emulator-probe.test.ts` uses it to answer whether
/// Lucid Evolution hands CIP-31 reference inputs to a Plutus V3 script context.
validator probe {
  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    _utxo: OutputReference,
    self: Transaction,
  ) {
    if list.length(self.reference_inputs) > 0 {
      True
    } else {
      fail @"probe: transaction has no reference input"
    }
  }

  else(_) {
    fail
  }
}
