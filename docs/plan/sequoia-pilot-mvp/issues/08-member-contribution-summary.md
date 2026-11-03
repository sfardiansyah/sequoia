# 08: Member contribution summary

**What to build:** A member can see their own contribution record through the API.

- Extend `/members/me` with a contribution summary: year, annual amount, Member Capital, Capital Participation, and source.
- Return only the authenticated member’s records.
- Do not expose evidence refs, bank references, or other members’ data.
- Keep the existing member and KYC block.

**Blocked by:** 07 (contribution requires bank attestation).

**Status:** ready-for-agent

- [ ] `/members/me` returns the member’s contribution summary.
- [ ] The summary uses string output for bigint unit amounts.
- [ ] The response contains no bank reference or evidence ref.
- [ ] A member with no contribution still gets a valid empty summary.
