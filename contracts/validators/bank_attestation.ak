use cardano/transaction.{OutputReference, Transaction}
use sequoia/bank_rules

/// Parameterless bank proof guard. It reads the token it holds from its own
/// input and requires that token to be burned in the same transaction, so a
/// proof can never be spent without destroying it (ADR 0008 §1, §5).
validator bank_attestation {
  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    bank_rules.guard(own_ref, self)
  }

  else(_) {
    fail @"bank_attestation: unsupported purpose"
  }
}
