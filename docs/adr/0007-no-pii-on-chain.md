# ADR 0007: No personal data on chain, keyed commitments, and secret ballot

## Status

Accepted for the pilot harness, and binding on the contracts that follow.
Supersedes the "votes are public by default" sentence in plan §3.9.

## Context

Plan §2.3 already says KYC stays off-chain and only a salted commitment, issuer,
level, expiry, and revocation status go on-chain. §3.9 says the opposite for
votes: public by default, commit-reveal as a later privacy option. Both cannot
be true of the same member's on-chain record.

Cardano records are permanent and public. A vote is a durable statement about a
person's position on the co-op's business, and a vote UTxO is addressable back to
a wallet that is also the member's KYC subject. Retracting it is not possible;
the best available answer is not writing it in the first place. Indonesia's PDP
Law (Law No. 27 of 2022) and Government Regulation No. 33 of 2026 (effective 16
January 2027) give access and correction rights that an immutable ledger cannot
honour, which is why §2.3 keeps identity data off-chain. The same reasoning
applies to a member's ballot. See `docs/legal/privacy-and-regulatory-review.md`;
the characterization is for counsel to confirm, not something this ADR settles.

The pilot harness (`docs/plan/sequoia-pilot-mvp/`) also needs a boundary, because
it writes member and contribution rows into PostgreSQL while the real product
intends the chain to be authoritative (ADR 0004).

## Decision

1. **No directly identifying personal data on chain.** Names, NIK, passports,
   addresses, selfies, documents, bank references, and evidence locators stay
   off-chain. The chain carries an issuer, a commitment, a level, an issue and
   expiry time, and a revocation status — nothing a reader can resolve to a
   person.
2. **Commitments are keyed and salted.** The on-chain value is
   `H(salt || member_id)` with the salt held off-chain by the co-op. A plain hash
   of a NIK is reversible by enumeration; a keyed commitment is not. The same
   subject must produce the same commitment across attestations, so a verifier
   can tell "same member" without learning "which member".
3. **Votes are secret.** A vote commits to a choice and reveals it in the tally
   phase, or is tallied without revealing it once a commitment scheme that
   supports that exists. A member's ballot is never a public, linkable datum.
   Quorum and threshold counts remain public; who voted how does not.
4. **The dashboard shows aggregates only.** Redemption coverage, project pool
   book value, endowment balance, losses absorbed, development spent, quorum
   counts. Never a member's balances, votes, KYC level, or identity.
5. **The pilot harness is synthetic and provisional.** Preprod only, synthetic
   KYC evidence, mock bank references, no real IDR and no real personal data. Its
   PostgreSQL rows are provisional projections with a `PILOT` source marker, not
   the co-op ledger; ADR 0004's pilot-exception section records why that does not
   reopen the off-chain-first door.

## Consequences

- The governance context cannot tally from plain vote UTxOs. It needs a reveal
  phase with a deadline, and a way to handle members who never reveal.
- Commit-reveal costs two transactions per vote and makes the vote window
  longer. Members who lose their salt lose their ballot.
- The issuer must be able to recompute a member's commitment, so the salt and the
  member reference are co-op-held secrets with their own custody rules.
- Public dashboards get harder to design: every per-member figure has to be
  aggregated before it leaves the API.
- The pilot harness cannot claim to be the ledger, which is what makes it
  disposable.

## Revisit

- **Secret ballot is the most likely decision here to be superseded.** A co-op
  may legitimately prefer roll-call accountability; if members vote for that, it
  replaces decision 3, not decisions 1, 2, 4, or 5.
- Keyed commitments assume the co-op can keep the salt. If a provider must
  verify without the co-op, a different scheme is needed.
- ZK proofs would let a member prove eligibility without a commitment at all;
  that is a later substitution for decision 2, not a change of intent.
