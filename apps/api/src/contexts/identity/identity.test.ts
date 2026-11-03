import { describe, expect, test } from "bun:test";
import type { Result } from "@sequoia/shared";
import { SequentialIdGenerator } from "../../shared/id-generator";
import { InMemoryAuditLog } from "../../shared/audit/adapters/in-memory";
import {
  InMemoryIssuerDirectory,
  InMemoryKycAttestationRepository,
} from "./adapters/in-memory";
import { GetKycAttestation } from "./application/get-kyc-attestation";
import { IssueKycAttestation } from "./application/issue-kyc-attestation";
import { ListKycAttestations } from "./application/list-kyc-attestations";
import { RevokeKycAttestation } from "./application/revoke-kyc-attestation";
import {
  KycAttestation,
  type IdentityError,
} from "./domain/kyc-attestation";
import { kycStatusAt } from "./domain/kyc-status";

const subject = "18987c1612069d4080a0eb247820cb987fea81bddeaafdd41f996281";
const issuerId = "MANUAL";
const issuedAt = 1_700_000_000_000;
const expiresAt = 1_750_000_000_000;

function unwrap<T>(result: Result<T, IdentityError>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function expectError<T>(
  result: Result<T, IdentityError>,
  code: IdentityError["code"],
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

function setup() {
  const attestations = new InMemoryKycAttestationRepository();
  const issuers = new InMemoryIssuerDirectory();
  const ids = new SequentialIdGenerator("kyc");
  const audit = new InMemoryAuditLog();
  return {
    attestations,
    issuers,
    audit,
    issue: new IssueKycAttestation(attestations, issuers, ids, audit),
    revoke: new RevokeKycAttestation(attestations, audit),
    get: new GetKycAttestation(attestations),
    list: new ListKycAttestations(attestations),
  };
}

const actor = "ray";

const issueCommand = {
  subjectPkh: subject,
  issuerId: "MANUAL",
  evidenceRef: "s3://bucket/member-1/",
  issuedAt,
  expiresAt,
  actor,
};

describe("kycStatusAt", () => {
  const snapshot = { status: "ACTIVE" as const, expiresAt };

  test("is active before expiry and expired at expiry", () => {
    expect(kycStatusAt(snapshot, expiresAt - 1)).toBe("ACTIVE");
    expect(kycStatusAt(snapshot, expiresAt)).toBe("EXPIRED");
  });

  test("revoked and superseded win over expiry", () => {
    expect(
      kycStatusAt({ status: "REVOKED", expiresAt }, issuedAt),
    ).toBe("REVOKED");
    expect(
      kycStatusAt({ status: "SUPERSEDED", expiresAt }, issuedAt),
    ).toBe("SUPERSEDED");
  });
});

describe("KycAttestation", () => {
  test("issues an active attestation", () => {
    const attestation = unwrap(
      KycAttestation.issue({
        id: "kyc-1",
        subjectPkh: subject,
        issuerId,
        evidenceRef: "  ref  ",
        issuedAt,
        expiresAt,
      }),
    );

    expect(attestation.status).toBe("ACTIVE");
    expect(attestation.evidenceRef).toBe("ref");
    expect(attestation.subjectPkh.value).toBe(subject);
  });

  test("rejects invalid input", () => {
    const valid = {
      id: "kyc-1",
      subjectPkh: subject,
      issuerId,
      evidenceRef: "ref",
      issuedAt,
      expiresAt,
    };

    expectError(
      KycAttestation.issue({ ...valid, subjectPkh: "nope" }),
      "INVALID_SUBJECT",
    );
    expectError(
      KycAttestation.issue({ ...valid, evidenceRef: " " }),
      "INVALID_EVIDENCE",
    );
    expectError(
      KycAttestation.issue({ ...valid, expiresAt: issuedAt }),
      "INVALID_EXPIRY",
    );
    expectError(
      KycAttestation.issue({ ...valid, issuedAt: -1 }),
      "INVALID_EXPIRY",
    );
  });

  test("revokes once and requires a reason", () => {
    const attestation = unwrap(
      KycAttestation.issue({
        id: "kyc-1",
        subjectPkh: subject,
        issuerId,
        evidenceRef: "ref",
        issuedAt,
        expiresAt,
      }),
    );

    expectError(
      attestation.revoke({ reason: " ", revokedAt: issuedAt }),
      "REVOKE_REASON_REQUIRED",
    );

    const revoked = unwrap(
      attestation.revoke({ reason: "sanctions hit", revokedAt: issuedAt }),
    );
    expect(revoked.status).toBe("REVOKED");
    expect(revoked.revokeReason).toBe("sanctions hit");
    expect(revoked.statusAt(issuedAt)).toBe("REVOKED");

    expectError(
      revoked.revoke({ reason: "again", revokedAt: issuedAt }),
      "ATTESTATION_NOT_ACTIVE",
    );
  });
});

describe("IssueKycAttestation", () => {
  test("resolves the issuer by kind and stores an active attestation", async () => {
    const { attestations, issue } = setup();
    const attestation = unwrap(await issue.execute(issueCommand));

    expect(attestation.issuerId).toBe(issuerId);
    expect((await attestations.findById(attestation.id))?.subjectPkh.value).toBe(
      subject,
    );
  });

  test("rejects an unknown or inactive issuer", async () => {
    const attestations = new InMemoryKycAttestationRepository();
    const issuers = new InMemoryIssuerDirectory([
      { id: "PRIVY", name: "Privy", active: false },
    ]);
    const issue = new IssueKycAttestation(
      attestations,
      issuers,
      new SequentialIdGenerator("kyc"),
      new InMemoryAuditLog(),
    );

    expectError(
      await issue.execute({ ...issueCommand, issuerId: "MANUAL" }),
      "ISSUER_NOT_FOUND",
    );
    expectError(
      await issue.execute({ ...issueCommand, issuerId: "privy" }),
      "ISSUER_INACTIVE",
    );
  });

  test("supersedes the subject's previous attestation", async () => {
    const { attestations, issue } = setup();
    const first = unwrap(await issue.execute(issueCommand));
    const second = unwrap(await issue.execute(issueCommand));

    expect((await attestations.findById(first.id))?.status).toBe("SUPERSEDED");
    expect((await attestations.findById(second.id))?.status).toBe("ACTIVE");
  });
});

describe("RevokeKycAttestation", () => {
  test("revokes an existing attestation", async () => {
    const { issue, revoke, get } = setup();
    const attestation = unwrap(await issue.execute(issueCommand));

    const revoked = unwrap(
      await revoke.execute({
        attestationId: attestation.id,
        reason: "sanctions hit",
        revokedAt: issuedAt + 1,
        actor,
      }),
    );

    expect(revoked.status).toBe("REVOKED");
    expect((unwrap(await get.execute({ id: attestation.id, at: issuedAt + 2 })) as { status: string }).status).toBe("REVOKED");
  });

  test("rejects an unknown or already revoked attestation", async () => {
    const { issue, revoke } = setup();
    const attestation = unwrap(await issue.execute(issueCommand));

    expectError(
      await revoke.execute({
        attestationId: "missing",
        reason: "x",
        revokedAt: issuedAt,
        actor,
      }),
      "ATTESTATION_NOT_FOUND",
    );

    unwrap(
      await revoke.execute({
        attestationId: attestation.id,
        reason: "x",
        revokedAt: issuedAt,
        actor,
      }),
    );

    expectError(
      await revoke.execute({
        attestationId: attestation.id,
        reason: "x",
        revokedAt: issuedAt,
        actor,
      }),
      "ATTESTATION_NOT_ACTIVE",
    );
  });
});

describe("audit trail", () => {
  test("records one KYC_ISSUED row with the operator and no evidence ref", async () => {
    const { issue, audit } = setup();
    const attestation = unwrap(await issue.execute(issueCommand));

    const rows = await audit.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: "ray",
      action: "KYC_ISSUED",
      entityType: "KYC_ATTESTATION",
      entityId: attestation.id,
      detail: null,
      occurredAt: issuedAt,
    });
    expect(JSON.stringify(rows)).not.toContain("s3://bucket");
  });

  test("records one KYC_REVOKED row without the free-text reason", async () => {
    const { issue, revoke, audit } = setup();
    const attestation = unwrap(await issue.execute(issueCommand));
    unwrap(
      await revoke.execute({
        attestationId: attestation.id,
        reason: "sanctions hit",
        revokedAt: issuedAt + 5,
        actor: "board-ops",
      }),
    );

    const rows = await audit.list({ entityId: attestation.id });
    expect(rows.map((row) => row.action)).toEqual([
      "KYC_REVOKED",
      "KYC_ISSUED",
    ]);
    expect(rows[0]).toMatchObject({ actor: "board-ops", detail: null });
    expect(JSON.stringify(rows)).not.toContain("sanctions hit");
  });

  test("rejects an invalid operator before changing data", async () => {
    const { issue, revoke, attestations, audit } = setup();

    expectError(
      await issue.execute({ ...issueCommand, actor: "Ray Nord" }),
      "INVALID_ACTOR",
    );
    expect(await attestations.list()).toEqual([]);
    expect(await audit.list()).toEqual([]);

    const attestation = unwrap(await issue.execute(issueCommand));
    expectError(
      await revoke.execute({
        attestationId: attestation.id,
        reason: "x",
        revokedAt: issuedAt,
        actor: "",
      }),
      "INVALID_ACTOR",
    );
    expect((await attestations.findById(attestation.id))?.status).toBe("ACTIVE");
    expect(await audit.list()).toHaveLength(1);
  });
});

describe("GetKycAttestation", () => {
  test("derives status at read time and exposes the audit trail", async () => {
    const { issue, get } = setup();
    const attestation = unwrap(await issue.execute(issueCommand));

    const view = unwrap(await get.execute({ id: attestation.id, at: issuedAt }));
    expect(view).toMatchObject({
      issuerId: "MANUAL",
      evidenceRef: "s3://bucket/member-1/",
      issuedAt,
    });

    expect(
      unwrap(await get.execute({ id: attestation.id, at: issuedAt }))?.status,
    ).toBe("ACTIVE");
    expect(
      unwrap(await get.execute({ id: attestation.id, at: expiresAt }))?.status,
    ).toBe("EXPIRED");
    expect(unwrap(await get.execute({ id: "missing", at: issuedAt }))).toBeNull();
  });
});

describe("ListKycAttestations", () => {
  test("filters by subject and expiry", async () => {
    const { issue, list } = setup();
    const attestation = unwrap(await issue.execute(issueCommand));

    expect(
      (unwrap(await list.execute({ at: issuedAt })) ?? []).map((row) => row.id),
    ).toEqual([attestation.id]);
    expect(
      unwrap(await list.execute({ at: issuedAt, subjectPkh: "b".repeat(56) })),
    ).toEqual([]);
    expect(
      unwrap(await list.execute({ at: issuedAt, expiresBefore: expiresAt - 1 })),
    ).toEqual([]);
  });

  test("filters by derived status", async () => {
    const { issue, revoke, list } = setup();
    const first = unwrap(await issue.execute(issueCommand));
    const second = unwrap(await issue.execute(issueCommand));

    expect(
      unwrap(await list.execute({ at: issuedAt, status: "SUPERSEDED" })).map(
        (row) => row.id,
      ),
    ).toEqual([first.id]);
    expect(
      unwrap(await list.execute({ at: issuedAt, status: "ACTIVE" })).map(
        (row) => row.id,
      ),
    ).toEqual([second.id]);

    unwrap(
      await revoke.execute({
        attestationId: second.id,
        reason: "sanctions hit",
        revokedAt: issuedAt,
        actor,
      }),
    );

    expect(
      unwrap(await list.execute({ at: issuedAt, status: "REVOKED" })).map(
        (row) => row.id,
      ),
    ).toEqual([second.id]);
  });
});
