import { describe, expect, test } from "bun:test";
import { MemberClass, type Result } from "@sequoia/shared";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { createApp } from "./app";
import type { AppConfig } from "./config";
import { InMemoryNonceStore } from "./contexts/auth/adapters/in-memory-nonce-store";
import { loadJwtKeys } from "./contexts/auth/adapters/jwt-keys";
import { newJwtPrivateKey } from "./contexts/auth/adapters/jwt-test-keys";
import { JwtTokenService } from "./contexts/auth/adapters/jwt-token-service";
import { AuthService } from "./contexts/auth/application/auth-service";
import { DrizzleBankAttestationRepository } from "./contexts/capital/adapters/postgres/bank-attestation-repository";
import { DrizzleContributionRepository } from "./contexts/capital/adapters/postgres/contribution-repository";
import { DrizzleContributionYearRepository } from "./contexts/capital/adapters/postgres/contribution-year-repository";
import { MembershipContributionEligibility } from "./contexts/capital/adapters/membership/contribution-eligibility";
import { ConfigureContributionYear } from "./contexts/capital/application/configure-contribution-year";
import { CreateBankAttestation } from "./contexts/capital/application/create-bank-attestation";
import { RecordAnnualContribution } from "./contexts/capital/application/record-annual-contribution";
import {
  DrizzleIssuerDirectory,
  DrizzleKycAttestationRepository,
} from "./contexts/identity/adapters/postgres/kyc-attestation-repository";
import { GetKycAttestation } from "./contexts/identity/application/get-kyc-attestation";
import { IssueKycAttestation } from "./contexts/identity/application/issue-kyc-attestation";
import { ListKycAttestations } from "./contexts/identity/application/list-kyc-attestations";
import { IdentityKycEligibility } from "./contexts/membership/adapters/identity/kyc-eligibility";
import { DrizzleMemberRepository } from "./contexts/membership/adapters/postgres/member-repository";
import { PostgresMemberProfileReader } from "./contexts/membership/adapters/postgres/member-profile-reader";
import { AdmitMember } from "./contexts/membership/application/admit-member";
import { DrizzleAuditLog } from "./shared/audit/adapters/postgres/audit-log";
import { UuidGenerator } from "./shared/id-generator";
import { createDrizzleUnitOfWork } from "./shared/persistence/adapters/postgres/unit-of-work";

export type PilotFlowHarness = {
  readonly db: PgDatabase<PgQueryResultHKT, any>;
  readonly close: () => Promise<void>;
};

const PKH = "a".repeat(56);
const NOW = 1_800_000_000_000;
const DAY_MS = 86_400_000;
const CONTRIBUTION_YEAR = 2026;
const ANNUAL_AMOUNT = 1_000_000;
const BOARD_APPROVAL_REF = "BOARD-2026-004";
const YEAR_APPROVAL_REF = "BOARD-2026-001";
const BANK_REFERENCE = "BANK-REF-001";
const OPERATOR = "ray";

const config: AppConfig = {
  serviceName: "sequoia-api",
  version: "0.1.0",
  environment: "test",
  port: 3000,
};

const tokens = new JwtTokenService(await loadJwtKeys(await newJwtPrivateKey()));
const auth = new AuthService(
  { verify: () => true, publicKeyHash: () => PKH },
  new InMemoryNonceStore(),
  tokens,
);

function unwrap<T, E extends { readonly code: string }>(
  result: Result<T, E>,
): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

async function build(setup: () => Promise<PilotFlowHarness>) {
  const { db, close } = await setup();
  const attestations = new DrizzleKycAttestationRepository(db);
  const issuers = new DrizzleIssuerDirectory(db);
  const members = new DrizzleMemberRepository(db);
  const contributions = new DrizzleContributionRepository(db);
  const years = new DrizzleContributionYearRepository(db);
  const bankAttestations = new DrizzleBankAttestationRepository(db);
  const kycEligibility = new IdentityKycEligibility(
    new GetKycAttestation(attestations),
    new ListKycAttestations(attestations),
  );

  const identityUow = createDrizzleUnitOfWork(db, (tx) => ({
    attestations: new DrizzleKycAttestationRepository(tx),
    audit: new DrizzleAuditLog(tx),
  }));
  const membershipUow = createDrizzleUnitOfWork(db, (tx) => ({
    members: new DrizzleMemberRepository(tx),
    audit: new DrizzleAuditLog(tx),
  }));
  const capitalUow = createDrizzleUnitOfWork(db, (tx) => ({
    years: new DrizzleContributionYearRepository(tx),
    attestations: new DrizzleBankAttestationRepository(tx),
    contributions: new DrizzleContributionRepository(tx),
    audit: new DrizzleAuditLog(tx),
  }));

  return {
    close,
    issueKyc: new IssueKycAttestation(
      issuers,
      new UuidGenerator(),
      identityUow,
    ),
    admit: new AdmitMember(
      members,
      new UuidGenerator(),
      kycEligibility,
      membershipUow,
    ),
    configureYear: new ConfigureContributionYear(capitalUow),
    attest: new CreateBankAttestation(
      members,
      new UuidGenerator(),
      capitalUow,
    ),
    record: new RecordAnnualContribution(
      contributions,
      years,
      bankAttestations,
      new MembershipContributionEligibility(members, kycEligibility),
      new UuidGenerator(),
      capitalUow,
    ),
    app: createApp(config, {
      auth,
      jwks: tokens,
      memberProfile: new PostgresMemberProfileReader(db),
      checkDatabase: async () => {},
    }),
  };
}

async function issueKyc(
  flow: Awaited<ReturnType<typeof build>>,
  subjectPkh = PKH,
) {
  return unwrap(
    await flow.issueKyc.execute({
      subjectPkh,
      issuerId: "MANUAL",
      evidenceRef: "synthetic/pilot-evidence",
      issuedAt: NOW,
      expiresAt: NOW + 365 * DAY_MS,
      actor: OPERATOR,
    }),
  );
}

async function admitKyc(
  flow: Awaited<ReturnType<typeof build>>,
  overrides: Partial<{
    kycAttestationId: string;
    boardApprovalRef: string;
    memberClass: MemberClass;
    ownerPkh: string;
  }> = {},
) {
  const kyc = await issueKyc(flow, overrides.ownerPkh ?? PKH);
  return flow.admit.execute({
    ownerPkh: overrides.ownerPkh ?? PKH,
    kycAttestationId: overrides.kycAttestationId ?? kyc.id,
    boardApprovalRef: overrides.boardApprovalRef ?? BOARD_APPROVAL_REF,
    memberClass: overrides.memberClass ?? MemberClass.Standard,
    joinedAt: NOW,
    now: NOW,
    actor: OPERATOR,
  });
}

async function configureYear(
  flow: Awaited<ReturnType<typeof build>>,
  year = CONTRIBUTION_YEAR,
) {
  return unwrap(
    await flow.configureYear.execute({
      year,
      annualAmount: ANNUAL_AMOUNT,
      memberCapitalBps: 7_000,
      capitalParticipationBps: 3_000,
      standardCapitalParticipationMaxBps: 5_000,
      approvalRef: YEAR_APPROVAL_REF,
      createdAt: NOW,
      actor: OPERATOR,
    }),
  );
}

async function attest(
  flow: Awaited<ReturnType<typeof build>>,
  memberId: string,
  overrides: Partial<{
    contributionYear: number;
    amount: number;
    bankReference: string;
  }> = {},
) {
  return unwrap(
    await flow.attest.execute({
      memberId,
      contributionYear: overrides.contributionYear ?? CONTRIBUTION_YEAR,
      amount: overrides.amount ?? ANNUAL_AMOUNT,
      bankReference: overrides.bankReference ?? BANK_REFERENCE,
      createdAt: NOW,
      actor: OPERATOR,
    }),
  );
}

async function memberPanel(
  flow: Awaited<ReturnType<typeof build>>,
  pkh = PKH,
) {
  const token = await tokens.sign(pkh);
  return flow.app.handle(
    new Request("http://localhost/members/me", {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
}

export function describePilotFlow(
  name: string,
  setup: () => Promise<PilotFlowHarness>,
): void {
  describe(name, () => {
    test("runs KYC, admission, year, bank attestation, contribution, and profile", async () => {
      const flow = await build(setup);

      try {
        const member = unwrap(await admitKyc(flow));
        await configureYear(flow);
        const bank = await attest(flow, member.id);
        unwrap(
          await flow.record.execute({
            memberId: member.id,
            contributionYear: CONTRIBUTION_YEAR,
            bankAttestationId: bank.id,
            recordedAt: NOW,
            actor: OPERATOR,
          }),
        );

        const response = await memberPanel(flow);
        expect(response.status).toBe(200);

        const body = (await response.json()) as {
          contributions: unknown;
        };
        expect(body.contributions).toEqual([
          {
            year: CONTRIBUTION_YEAR,
            annualAmount: String(ANNUAL_AMOUNT),
            memberCapital: "700000",
            capitalParticipation: "300000",
            source: "PILOT",
          },
        ]);
        expect(JSON.stringify(body)).not.toContain(BANK_REFERENCE);
      } finally {
        await flow.close();
      }
    });

    test("returns an empty contribution summary before any contribution", async () => {
      const flow = await build(setup);

      try {
        unwrap(await admitKyc(flow));

        const response = await memberPanel(flow);
        expect(response.status).toBe(200);
        expect(
          ((await response.json()) as { contributions: unknown }).contributions,
        ).toEqual([]);
      } finally {
        await flow.close();
      }
    });

    test("rejects admission without valid KYC", async () => {
      const flow = await build(setup);

      try {
        const result = await admitKyc(flow, {
          kycAttestationId: "missing-attestation",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("KYC_NOT_VERIFIED");
      } finally {
        await flow.close();
      }
    });

    test("rejects admission without a board approval reference", async () => {
      const flow = await build(setup);

      try {
        const result = await admitKyc(flow, { boardApprovalRef: "   " });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("INVALID_BOARD_APPROVAL_REF");
        }
      } finally {
        await flow.close();
      }
    });

    test("rejects founder admission in the pilot", async () => {
      const flow = await build(setup);

      try {
        const result = await admitKyc(flow, {
          memberClass: MemberClass.Founder,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("MEMBER_CLASS_NOT_ALLOWED");
      } finally {
        await flow.close();
      }
    });

    test("rejects a contribution without a bank attestation", async () => {
      const flow = await build(setup);

      try {
        const member = unwrap(await admitKyc(flow));
        await configureYear(flow);

        const result = await flow.record.execute({
          memberId: member.id,
          contributionYear: CONTRIBUTION_YEAR,
          bankAttestationId: "missing-attestation",
          recordedAt: NOW,
          actor: OPERATOR,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("ATTESTATION_NOT_FOUND");
      } finally {
        await flow.close();
      }
    });

    test("rejects an attestation for another contribution year", async () => {
      const flow = await build(setup);

      try {
        const member = unwrap(await admitKyc(flow));
        await configureYear(flow);
        await configureYear(flow, CONTRIBUTION_YEAR + 1);
        const bank = await attest(flow, member.id);

        const result = await flow.record.execute({
          memberId: member.id,
          contributionYear: CONTRIBUTION_YEAR + 1,
          bankAttestationId: bank.id,
          recordedAt: NOW,
          actor: OPERATOR,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("ATTESTATION_MISMATCH");
      } finally {
        await flow.close();
      }
    });
  });
}
