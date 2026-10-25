# Privacy and regulatory review: Sequoia co-op plan and ADRs

**Date:** 2026-10-25. **Scope:** `docs/plan/sequoia-plan.md`, ADRs 0001–0006, `docs/legal/cooperative-membership-and-surplus.md`, and the identity schema in `apps/api/src/infrastructure/database/migrations/0001_init.sql`.
**Status:** draft for counsel. **Prepared for counsel review. Not legal advice.**

Sources are primary unless marked. Source keys `[S#]` resolve in §9; plan/ADR citations by § are the internal sources at [S26]. "Unverified" means no primary text was located at the access date. Where a regulator PDF was blocked, the text was read from an official or mirrored gazette copy and is flagged in §9. No article number or URL is inferred.

---

## 1. Verdict

| Area | Verdict | Finding | Required action |
|---|---|---|---|
| Cooperative form and membership core | **Aligned** | UU 25/1992 supports open membership, board admission, one-member-one-vote, non-transferability, and an annual members' meeting. The plan's core matches. [S1: Pasal 5(1)(a), 18, 19, 21, 22, 24(3), 30(2)(b)] | Keep. Put every criterion and class in the AD; appoint a Pengawas and map the board multisig to the legal Pengurus. |
| `Simpanan wajib` tranche | **Aligned in category; drafting/accounting still needed** | `simpanan wajib` is now the chosen category, every member uses 70/30, and a founder may add an initial `modal penyertaan` instead of a different `simpanan wajib` amount. The plan text now uses a redemption reserve. The remaining risk is accounting and disclosure: if the AD, UI, or financial statements present it as a 1:1 deposit/liability, the savings characterisation returns. [S1: Pasal 41(2)(b); S3: Pasal 1 angka 15] | Book as `modal sendiri`; keep a 100% redemption reserve funded by the 70% cash tranche; disclose that it is not LPS-insured and can be deferred. Get a trust/insolvency and PSAK 50/71 opinion. |
| Surplus: 25% capital key | **Counsel; materially improved** | The split is now 20% endowment (`dana cadangan`) / 2.5% education / 52.5% patronage / 25% capital. Capital is 32.3% of member distributions, not 50%, and there is a `pendidikan perkoperasian` line. The zero-patronage case still makes the only member distribution capital-based, and “terbatas” has no statutory number. [S1: Pasal 5(1)(c)–(d), 45(2)–(3)] | Counsel opinion on 25% and 2.5%; gate zero-patronage distributions; confirm the education fund is retained and restricted. |
| Founder class and 5-year lock | **Counsel question** | No explicit prohibition on classes; Pasal 19(4) requires equal rights "sebagaimana diatur dalam Anggaran Dasar", and Pasal 24(3) preserves one vote. The lock is enforceable, if at all, as a capital-redemption lock, not a ban on resignation. Pasal 18(2) is for associate members, not founders. [S1: 18(2), 19(4), 24(3)] | Put a time-limited founder class, vesting, deferred claim, and sunset in the AD. Do not give extra votes. |
| Token / crypto characterisation | **Needs change / counsel** | Non-transferability reduces, but does not decide, whether the tokens are `aset kripto`/`aset keuangan digital`. Law 4/2026 gives OJK licensing categories and adds exchange/trading-provider rules; whether those reach a non-transferable membership token is unverified. POJK 23/2025 confirms the trading POJK does not regulate offerings; a draft offering POJK is pending. [S4: 221A; S6: 4(2); S7] | Obtain a token-characterisation opinion. Do not trade, market, or use the tokens as payment. Monitor the final offering POJK and PADK 3/2026. |
| Privacy architecture | **Blocker** | The design puts PKH, balances, votes, KYC expiry, and revocation status on a public chain; votes are public by default; proposal metadata goes to public IPFS; `member_commitment` is unspecified and a plain hash of NIK is brute-forceable. Erasure is not designed. [Plan §3.9, §4.5, §6.3, §7.2; ADR 0002] | New ADR 0007: no personal data on-chain; keyed commitments; secret ballot; off-chain mapping; DPIA before pilot. |
| UU PDP program | **Blocker before pilot** | §2.3 asserts "consent" and "PDP Law compliance" but there is no lawful basis per purpose, retention schedule, DPO, DPIA, breach runbook, DSAR procedure, processor DPA, transfer assessment, or privacy notice. [Plan §2.3; ADR 0002] | Build the program in §6–§7 before real member data. |
| GDPR | **Not in scope today; not uniformly stricter** | A closed Indonesian co-op with Indonesian members is likely outside Art 3. EU members, EU targeting, or monitoring EU users can bring it in. GDPR is more prescriptive and has larger administrative fines; UU PDP is stricter on deadlines, consent form, recording, and criminal liability. [S15; S17] | Document the Art 3 assessment. Adopt GDPR as a design baseline, not as a substitute for UU PDP. |
| AML/CFT | **Conditional; lower under this design** | A `koperasi yang melakukan kegiatan simpan pinjam` is a reporting party: CDD, 5-year retention, STR/goAML, monitoring. `simpanan wajib` alone is own capital, not simpan-pinjam; the main business is projects, not lending. If the co-op does not lend member funds or take withdrawable savings, it likely is not a PJK on this ground. The plan still has KYC but no AML program. [S10: 17(1)(a)(13), 18, 21(2); S11] | Confirm no lending/withdrawable-savings trigger; if none, keep CDD through the bank/provider and document the conclusion. If a PJK, build the full AML program before IDR. |
| Documentation | **Gap** | §10's mitigation ("encryption, access control, DPA, retention policy") is aspirational; none is specified or tested. | Policies, DPAs, DPIA, and evidence of operation. |

---

## 2. Indonesian cooperative and financial regulation

### 2.1 Statute and amendments

| Issue | Law | Finding | Effect on plan |
|---|---|---|---|
| Operative statute | UU 25/1992 | In force. UU 17/2012 was annulled in its entirety by Putusan MK 28/PUU-XI/2013 and UU 25/1992 revived "untuk sementara waktu". [S1; S24] | The plan's citations are to the operative statute. |
| Amendments | UU 11/2020, UU 6/2023 | The Cipta Kerja cooperative cluster is reported to have amended Pasal 6 and the elucidation to Pasal 17, and to have touched Pasal 21, 22, 43, and a new 44A. It did **not** amend the Pasal 5, 18–19, 24, 30, or 45 core the plan relies on. [S1; S2] | The membership and SHU core is unchanged. Verify the list against the consolidated text before filing the AD; the amendment list is not from the statute itself. |
| Fourth amendment | RUU Perubahan Keempat | DPR committee stage 17 June 2026; reported as still a draft. No enactment located as of 25 Oct 2026. [S23] | Do not draft the AD to the RUU. Re-check before mainnet. |
| Open membership | Pasal 5(1)(a) and Penjelasan | "keanggotaan bersifat sukarela dan terbuka"; the explanation says "tidak dilakukan pembatasan atau diskriminasi dalam bentuk apapun". [S1] | KYC and board admission are lawful if the AD states objective criteria. A closed founder class must be justified and time-limited. |
| Member is owner and user | Pasal 17(1) | "Anggota Koperasi adalah pemilik dan sekaligus pengguna jasa Koperasi." [S1] | A co-op of passive investors is weak. The patronage key needs real member transactions, not a notional figure. |
| Who may be a member | Pasal 18(1)–(2) | Full members: Indonesian citizens able to perform legal acts, **or a Koperasi**, meeting AD requirements. "Anggota luar biasa" (associate members) may have AD-defined rights. [S1] | §3.1's "possibly legal entities" is too broad: a PT cannot be a full member; a non-citizen cannot. They can only be associate members under 18(2). §7.9's "foreign members" needs the same fix. |
| Common interest / admission conditions | Pasal 19(1)–(2) | Membership is based on common economic interest in the co-op's business; it is acquired or ended when AD requirements are met. [S1] | The AD must define the common interest and objective conditions; the board applies them. |
| Equal rights / non-transferability | Pasal 19(3)–(4) | Membership cannot be transferred; members have equal duties and rights "sebagaimana diatur dalam Anggaran Dasar". [S1] | The `MEMBER` NFT's non-transferability aligns. A founder class with different economic rights needs an AD basis and objective justification. |
| Members' meeting is supreme | Pasal 22(1), 23 | The Rapat Anggota decides the AD, general policy, elections, work plan and budget, accounts, SHU, merger and dissolution. [S1] | On-chain votes can govern internal spending, but cannot replace a valid Rapat Anggota for statutory matters. The plan says this in §3.16; the process must actually do it. |
| Organs | Pasal 21 | The co-op's organs are Rapat Anggota, Pengurus, and Pengawas. [S1] | The plan describes a board and a supervisory board, but the governance/contract design has no Pengawas role. Appoint one and define its audit and oversight powers, including access to records. |
| Board execution | Pasal 30(1) | Pengurus manages the co-op and its business. [S1] | A 3-of-5 multisig is an internal control, not the legal organ. Bank mandates, contracts, and filings must be executed by authorized Pengurus; map keys to roles and minute the resolutions. |
| One member, one vote | Pasal 24(1)–(3) | Decisions are by musyawarah first, then majority; in a vote, "setiap anggota mempunyai hak satu suara." [S1] | Aligned. Do not let token balance or founder status affect votes. Voting is a fallback after musyawarah; on-chain votes are evidence, not the meeting. |
| Board admission | Pasal 30(2)(b) | Pengurus "memutuskan penerimaan dan penolakan anggota baru serta pemberhentian anggota sesuai dengan ketentuan dalam Anggaran Dasar." [S1] | Aligned, and ADR 0004's reasoning is correct. The AD must state the criteria. |
| Annual meeting | Pasal 26(1)–(2) | At least once a year; the accountability meeting is within six months of the fiscal year. [S1] | The §3.13 calendar aligns, provided a legal RA is held and minuted. |
| Capital categories | Pasal 41(1)–(3) | Own capital: `simpanan pokok`, `simpanan wajib`, `dana cadangan`, `hibah`. Loans may come from members. [S1] | Exit-only refund can fit `simpanan wajib`; if it is withdrawable while a member, it is not own capital. Map it to `simpanan wajib`, a member loan, or licensed savings. |
| `Modal penyertaan` | Pasal 42 | A co-op may raise `modal penyertaan`, further regulated by PP. [S1] | The at-risk `modal penyertaan` may fit, but the implementing PP and the "pemodal" concept need counsel. |
| Business scope | Pasal 43(1) | Co-op business must relate directly to members' interests. [S1] | A pool that funds generic third-party projects looks like an investment fund, not a co-op. Projects must serve members or be tied to member economic interest. |
| Savings and loans | Pasal 44 | A co-op may collect and lend member savings; implementation by PP. [S1] | This is the KSP gateway. See §2.2. |
| SHU | Pasal 45(1)–(3) | SHU after `dana cadangan` is shared by `jasa usaha`, and used for cooperative education and other co-op needs per the RA; the amount of `dana cadangan` is set by the RA. [S1] | The plan now allocates 20% to `dana cadangan` and 2.5% to a retained `dana pendidikan`. See §2.4. |

### 2.2 The redeemable tranche: `simpanan wajib`, member loan, or KSP?

The plan's facts: every member contributes 70% `simpanan wajib` / 30% `modal penyertaan`; a founder may commit an additional initial `modal penyertaan`. `simpanan wajib` is redeemable only at exit; the co-op holds a redemption reserve equal to 100% of outstanding `simpanan wajib`, funded by the 70% cash tranche. [Plan §2.2, §3.2, §3.6, §5.4] The plan does not permit withdrawal while the member remains a member.

**Design choice recorded (2026-10-25): `simpanan wajib`, same 70/30, founder extra `modal penyertaan`.** The plan owner has mapped the tranche to `simpanan wajib`, removed the class-differentiated 70/20 amount, and moved the founder difference into at-risk `modal penyertaan`. That is the right feature for this category: `simpanan wajib` cannot be withdrawn while the member remains a member. The choice removes the KSP/USP risk **if** the co-op does not lend member funds and does not operate the tranche as withdrawable savings. It does not remove the accounting and disclosure mismatch below.

The statutory categories do not fit cleanly:

| Category | Definition / rule | Does the plan fit? |
|---|---|---|
| `Simpanan pokok` | Same amount, paid on entry, **not withdrawable while a member**. [S3: Pasal 1 angka 14] | No: the plan pays annually, not on entry. |
| `Simpanan wajib` | Periodic amount, **not withdrawable while a member**; exit treatment is set by the AD. [S3: Pasal 1 angka 15] | **Chosen fit**: mandatory annual payment, same 70/30 for all, exit-only redemption. |
| `Simpanan` (KSP) | Funds entrusted by members as `tabungan` or `simpanan berjangka`. [S3: Pasal 1 angka 16] | **Not a fit** unless members can withdraw/roll over while remaining members. If the co-op operates it as savings or lends member funds, a KSP/USP licence is required. [S3: Pasal 2, 6(2)] |
| Member loan (`modal pinjaman`) | A co-op may borrow from members. [S1: Pasal 41(3)(a)] | Rejected at this stage: the co-op’s main business is not simpan pinjam; the tranche is equity. |
| `Modal penyertaan` | Separate capital participation, further regulated by PP. [S1: Pasal 42] | **Chosen for the at-risk tranche**, including the founder’s additional initial commitment. |

**Finding. The category fits; the remaining issue is presentation, not the category.** `Simpanan wajib` is `modal sendiri` under Pasal 41(2)(b), not a deposit liability. Three things must be consistent:

1. the AD, UI, and member-facing text must not reintroduce “deposit”, “deposit receipt”, or “refund”;
2. the redemption reserve must be described as **100% of `simpanan wajib`**, a liquidity policy, not “100% of liabilities”;
3. the 100% promise is a **redemption subject to solvency and liquidity**, not a bankruptcy-remote guarantee. If the reserve is short, redemption is deferred in request order.

The class-differentiated `simpanan wajib` is gone: every member uses 70/30, and the founder’s extra is 100% `modal penyertaan`. That removes the equal-treatment weak point under Pasal 19(4). If the co-op instead books `simpanan wajib` as a liability or lets members withdraw while remaining members, the KSP/USP question returns. Permenkop 8/2023 treats simpan-pinjam as high-risk, requires a licence, minimum `Modal Usaha Awal` of Rp500 million for a kabupaten/kota KSP, a SAM, goAML registration, and a beneficial-ownership statement. [S3: Pasal 6, 8, 19–22] A KSP is a co-op whose business is **only** simpan pinjam; a consumer/jasa co-op with other business is not a KSP, but any simpan-pinjam activity must sit in a licensed USP with separate books. [S3: Pasal 1 angka 2, 5]

**Implementation.** For `simpanan wajib`: put the equal 70% amount, the exit-only redemption, and the use of funds in the AD; book it as `modal sendiri`; call it `simpanan wajib` (or a neutral internal name), not a deposit; pay no fixed interest (it may earn a variable `jasa modal`); make redemption subject to the AD/RA and available funds; disclose that it is not LPS-insured. The founder extra is a separate `modal penyertaan` commitment, 100% at-risk and subject to the founder lock-up/vesting. The co-op must actually be able to redeem, and members are not protected depositors.

**Bankruptcy remoteness (material).** As a matter of ordinary insolvency law (counsel to confirm), accounts in the co-op's name are assets of the co-op. “Segregated” is an accounting label; it does not create a trust or remove the reserve from the insolvency estate. `simpanan wajib` is own capital, so members are residual claimants. It is not a protected bank deposit, and LPS insurance is generally understood not to cover member claims against a co-op; confirm with counsel. [S1: Pasal 41; S3: Pasal 6] The plan's “hard rule” that `simpanan wajib` is 100% covered by the redemption reserve [Plan §3.2, §6.6] is an internal liquidity invariant, not a legal guarantee. This needs a trust/insolvency and PSAK 50/71 opinion before any real IDR.

### 2.3 Founder class, open membership, associate members

| Question | Finding | Effect |
|---|---|---|
| May a co-op have different capital rights by class? | No explicit prohibition. Pasal 19(4) makes rights equal "sebagaimana diatur dalam Anggaran Dasar", and Pasal 24(3) preserves one vote. A time-limited founder class with different contribution splits and vesting is arguable. [S1: 19(4), 24(3)] | Put the class, split, vesting, conversion, and sunset in the AD. Do not create a permanent economic aristocracy. |
| Is the founder class an `anggota luar biasa` under Pasal 18(2)? | No. Pasal 18(2) is for associate members with AD-defined rights, typically non-citizens or entities that cannot be full members. Founders are full members. [S1: 18(1)–(2)] | Do not use 18(2) to solve the founder class. Use a full-member class with equal voting. |
| Five-year lock-up? | No statutory maximum. It can be drafted as a lock on **redemption** of `modal penyertaan`; a ban on **resignation** is not. Whether the redemption lock is enforceable is a counsel question. The plan already frames it as a `modal penyertaan` redemption lock in §10. [S1: 19(2), 41] | Draft the AD/bylaws as a redemption schedule, not a resignation prohibition. |
| Resigned founder's non-voting claim? | A former member can hold a contractual claim. It has no vote and no future surplus; subordination and payment order must be in the AD/bylaws. [S1: 19(2)] | Document the claim, beneficiary, and payment waterfall. |
| Open membership vs founder exclusivity | A closed founder class at genesis can be reconciled with Pasal 5(1)(a) if it is time-limited, objective, and in the AD. A permanent, inherited advantage is harder. [S1: 5(1)(a) and Penjelasan] | Sunset at month 60; no transfer of founder status. |
| Legal entities and foreigners | Full membership: Indonesian citizens or a Koperasi. Others: associate members under 18(2). [S1: 18] | Correct §3.1 and §7.9. If foreign members are admitted, assess GDPR and UU PDP cross-border issues. |

### 2.4 Surplus: the 25% capital key

The statute says:

> "pembagian sisa hasil usaha dilakukan secara adil sebanding dengan besarnya jasa usaha masing-masing anggota" — Pasal 5(1)(c).
>
> "pemberian balas jasa yang terbatas terhadap modal" — Pasal 5(1)(d).
>
> "Sisa Hasil Usaha setelah dikurangi dana cadangan, dibagikan kepada anggota sebanding dengan jasa usaha ... serta digunakan untuk keperluan pendidikan perkoperasian dan keperluan lain ... sesuai dengan keputusan Rapat Anggota." — Pasal 45(2). [S1]

**Arithmetic.** The plan allocates 20% endowment (`dana cadangan`), 2.5% education, 52.5% patronage, 25% capital. Member distributions are 77.5% of surplus; capital is 32.3% of that, patronage 67.7%. In a year with no patronage, the 52.5% patronage tranche goes to the endowment, leaving the 25% capital tranche as the only member distribution — so 100% of that year’s member distribution is capital-based. That is still the worst case for Pasal 5(1)(c)–(d), but the capital tranche is now 25%, not 40%. [Plan §3.17, §4.5; ADR 0005]

**Education and reserve.** Pasal 45(2) requires SHU to be used for `pendidikan perkoperasian` and other co-op needs per the RA. The plan allocates 20% to the endowment as `dana cadangan` and 2.5% to a retained `dana pendidikan` (2026-10-25). The reserve limb can be met **if** the AD names the endowment as `dana cadangan`, the RA sets or confirms the amount each year (Pasal 45(3)), and it is booked as `modal sendiri` (Pasal 41(2)(c)). The education limb is now addressed by the 2.5% retained fund. The endowment draws only for loss absorption and approved development; exit settlement is removed, so it is closer to the ordinary purpose of `dana cadangan`. The 20% is a funding rule; the AD must say the endowment **is** the `dana cadangan`, not a separate fund alongside it.

**Finding.** The dual-key direction is right; the 25% capital share and the zero-patronage case still need counsel. With the endowment as `dana cadangan`, the education line present, and capital below one-third of member distributions, the Pasal 5(1)(c)–(d) and 45(2) risk is materially lower than the old 40/40 model. The remaining issues are whether 25% is “terbatas” and whether a zero-patronage year should distribute at all. The existing legal note offers Reading A (capital at risk is a member service) vs Reading B (a PT holds the pool). [S1; `cooperative-membership-and-surplus.md` §2] Reading B doubles the system but is cleaner if counsel rejects A.

### 2.5 Crypto and digital assets: what §2.4 gets right and wrong

| Plan statement | Verified? | Correction |
|---|---|---|
| Law 4/2026 creates OJK licensing categories for crypto/digital asset institutions. | **Yes.** In force 17 June 2026. OJK licenses `LJK Aset Kripto` and `LJK AKD selain Aset Kripto`. [S4: 221A(1)–(2), 221F] | Law 4/2026 also contains exchange order-book and reporting rules for trading providers in Pasal 221A(8). Their application to a non-transferable membership token is unverified and is a counsel question. |
| Stablecoins may be used as transaction instruments but are not payment instruments. | **Yes.** The elucidation to Pasal 213 lists stablecoin as an ITSK activity after exchange recommendation and OJK approval, and says stablecoin cannot be used as a direct means of payment. [S4: Penjelasan Pasal 213 huruf h] | The plan does not use stablecoins, so this is background. |
| POJK 27/2024, as amended by POJK 23/2025, regulates trading and does not regulate primary offerings. | **Yes.** POJK 23/2025 replaces Pasal 4 and states: "Peraturan Otoritas Jasa Keuangan ini tidak mengatur penawaran Aset Keuangan Digital." [S6: Pasal 4(2)] | Correct. Add PADK 3/2026, the current trading/reporting implementing rule, which the plan does not mention. [S8] |
| A draft POJK on Digital Financial Asset Offerings would regulate issuance; reported requirements include an Indonesian PT, OJK licence above IDR 1 billion, 100% reserves, segregated custody. | **Partly.** OJK published a consultation draft on 19 September 2025; no final POJK was located as of 25 Oct 2026. The specific thresholds are secondary reporting, not verified in a final instrument. [S7] | Say "draft; monitor" and do not build to the reported thresholds. If finalised, an issuance licence may apply. |
| PBI 20/6/PBI/2018 applies if a token functions as e-money/payment. | **Yes, in principle.** E-money is a payment instrument issued on prepaid funds, stored electronically, used to pay merchants, and **not a deposit**. [S9: Pasal 1 angka 3] | The plan's tokens are non-transferable, member-only, and not accepted as payment, so they are likely outside e-money. That holds only if the co-op never markets them as redeemable payment balances or lets merchants accept them. |
| A non-transferable token is therefore not a digital financial asset. | **No.** Non-transferability reduces trading risk; it does not decide characterisation. The token is issued on a distributed ledger, represents a `simpanan wajib` equity record or an at-risk `modal penyertaan`, and is capable of being a digital asset. [S4: 221A; S6: Pasal 4(1)] | Obtain a written token-characterisation opinion covering `MEMBER`, `SW`, `PROJ`, `VOTE`, and `CLAIM`. Treat "not a stablecoin" as necessary, not sufficient. |
| The co-op may hold crypto/digital assets. | **Unverified / counsel.** No cooperative-specific prohibition was located. But the AD's business scope, Pasal 43, OJK/BI rules, custody, valuation, and tax all apply. | The plan says IDR only in bank accounts; keep it that way. The tokens should be membership records, not balance-sheet assets. |
| The project pool is not a security/collective investment. | **Unverified / counsel.** `PROJ` carries a variable book value and a share of surplus; members pool capital for projects. That is economically close to a fund. Non-transferable and member-only features help, but do not conclusively exclude `efek` or a collective investment. | Get a securities/capital-market opinion before mainnet. |
| The co-op is not an ITSK provider. | **Unverified / counsel.** Law 4/2026's ITSK definition includes "pihak lain yang melakukan kegiatan di sektor keuangan", including funding and project financing. [S4: 215(1)(d), Penjelasan Pasal 213] | If the co-op pools and deploys member capital, test whether OJK treats it as ITSK. |

**Conclusion.** The plan's §2.4 is directionally accurate on the trading regime and wrong to imply that "non-transferable, member-only, no stablecoin" settles the regulatory question. Using a blockchain purely as a membership-records layer is not prohibited as such; the constraints are token/offering characterisation, the AD's business scope, and privacy. The two live issues are (i) issuance/offering characterisation and (ii) Law 4/2026's trading-provider and reporting rules.

### 2.6 AML/CFT

| Obligation | Law | Plan / code | Gap |
|---|---|---|---|
| Is the co-op a reporting party? | A `koperasi yang melakukan kegiatan simpan pinjam` is a `Pihak Pelapor`. [S10: Pasal 17(1)(a)(13)] PP 43/2015 (check later amendments) lists it. [S11] | The plan does not decide whether it is a KSP. | If the refundable tranche is `simpanan`, the co-op is a PJK and must have an AML program. |
| CDD: identify, verify, monitor | `Pihak Pelapor` must apply `prinsip mengenali Pengguna Jasa`, at least identification, verification, and transaction monitoring. [S10: Pasal 18(2), (5)] | Privy/Sumsub identity checks; board admission; no risk rating. [Plan §2.3, §7.9] | No CDD file, risk rating, source of funds, PEP/EDD procedure, or ongoing monitoring. |
| Record retention | At least **5 years** after the end of the business relationship. [S10: Pasal 21(2)] | `kyc_attestations` keeps superseded rows; no retention period or deletion job. [Migration 0001] | No retention schedule; no legal hold; no deletion after 5 years. |
| STR / goAML | Reporting party must report suspicious transactions; KSP licensing requires goAML registration. [S10: Pasal 23; S3: Pasal 8(1)(l)] | None. | No MLRO, no STR workflow, no goAML account. |
| Beneficial ownership | KSP licence requires a BO statement. [S3: Pasal 8(1)(h)] | None. | No BO register for the co-op, founders, or controlling persons. |
| Sanctions/PEP | Part of CDD/EDD; Sumsub screens. | Sumsub for AML/sanctions. [Plan §7.9] | Ongoing screening and disposition records are not specified; on-chain revocation would leak the result. |
| Tax | Not assessed. | Annual amount, `modal penyertaan`, surplus, tokens. [Plan §2.5] | Accountant/counsel question; no primary analysis here. The material questions are whether the contribution is capital or a loan, whether `PROJ` distributions are member income, whether the endowment is a tax-exempt reserve, and whether token issuance is taxable. |

---

## 3. UU PDP compliance

**Status.** UU 27/2022 was enacted and came into force on **17 October 2022**; the two-year adjustment period ended **17 October 2024**. [S12: Pasal 74, 76] The often-quoted "in force since 17 Oct 2024" is the compliance deadline, not the commencement date. The implementing regulation is **PP 33/2026**, enacted 16 July 2026, effective **16 January 2027**, reported at 225 articles; the plan does not mention it. [S13] The PDP supervisory institution had not been established as of the latest reporting located (July 2026). [S12: Pasal 58; S27] The law is binding now; administrative sanctions wait on the institution, but the criminal provisions do not.

**ESO overlay.** The API/web app is likely an electronic system operator. PP 71/2019 requires registration before use, data-protection principles, erasure/delisting mechanisms, an audit trail, and security procedures. [S14: Pasal 6, 14–18, 22–24] A private-scope ESO may store data abroad, but must ensure effective supervision and provide access to the system and data. [S14: Pasal 21] There is no general data-localisation mandate for private ESOs; financial-sector rules may add one if the co-op becomes a KSP.

### 3.1 Processing map and roles

| Processing | Role | Data | Main issue |
|---|---|---|---|
| KYC via Privy | Co-op controller; Privy processor (verify) | NIK, name, address, DOB, selfie/biometric, passport, sanction/PEP result | Specific data; no DPA; retention; provider sub-processors; cross-border if any. |
| AML/sanctions via Sumsub | Co-op controller; Sumsub processor **or controller/joint controller** for its own screening | Identity, sanctions/PEP, risk score | Role is unverified; if Sumsub determines purposes/retention, it is a controller, not a processor. |
| Bank/payment (Xendit/Midtrans/Flip, bank) | Bank is a controller for its account/AML; payment provider may be processor for initiation, controller for its own AML | Name, account, amount, reference | No DPA/role allocation; no notice. |
| Cloud/S3/R2 evidence store | Processor | KYC documents, selfies, case files | Encryption/key management/access/retention; region/transfer. |
| Cardano chain | Co-op as issuer/controller; node operators are not processors | PKH, member_id, balances, votes, KYC expiry/revocation | Public, immutable, linkable; no DPA possible with node operators. |
| IPFS | Co-op controller; pinning provider processor; network participants not processors | Proposal docs, potentially names/invoices | Public, permanent, replicated; no deletion. |
| Public dashboard | Co-op controller | Aggregates; per-member balances if shown | Re-identification in small groups. |
| Indexer logs / Sentry | Processor(s) | Addresses, IPs, request metadata | Retention; log scrubbing; transfer. |

### 3.2 Obligations

| Obligation | Status in plan/code | Gap | Action |
|---|---|---|---|
| Lawful basis per purpose | §2.3 says "consent"; no purpose-by-purpose basis. | Consent is used for KYC/AML, which is mandatory; consent is not freely given. | Use contract for membership, legal obligation for KYC/AML/tax, consent only for optional public display. [S12: Pasal 20(2)] |
| Consent quality | Not specified. | Must be explicit, written/recorded, separate, understandable, in Indonesian; controller must prove it; bundling invalid. [S12: Pasal 21–24] | Consent register; separate toggles; withdrawal path. |
| Specific data | KYC collects NIK, biometrics, passport, financial data. | No heightened controls or DPIA. [S12: Pasal 4(2)] | Classify; restrict access; DPIA; retention. |
| Accuracy / correction | No procedure. | 3×24h correction duty; on-chain data cannot be corrected. [S12: Pasal 29–30] | Off-chain source of truth; correction workflow; on-chain versioning. |
| Purpose limitation | On-chain data is reusable by anyone. | Public chain enables secondary use; no technical limit. [S12: Pasal 27–28] | Minimise; no PII on-chain; notice. |
| Retention | No schedule. ADR 0002 says "retention is the exposure" but sets no period. | AML 5 years; PDP deletion; member register; tax; backups. [S1: 17(2); S10: 21(2); S12: 16(2)(g), 42–44] | Retention matrix + deletion jobs + legal hold. |
| Access / correction | Mentioned in §2.3; no procedure. | 3×24h deadline. [S12: Pasal 30, 32] | DSAR SOP; identity verification; log. |
| Erasure / destruction | No procedure. | On-chain immutability; 3×24h? (no explicit deadline for erasure, but must act). [S12: Pasal 8, 43–45] | Design for unlinkability; delete off-chain; explain limits. |
| Restriction / objection | Not addressed. | 3×24h. [S12: Pasal 41] | Workflow and system flags. |
| Consent withdrawal | Not addressed. | Stop processing within 3×24h. [S12: Pasal 40] | Withdrawal workflow; downstream propagation. |
| Portability | Not addressed. | Right to obtain/transmit in common format. [S12: Pasal 13] | Export tool; verify PP 33/2026 detail. |
| Automated decisions | Board admission is human; no profiling. | Right to object to solely automated decisions. [S12: Pasal 10] | Confirm no automated scoring; disclose. |
| DPO / privacy officer | None. | Triggers: public service; large-scale systematic monitoring; large-scale specific/criminal data. [S12: Pasal 53] | Appoint now; publish contact; independence. |
| DPIA | None. | Mandatory for specific data, systematic monitoring, new tech, combining datasets, limiting rights. [S12: Pasal 34(2)] | Do before pilot; see §5.8. |
| Breach notification | §2.3 says "breach process"; no runbook. | Written notice to **subjects and the institution within 3×24h**; content: data exposed, when/how, remediation. [S12: Pasal 46] | Runbook, templates, on-call, 3×24h clock. |
| Processor contracts | §2.3 asserts provider is processor; no DPA. | Instructions; written approval for sub-processors. [S12: Pasal 51] | DPAs with all vendors; sub-processor list. |
| Security | §7.2 says encrypted S3/R2; JWT keys in KMS. | No evidence-store KMS, access control, audit log, log scrubbing, backup policy. [S12: Pasal 35, 39] | Key management, least privilege, audit, encryption, pen test. |
| Cross-border transfer | No assessment. | Equal/higher protection; binding safeguards; consent fallback. [S12: Pasal 56] | Transfer assessment for Sumsub, cloud, indexer, IPFS, nodes. |
| Privacy notice | None. | Information duties; Indonesian language. [S12: Pasal 21; Penjelasan] | Layered notice in Indonesian + English. |
| ESO registration | None. | Register before use; audit trail. [S14: Pasal 6, 22] | Register via OSS; document. |
| Children / employees / marketing | Members must be adults able to act. [S1: 18(1)] Employees and marketing are not addressed. | No child data intended; no employee or marketing programme. | State out of scope; age gate; add an employee notice and a marketing consent rule if either starts. |
| Penalties | Not addressed. | Administrative fine up to **2% of annual revenue**; criminal exposure up to 6 years and IDR 6 billion, with corporate fines up to 10× the individual maximum, for unlawful collection/disclosure/use/falsification. [S12: Pasal 57, 67–70] | Board-level risk register; D&O awareness. |

---

## 4. GDPR

### 4.1 Does GDPR apply?

| GDPR Art 3 route | Does it apply? | Why |
|---|---|---|
| Art 3(1): establishment in the Union | **No, today.** | The co-op is established in Indonesia. A server, cloud region, or EU processor is not an establishment; an office, branch, or dependent agent with stable arrangements could be. [S15: Art 3(1); S17] |
| Art 3(2)(a): offering goods/services to data subjects in the Union | **Not on the current facts; can change.** | Indonesian members, IDR-only, Indonesian KYC, no EU marketing or EUR pricing. Admitting EU-resident members as a served class, EU advertising, or an EU-facing onboarding flow could be "offering". [S15: Art 3(2)(a); S17] |
| Art 3(2)(b): monitoring behaviour in the Union | **Not on the current facts; can change.** | No analytics/profiling described. If EU visitors are tracked, profiled, or behaviourally advertised to, this can apply. Ordinary security logs are not automatically "monitoring". [S15: Art 3(2)(b); S17] |
| EU processor only | **No, not by itself.** | Using an EU processor does not make the controller established or targeting the EU. The processor has its own GDPR obligations, and the contract may impose GDPR terms. |

**Conclusion.** A closed Indonesian co-op with Indonesian members is **likely outside GDPR**. It becomes in scope if it (i) opens an EU establishment, (ii) admits or targets EU-resident members as a service, or (iii) monitors EU users' behaviour. The plan is internally inconsistent: §1.2 says no global membership, while §7.9 mentions "foreign members" and §3.1 mentions legal entities. Resolve that first; it is the trigger.

If GDPR applies, Art 27 requires an EU representative (unless the narrow exemption applies), and Art 37 may require a DPO. If it does not apply, a voluntary "GDPR-aligned" programme is fine, but do not claim "GDPR compliant" in the privacy notice; that is a factual/contractual claim the co-op may not be able to support.

### 4.2 GDPR vs UU PDP

| Topic | GDPR | UU PDP | Who is stricter / different |
|---|---|---|---|
| Territorial scope | Art 3: establishment, offering, monitoring. | Pasal 2: territory, legal effect in Indonesia, Indonesian citizens abroad. | Similar; UU PDP expressly covers Indonesian citizens abroad. |
| Legal bases | Art 6(1): consent, contract, legal obligation, vital interests, public task, legitimate interests (with balancing). | Pasal 20(2): six bases, including "kepentingan yang sah lainnya" with purpose/need/balance. | GDPR more developed; UU PDP's legitimate-interest test is thinner. |
| Consent | Art 4(11), 7: freely given, specific, informed, unambiguous; easy withdrawal. | Pasal 20(2)(a), 21–24: **explicit**, written/recorded, separable, controller must prove; withdrawal stops processing in 3×24h. | **UU PDP stricter** on form and proof; GDPR stricter on "freely given" doctrine. |
| Special / specific data | Art 9: general prohibition + ten conditions; Art 10 criminal data. | Pasal 4(2): "specific data" (health, biometric, genetic, criminal, children, financial, other) with higher protection; no general prohibition. | GDPR stricter on prohibition/conditions; UU PDP broader categories. |
| Transparency | Arts 12–14: detailed content, timing, format. | Pasal 21: information duties; PP 33/2026 fills detail. | GDPR more prescriptive today. |
| Records of processing | Art 30; exemption for <250 employees in some cases. | Pasal 31: record **all** processing activities. | **UU PDP stricter** for a small co-op. |
| DPO | Art 37: public authority, large-scale systematic monitoring, large-scale special/criminal data. | Pasal 53: public service, large-scale systematic monitoring, large-scale specific/criminal data. | Similar; UU PDP's specific-data trigger is broad. |
| DPIA | Art 35: high risk; Art 35(3) examples. | Pasal 34(2): seven high-risk categories, including specific data, new tech, combining datasets, limiting rights. | **UU PDP broader** in some categories; GDPR more methodological. |
| Breach to authority | Art 33: 72h, unless unlikely risk. | Pasal 46: **3×24h**, no risk threshold, to the institution. | **UU PDP stricter** on time and scope. |
| Breach to subjects | Art 34: without undue delay if high risk. | Pasal 46: **3×24h**, same notice, no risk threshold. | **UU PDP stricter**. |
| Access / correction | Art 12(3): one month, extendable by two. | Pasal 30, 32: **3×24h**. | **UU PDP much stricter**. |
| Erasure | Art 17: qualified; exceptions. | Pasal 8, 43–45: erasure/destruction and notification; legal exceptions. | Similar, but UU PDP requires notification of deletion; on-chain problem is the same. |
| Restriction / objection | Arts 18, 21. | Pasal 11, 41: restriction within 3×24h. | **UU PDP stricter** on deadline. |
| Portability / automated decisions | Art 20; Art 22. | Pasal 13; Pasal 10 (objection; further by PP). | GDPR more detailed on automated decisions; portability similar. |
| International transfers | Chapter V: adequacy, SCCs, BCRs, derogations; Schrems II/TIA. | Pasal 56: equal/higher protection; binding safeguards; consent fallback. | GDPR more operational; UU PDP's "equal or higher" is vague and potentially stricter (the statute creates no adequacy list). |
| Processor contracts | Art 28: mandatory terms. | Pasal 51: instructions; written approval for sub-processors; PP 33/2026 detail. | GDPR stricter/more detailed today. |
| Joint controllers | Art 26: arrangement, essence, contact. | Pasal 18: agreement, common purposes, contact. | Similar. |
| Representative | Art 27: EU representative for Art 3(2). | None. | **GDPR stricter**. |
| Fines | Art 83: up to €10m/2% or €20m/4% of worldwide turnover, whichever is higher. | Pasal 57: up to **2% of annual revenue**; plus criminal exposure up to 6 years/IDR 6bn and corporate fines up to 10×. | GDPR higher administrative fines; UU PDP adds criminal liability. |
| Enforcement | Mature DPAs, EDPB, one-stop shop. | Institution not yet established (July 2026); criminal courts still available. [S27] | GDPR enforcement risk higher today; UU PDP risk is rising. |

### 4.3 Is GDPR "more rigid" than UU PDP?

**No, not uniformly.** The premise is half right.

**Where GDPR is stricter or more demanding:**
- Legal-basis discipline: legitimate interests require a documented balancing test; consent must be genuinely freely given; special-category processing is prohibited unless a condition applies. [S15: Arts 6, 9]
- Transparency and accountability: detailed notices, records, DPIA methodology, processor contracts, joint-controller arrangements, EU representative. [S15: Arts 12–14, 26–30, 35, 37]
- International transfers: adequacy decisions, SCCs, BCRs, transfer impact assessments, Schrems II. [S15: Chapter V; S20]
- Administrative fines: up to 4% of worldwide turnover, with mature enforcement. [S15: Art 83]
- Rights detail: portability, objection, automated decisions, restriction. [S15: Arts 17–22]

**Where UU PDP is stricter or has obligations GDPR lacks:**
- Fixed **3×24h** deadlines for access, correction, withdrawal, restriction, and breach notification to **both** subjects and the authority. GDPR gives one month for access and 72 hours for breach to the authority, with risk thresholds.
- Breach notification has **no risk threshold**; every failure requires notice to subjects and the institution. [S12: Pasal 46]
- Consent must be **explicit** and written/recorded; the controller must prove it; bundling is void. [S12: Pasal 21–24]
- Record **all** processing activities, with no small-organisation exemption. [S12: Pasal 31]
- Criminal liability for unlawful collection, disclosure, use, or falsification of personal data (up to 6 years; IDR 6 billion; corporate fines up to 10×). [S12: Pasal 67–70]
- Indonesian-language consent requests and notices. [S12: Pasal 22(4)(c) and Penjelasan; PP 33/2026 may add detail]
- Data destruction orders as an administrative sanction. [S12: Pasal 57(2)]
- No statutory adequacy list; transfers require "equal or higher" protection, binding safeguards, or consent. [S12: Pasal 56]

**Practical conclusion.** Use GDPR as the **design baseline** for lawful-basis mapping, DPIA, vendor contracts, security, rights, and transfer analysis. Then add the UU PDP overlay: 3×24h clocks, Indonesian notice, explicit consent only where consent is genuinely optional, all-processing records, criminal-risk controls, and the local institution. **GDPR compliance does not equal UU PDP compliance**, and a GDPR-only notice would fail UU PDP's language and deadline rules.

---

## 5. Blockchain-specific privacy analysis

### 5.1 What is personal data here

| Data | On-chain? | Personal data? | Why |
|---|---|---|---|
| `owner` PKH / wallet address | Yes | **Yes, in the co-op's hands; potentially for third parties.** | Pseudonymous, but linkable to the member via KYC and the `subject_pkh` row. EDPB: public keys are personal data if identifiable by means reasonably likely, including in a breach. [S16] |
| `member_id` | Yes | **Yes** if it is a stable pseudonym or derived from NIK. | Linkable to the member register; a random per-member ID is still pseudonymous, not anonymous. [S16] |
| `member_commitment` | Yes (plan §6.3) | **Yes if the co-op holds the salt/key; may become non-personal if truly destroyed.** | A plain hash of NIK is brute-forceable; unsalted hashes are generally insufficient for public chains. [S16] |
| KYC level, expiry, `revoked` | Yes | **Yes**, and revocation may reveal sanctions/PEP status. | Linkable to the member; sensitive in context. [S16] |
| `SW` / `PROJ` balances | Yes | **Yes**: financial data, a specific category under UU PDP. | Public chain exposes each member's position. [S12: Pasal 4(2)(f)] |
| Vote choice + `member_id` | Yes | **Yes**; potentially sensitive. | Links a member to a governance choice; public by default enables coercion. [S12: Pasal 4(2); S15: Art 9] |
| Merkle root over `(member_id, weights)` | Yes | **Yes if the leaves/salt are linkable; may be unlinkable after deletion.** | A commitment is only as anonymous as the off-chain data and salt. [S16] |
| Proposal metadata on IPFS | Yes (URI/hash) | **Yes if the content includes names, invoices, recipients, beneficiaries.** | Public, content-addressed, replicated; no deletion. [S16] |
| Dashboard aggregates | No | **No if k-anonymous; yes if small cells.** | Re-identification in a 10–30 member pilot. [S16] |
| `evidence_ref` | No | **Yes if it is a path/case ID containing PII.** | Opacity is not encryption; ADR 0002 calls it a pointer, not a proof. |
| Bank attestation (amount, bank reference) | Yes (UTxO) | **Yes if linked to a member or account.** | A unique bank reference plus amount can identify the payer; keep the reference off-chain or hashed and publish aggregates only. |
| `subject_pkh`, `revoke_reason` | No | **Yes**; `revoke_reason` may be special-category data. | Free-text reason can contain health, sanctions, or criminal allegations. |

### 5.2 Erasure vs immutability

Art 17 GDPR and UU PDP Pasal 8, 43–45 give erasure/destruction rights, subject to legal-retention exceptions. On a public chain, deletion is technically impractical. The EDPB treats immutability as a design constraint rather than an excuse: controllers must assess erasure before putting personal data on-chain and must be able to render it unlinkable where erasure is requested. [S16]

The only credible mitigation is architectural:
1. Never put directly identifying data on-chain.
2. Put only a keyed commitment or nullifier on-chain.
3. Keep the member register, KYC evidence, vote mapping, and Merkle leaves off-chain, encrypted, access-controlled.
4. On erasure/retention end, delete the off-chain mapping and destroy the salt/key; the commitment should then be unlinkable. [S16]
5. Disclose in the notice that on-chain commitments are permanent but designed to be unlinkable after key destruction; do not promise deletion of the chain.
6. If the co-op cannot credibly destroy the link (e.g., it must keep the mapping for AML or claims), the on-chain commitment remains personal data, and the design fails the erasure test. Do not put it on-chain.

### 5.3 Commitments: a plain hash of NIK is not enough

NIK is a 16-digit structured identifier with low entropy (region, date of birth, gender, sequence). A plain `SHA-256(NIK)` can be enumerated; an unsalted hash on a public chain is effectively a reversible identifier. [S16]

Minimum specification for `member_commitment`:
- `HMAC-SHA256(K_global, domain || member_id || per_member_salt)` with a secret key held in KMS and a per-member random salt stored off-chain; or a hiding commitment (e.g., Pedersen) with a random blinding factor.
- Domain separation (`sequoia:kyc:v1`) and a version byte.
- No reuse across purposes (KYC, voting, distribution) without domain separation.
- Key rotation and re-commitment plan; old commitments must remain verifiable for audit.
- Salt/key stored encrypted, access-logged, never in the same store as the commitment.
- Test vectors and a written spec; "salted commitment" in §2.3 is not a specification.

If the co-op holds the key and salt, the commitment is personal data in its hands; the erasure mechanism is destruction of the key/salt, not deletion of the chain.

### 5.4 Voting

The plan makes votes public by default and defers commit-reveal. [Plan §3.9] That is a privacy-by-default problem: it links a named member to a choice, enables coercion, and creates a permanent public political/economic record. Commit-reveal only moves the disclosure; it does not erase it.

Recommendation:
- Default to a **secret ballot**: on-chain `VOTE` datum contains a proposal ID, a nullifier (proof the voter is a member and has not voted), and a commitment to the choice; no `member_id`, no `choice`, no weight.
- Publish aggregate yes/no/abstain and a tally proof; members verify their own vote with a private receipt.
- Keep the member-to-nullifier mapping off-chain, encrypted, deleted after the challenge period.
- If public votes are a product requirement, make them **opt-in per vote**, with a separate notice and DPIA; do not make them the default.
- The `VoteDatum` in §6.3 (`member_id`, `choice`, `weight`) is the wrong shape for privacy and should be redesigned before mainnet.

### 5.5 IPFS

IPFS is public, content-addressed, replicated, and not deletable by unpinning. [S16] Proposal metadata can contain proposer names, recipient identities, invoices, project beneficiary data, and personal stories.

Recommendation:
- Enforce a metadata schema that rejects personal data; review before pinning.
- Put public, non-personal documents on IPFS; put anything with personal data in an encrypted off-chain store and put only the hash on-chain.
- Treat the pinning provider as a processor; DPA; no promise of deletion beyond unpinning.
- If a data subject exercises erasure, delete the off-chain encrypted blob and the encryption key; the CID may remain but the content is unintelligible. If the content was public and replicated, erasure is not achievable; do not put it there.

### 5.6 Dashboard and on-chain balances

The dashboard is only one leak. `MemberDatum` already contains `simpanan_wajib`, `modal_penyertaan`, `kyc_expiry`, and `status`, and the KYC attestation UTxO carries `level`, `expires_at`, and `revoked` on a public chain. [Plan §6.3] Anyone can read every member's balance and KYC expiry/revocation. A dashboard that aggregates does not fix the chain.

Options:
- Accept public balances and disclose them; require explicit consent and a DPIA; accept that some members will not join.
- Move balances to commitments and keep the ledger off-chain; publish aggregate reserve attestations; this changes the "chain is the ledger" ADR 0004.
- Use a permissioned/private chain for member records; keep only aggregate proofs on public Cardano. Restricting who can read the data is the architecture the EDPB treats as least exposed, though it does not remove the need for a lawful basis or erasure plan. [S16]

The plan's "public dashboard shows reserve coverage" is fine; per-member balances and votes on a public chain are not.

### 5.7 Cross-border transfers and nodes

If GDPR applies, replicating personal data to nodes outside the EEA is a transfer; SCCs with anonymous node operators are impractical. The EDPB says transfers must be addressed at design time, and public permissionless nodes are a known difficulty. [S16] Under UU PDP, the same data flow needs equal/higher protection, binding safeguards, or consent. [S12: Pasal 56]

Cardano nodes and IPFS participants are not the co-op's processors in any contractual sense and cannot be contracted. That is another reason to keep personal data off-chain. If only commitments are on-chain, the transfer analysis is about the off-chain processors (Sumsub, cloud, indexer), which can be contracted.

### 5.8 DPIA and EU representative

**DPIA is mandatory under UU PDP.** Pasal 34(2)(b) triggers on processing **specific data** (NIK, biometrics, financial data), and (d)/(f) on systematic monitoring/new technology. There is no scale qualifier for (b). The co-op processes all of these. Under GDPR, Art 35(1) and (3)(b) apply if in scope; even at 10–30 members, the public chain, new technology, and evaluation of members make high risk arguable. Do the DPIA before the pilot.

The DPIA must cover: purposes and lawful bases; data categories and flows; on-chain/off-chain map; necessity and proportionality of blockchain (why public? why per-member data? alternatives); risks of re-identification, immutable disclosure, coercion via public votes, IPFS permanence, cross-border replication, insider access, key loss; mitigations (commitments, secret ballot, aggregation, encryption, retention, DPAs); residual risk and sign-off; review triggers.

**EU representative.** Only if Art 3(2) applies. If the co-op admits EU-resident members as a served class or targets/monitors the EU, appoint one under Art 27. If it remains out of scope, no representative is required.

---

## 6. Gaps ranked

### 6.1 Blockers before real IDR / mainnet

| # | Gap | Repo evidence | Why it blocks | Action |
|---|---|---|---|---|
| B1 | `simpanan wajib` is chosen, but the 1:1 "deposit/liability" framing and the non-bankruptcy-remote redemption remain. | Plan §2.2, §3.2, §3.6, §5.4; ADR 0005 | The category fits, but the accounting and member promise do not: `simpanan wajib` is own capital, not a protected deposit. KSP/USP risk returns if it is operated as savings or member funds are lent. | Rename and book as `modal sendiri`; keep the 100% redemption reserve as a liquidity policy; disclose deferral and no LPS; trust/insolvency/PSAK opinion. |
| B2 | 25% capital share; zero-patronage distribution is capital-only; 2.5% education is now present. | Plan §3.5, §3.17, §4.5; ADR 0005, 0006 | Pasal 5(1)(c)–(d), 45(2) risk is lower but not resolved; the reserve and education limbs are addressed by choice, not yet by AD/RA text. | Counsel on 25% and 2.5%; gate zero-patronage distributions; name the endowment `dana cadangan` and the education fund in the AD. |
| B3 | Token/issuer characterisation and Law 4/2026 exchange-reporting. | Plan §2.2, §2.4; ADR 0004 | Unlicensed issuance/offering; reporting breach; securities/ITSK risk. | Token opinion; no trading/payment; monitor final POJK/PADK. |
| B4 | Public on-chain PKH, balances, votes, KYC expiry/revocation; IPFS; plain-hash commitment. | Plan §3.9, §6.3, §7.2; ADR 0002 | Irreversible disclosure; erasure impossible; DPIA high risk. | ADR 0007; no PII on-chain; keyed commitments; secret ballot; aggregate dashboard. |
| B5 | No UU PDP operating model: basis, DPIA, DPO, retention, DPAs, notice, DSAR, breach, transfers. | Plan §2.3; ADR 0002 | Unlawful processing; 3×24h breaches; criminal exposure. | Build §7 program before pilot. |
| B6 | No AML program if the co-op is a PJK; the current design likely avoids PJK status but this is unconfirmed. | Plan §2.3, §7.9; Migration 0001 | CDD/retention/STR/goAML/BO failures if lending or withdrawable savings exist. | Confirm no simpan-pinjam trigger; if none, document it and rely on bank/provider CDD. If a PJK, AML manual, MLRO, goAML. |

### 6.2 Required before pilot with real member data

| # | Gap | Repo evidence | Action |
|---|---|---|---|
| P1 | `evidence_ref` is an unverified pointer, possibly containing PII; no encryption/access/retention. | ADR 0002; Migration `evidence_ref`; Plan §7.2 | Classify; encrypt; least privilege; audit; retention. |
| P2 | `subject_pkh` is stored and linkable; `revoke_reason` is free text. | Migration `kyc_attestations`; `members.owner_pkh` | Treat as personal data; restrict; retention; no free-text sensitive reasons. |
| P3 | `member_commitment` construction unspecified; plain hash risk. | Plan §2.3, §6.3; ADR 0002 | Spec: HMAC + per-member salt + KMS; test vectors. |
| P4 | Votes public by default; `VoteDatum` includes `member_id`/`choice`. | Plan §3.9, §6.3 | Secret ballot; nullifier; no member_id/choice; opt-in only. |
| P5 | Proposal metadata on public IPFS. | Plan §4.3, §7.2 | No-PII schema; encrypted off-chain; hash on-chain. |
| P6 | Dashboard/chain exposes balances and coverage. | Plan §4.10, §5.5, §6.3 | Aggregate; k≥5; commitments/permissioned chain; notice. |
| P7 | No processor DPAs or role analysis (Privy, Sumsub, bank/payment, cloud, IPFS, indexer, Sentry). | Plan §2.3, §7.2, §7.9 | DPAs; sub-processor list; controller/processor mapping. |
| P8 | No cross-border transfer assessment. | Plan §7.2, §7.9 | UU PDP Pasal 56 assessment; SCCs/TIA; no PII on public nodes. |
| P9 | No retention schedule; AML 5 years vs PDP deletion. | ADR 0002; Migration; UU 8/2010 Pasal 21(2) | Retention matrix; legal hold; deletion jobs; salt/key destruction. |
| P10 | No privacy notice, DSAR, breach runbook, consent register. | Plan §2.3 | Indonesian notice; 3×24h SOPs; templates; training. |
| P11 | No DPIA, DPO/privacy officer. | Plan §2.3 | DPIA before pilot; appoint officer. |
| P12 | No evidence-store key management/audit log. | Plan §7.2; Migration | KMS, envelope encryption, rotation, access logs, backups. |
| P13 | ESO registration and audit trail not addressed. | Plan §7.2 | Register; implement PP 71/2019 audit trail. |
| P14 | KYC revocation does not freeze membership. | ADR 0002; Plan §4.9 | Gate voting/contributions/exit on valid attestation; legal review. |
| P15 | Member register/beneficial ownership not mapped. | Plan §3.1; Migration | Off-chain register; BO register; statutory access. |
| P16 | Bank attestation datum may expose a member's payment amount/reference. | Plan §6.2, §7.5 | Keep the bank reference off-chain or hashed; publish only aggregate reserve/spend figures. |

### 6.3 Documentation / policy gaps

ADR 0007 (privacy architecture and commitment scheme); record of processing activities; retention schedule; DPO appointment letter; DPIA report; DPA register and sub-processor list; transfer assessment; privacy notice (ID/EN); DSAR SOP; breach runbook; consent policy/register; on-chain data classification; IPFS metadata policy; dashboard aggregation policy; AML manual and BO register; vendor security register; audit-log policy; backup/restore policy; employee/contractor notice; cookie/analytics notice (if used); training and annual review; Pengawas charter, appointments, and access rights.

---

## 7. Recommended decisions

**One new ADR 0007 — "Privacy architecture: off-chain personal data, on-chain commitments."** It should decide:

| # | Decision | Rationale |
|---|---|---|
| D1 | No directly identifying personal data on-chain. Allowed on-chain: protocol state, aggregate totals, keyed commitments, nullifiers, hashes of non-personal documents. | [S16]; UU PDP erasure; avoids impossible deletion. |
| D2 | `member_commitment` = HMAC-SHA256(K_global, domain, member_id, per-member salt); KMS-held key; domain separation; versioning; test vectors. No plain hash of NIK. | NIK low entropy; unsalted hashes are brute-forceable. [S16] |
| D3 | Secret ballot by default: `VOTE` = proposal ID + nullifier + choice commitment; no `member_id`, `choice`, or weight; aggregate tally only. Public votes only by explicit opt-in and DPIA. | Privacy by default; avoids coercion and permanent political record. |
| D4 | KYC revocation stays off-chain. On-chain only an "eligible/not eligible" proof with short expiry; no reason, no sanctions/PEP flag. | Revocation reason is sensitive; public flag leaks. |
| D5 | Balances: either commitments with off-chain ledger, or a permissioned/private member record; if public balances remain, explicit disclosure, consent where valid, and DPIA. Dashboard aggregate only. | Public financial data is specific data; irreversible. |
| D6 | IPFS: no personal data; encrypted off-chain blobs; on-chain hash; schema validation before pinning. | IPFS is permanent and replicated. |
| D7 | Retention: AML 5 years after relationship; member register per co-op law; tax/accounting per counsel; delete off-chain mapping and destroy salt/key at retention end; document unlinkability. | Reconciles UU 8/2010 Pasal 21(2) with UU PDP Pasal 42–44. |
| D8 | Appoint a privacy officer/DPO now; complete a DPIA before pilot; maintain RoPA; publish an Indonesian privacy notice; operate 3×24h DSAR and breach workflows. | UU PDP Pasal 31, 34, 46, 53. |
| D9 | DPAs with all processors; transfer assessment; ESO registration; KMS/access/audit for evidence; log scrubbing. | UU PDP Pasal 51, 56; PP 71/2019. |
| D10 | Review triggers: new data category, new chain/network, EU member/targeting, KSP licence, final offering POJK, PP 33/2026 effective date. | Avoid drift. |

**Operational documents:** retention schedule; DPIA; RoPA; DPA register; transfer assessment; privacy notice; DSAR SOP; breach runbook; consent register; on-chain data classification; commitment spec; IPFS policy; dashboard policy; AML manual/BO register; training.

The notice must state, per purpose: basis, data categories, recipients, transfers, retention, rights and 3×24h clocks, the on-chain disclosure (what is public, immutable, and how unlinkability is designed), and the DPO contact.

---

## 8. Open questions for counsel

1. **KSP:** We have chosen `simpanan wajib`, with the same 70/30 split for all members and a founder-only extra `modal penyertaan`. Confirm that (a) this is a valid AD structure under Pasal 19(4), (b) an exit-only redemption is a permitted AD term, and (c) no KSP/USP licence is needed if the co-op does not lend and does not allow withdrawal while a member.
2. **Bankruptcy remoteness:** Can the redemption reserve be held in trust/escrow so it is not part of the co-op's insolvency estate? Does LPS or any guarantee apply? If not, how is the 100% redemption promise disclosed?
3. **SHU:** Is a 25% capital share (32.3% of member distributions) “terbatas” under Pasal 5(1)(d)? Is total equity (`simpanan wajib` + `modal penyertaan`) the right capital weight? What happens in a zero-patronage year?
4. **Statutory allocations:** We designate the 20% endowment as `dana cadangan` and 2.5% as a retained `dana pendidikan`. Confirm the AD wording, that the RA sets or confirms the amounts annually, and that the endowment does not settle exits.
5. **Founder class:** Is a time-limited founder class with the same 70/30 split, an additional initial `modal penyertaan`, and vesting consistent with Pasal 19(4) and open membership? Is a 5-year `modal penyertaan` redemption lock enforceable? Can a resigned founder hold a non-voting claim?
6. **Membership eligibility:** Can a PT or a foreign individual be a full member, or only an associate member under Pasal 18(2)? What rights can associate members have without violating one-member-one-vote?
7. **Tokens:** Are `MEMBER`, `SW`, `PROJ`, `VOTE`, `CLAIM` "aset kripto"/"aset keuangan digital" under Law 4/2026 and POJK 27/2024 as amended? Does Pasal 221A(8) require exchange reporting for a non-transferable membership token? Is an issuer licence needed under the final offering POJK?
8. **Securities/ITSK:** Is the project pool a collective investment or `efek`? Is the co-op an ITSK provider under Law 4/2026 Pasal 215? Does member-only, non-transferable status avoid a public offering?
9. **Crypto holding:** May the co-op hold digital assets on its balance sheet, or only use the chain as a records layer? What custody/valuation/tax rules apply?
10. **AML:** If the co-op is a PJK, what is the CDD/EDD standard for fixed annual member contributions, and who files STRs — the co-op, the bank, or the payment provider? What is the BO definition for a co-op?
11. **Retention:** How should the 5-year AML retention interact with UU PDP erasure for KYC evidence, the member register, and on-chain commitments? What retention applies to co-op minutes and member registers?
12. **Controller/processor:** Is Sumsub a processor or an independent controller for sanctions screening? Is the bank a controller? What DPA/joint-controller terms are required?
13. **Public votes:** Is a member's vote "specific personal data" or a political opinion? Can public-by-default voting be based on consent, or does it require a different basis/design?
14. **On-chain revocation:** Can sanctions/PEP revocation status be published on-chain? What disclosure is permitted under AML tipping-off rules and UU PDP?
15. **Cross-border/localisation:** If the co-op becomes a KSP, do OJK rules require local data centres or specific transfer approvals? What is the UU PDP "equal or higher" test for the UK/EU/Singapore/US?
16. **Tax:** How are the annual contribution, member loan, `PROJ` distribution, endowment, and token issuance taxed?
17. **Endowment:** Is a fund that absorbs members' project losses before their own capital permissible as a co-op instrument, and how is it presented in the AD and the annual financial statements? (ADR 0006 already flags this.)
18. **Pengawas:** Who appoints the supervisory board, what records may it access, and how do its statutory powers interact with the on-chain audit trail?

---

## 9. Sources

Accessed 2026-10-25. `*` = secondary source used only to locate or contextualise a primary instrument. `†` = text read from a copy of the gazetted text because the regulator PDF was blocked; the instrument URL is the primary citation.

| Key | Instrument | Article / paragraph | URL |
|---|---|---|---|
| S1 | UU 25/1992 tentang Perkoperasian | Pasal 5, 17–19, 22–26, 30, 41–45; Penjelasan Pasal 5(1)(a) | https://peraturan.bpk.go.id/Details/46650/uu-no-25-tahun-1992 ; full text: https://jdih.kemenkeu.go.id/api/download/fulltext/1992/25tahun~1992uu.htm ; elucidation: https://jdih.kemenkeu.go.id/api/download/fulltext/1992/25TAHUN~1992UUPenj.htm |
| S2 | UU 11/2020 Cipta Kerja, Pasal 86; UU 6/2023 | Pasal 6, Penjelasan 17, 21, 22, 43, 44A | https://id.wikisource.org/wiki/Halaman:UU_Nomor_11_Tahun_2020_tentang_Cipta_Kerja.pdf/573 † ; https://peraturan.go.id/files/uu-no-6-tahun-2023.pdf |
| S3 | Permenkop UKM 8/2023 tentang Usaha Simpan Pinjam oleh Koperasi | Pasal 1 angka 2, 14–16; 2; 5; 6; 8; 19–22 | https://peraturan.go.id/id/permenkop-kukm-no-8-tahun-2023 ; PDF: https://peraturan.go.id/files/permenkop-kukm-no-8-tahun-2023.pdf |
| S4 | UU 4/2026 (P2SK amendment) | Pasal 213 Penjelasan huruf h; 215(1)(d); 221A(1)–(8); 221C; 221F | https://peraturan.bpk.go.id/Details/350166/uu-no-4-tahun-2026 † |
| S5 | POJK 27/2024 tentang Penyelenggaraan Perdagangan AKD termasuk Aset Kripto | Trading framework | https://ojk.go.id/id/regulasi/Pages/POJK-27-2024-AKD-AK.aspx |
| S6 | POJK 23/2025 (amending POJK 27/2024) | Pasal 4(2) | https://ojk.go.id/id/regulasi/Pages/POJK-23-2025-Perubahan-POJK-27-Tahun-2024-tentang-Penyelenggaraan-Perdagangan-Aset-Keuangan-Digital-Termasuk-Aset-Kripto.aspx ; PDF: https://peraturan.go.id/files/peraturan-ojk-no-23-tahun-2025.pdf |
| S7 | RPOJK Penawaran Aset Keuangan Digital | Consultation draft, 19 Sep 2025 | https://ojk.go.id/id/regulasi/otoritas-jasa-keuangan/rancangan-regulasi/Pages/RPOJK-Penawaran-Aset-Keuangan-Digital.aspx |
| S8 | PADK 3/2026 tentang Penyelenggaraan Perdagangan AKD termasuk Aset Kripto | Trading/reporting implementing rule | https://ojk.go.id/id/regulasi/Pages/PADK-Nomor-3-Tahun-2026-Penyelenggaraan-Perdagangan-Aset-Keuangan-Digital-termasuk-Aset-Kripto.aspx |
| S9 | PBI 20/6/PBI/2018 tentang Uang Elektronik | Pasal 1 angka 3 | https://www.bi.go.id/en/publikasi/peraturan/Pages/PBI-200618.aspx |
| S10 | UU 8/2010 tentang Pencegahan dan Pemberantasan TPPU | Pasal 17(1)(a)(13); 18(2), (5); 21(2); 23 | https://jdih.kemenkeu.go.id/api/download/fulltext/2010/8TAHUN2010UU.htm |
| S11 | PP 43/2015 tentang Pihak Pelapor | Pasal 2 list | https://jdih.ppatk.go.id/produk-hukum/detail/883/peraturan-pemerintah-nomor-43-tahun-2015-tentang-pihak-pelapor-dalam-pencegahan-dan-pemberantasan-tindak-pidana-pencucian-uang |
| S12 | UU 27/2022 tentang Pelindungan Data Pribadi | Pasal 1, 2, 4, 6–13, 16, 20–24, 29–32, 34, 35, 39–46, 51, 53, 56, 57, 67–70, 74, 76 | https://jdih.komdigi.go.id/produk_hukum/view/id/832/t/undangundang+nomor+27+tahun+2022 ; https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022 |
| S13 | PP 33/2026 tentang Peraturan Pelaksanaan UU 27/2022 | 225 pasal; effective 16 Jan 2027; LN 2026/88, TLN 7190 | https://jdih.setneg.go.id/produk-hukum/instrumen/peraturan (listing; article-level text not yet reviewed); https://meridianhukum.com/peraturan/pp-no-33-tahun-2026 * |
| S14 | PP 71/2019 tentang Penyelenggaraan Sistem dan Transaksi Elektronik | Pasal 6, 14–18, 20–24 | https://jdih.komdigi.go.id/produk_hukum/view/id/695/t/peraturan+pemerintah+nomor+71+tahun+2019 ; https://peraturan.bpk.go.id/Details/122030/pp-no-71-tahun-2019 |
| S15 | GDPR (EU) 2016/679 | Arts 3, 4, 6, 9, 12–14, 17–22, 25–28, 30, 32–35, 37, 44–49, 83 | https://eur-lex.europa.eu/eli/reg/2016/679/oj |
| S16 | EDPB Guidelines 02/2025 v2.0 on processing personal data through blockchain technologies (7 July 2026) | Identifiability, erasure, off-chain storage, transfers, DPIA | https://www.edpb.europa.eu/documents/guideline/guidelines-022025-on-processing-of-personal-data-through-blockchain_en |
| S17 | EDPB Guidelines 3/2018 on territorial scope (Art 3), final 12 Nov 2019 | Art 3 guidance | https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-32018-territorial-scope-gdpr-article-3-version_en |
| S18 | CJEU, EDPS v SRB, C-413/23 P, 4 Sep 2025 | Pseudonymised data; identifiability | https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023CJ0413 |
| S19 | CJEU, Breyer C-582/14 (19 Oct 2016); Nowak C-434/16 (20 Dec 2017) | IP addresses / recorded data; means reasonably likely | https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62014CJ0582 ; https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62016CJ0434 |
| S20 | CJEU, Schrems II, C-311/18, 16 Jul 2020 | International transfers / safeguards | https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62018CJ0311 |
| S21 | EDPB Guidelines 9/2022 on personal data breach notification | 72h / risk thresholds | https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-92022-personal-data-breach-notification-under_en |
| S22 | EDPB Guidelines 07/2020 on controller and processor | Role analysis | https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-072020-concepts-controller-and-processor-gdpr_en |
| S23 | DPR, RUU Perubahan Keempat UU 25/1992 | Committee stage 17 Jun 2026 | https://www.dpr.go.id/kegiatan-dpr/berita/Revisi-UU-Perkoperasian-Mendesak-untuk-Jawab-Tantangan-Zaman-66112 * |
| S24 | Putusan MK 28/PUU-XI/2013 | Annulment of UU 17/2012 | https://bphn.go.id/data/documents/28-2013.pdf |
| S25 | Tempo, OJK stablecoin target Jan 2027 | Reported target | https://en.tempo.co/read/2121273/indonesia-targets-stablecoin-regulations-by-early-2027-ojk-says * |
| S26 | Sequoia plan, ADRs 0001–0006, migration 0001, `cooperative-membership-and-surplus.md` | Internal | `docs/plan/sequoia-plan.md`; `docs/adr/`; `apps/api/src/infrastructure/database/migrations/0001_init.sql`; `docs/legal/cooperative-membership-and-surplus.md` |
| S27 | MKRI and DPR reporting on the PDP institution, July 2026 | Establishment still under discussion | https://mkri.id/berita/pembentukan-lembaga-pdp-sedang-dibahas-25476 ; https://www.dpr.go.id/kegiatan-dpr/berita/Pembentukan-Lembaga-Perlindungan-Data-Pribadi-Tak-Bertentangan-Dengan-UUD-45-67733 * |

**Unverified / watch items.** The final offering POJK (only a Sep 2025 consultation draft located) [S7]; PADK 3/2026 article-level content [S8]; PP 33/2026 article-level requirements (not yet reviewed) [S13]; the 4th cooperative amendment after June 2026 [S23]; the PDP institution's establishment [S27]; the reported Rp1 billion offering threshold [S7]; the January 2027 stablecoin POJK [S25]; and any OJK/BI data-localisation rule that would apply if the co-op becomes a KSP [S14]. Re-check each before mainnet.
