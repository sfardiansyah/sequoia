import { describe, expect, test } from "bun:test";
import type { Result } from "@sequoia/shared";
import { SequentialIdGenerator } from "../../shared/id-generator";
import { InMemoryAuditLog } from "../../shared/audit/adapters/in-memory";
import { createInMemoryUnitOfWork } from "../../shared/persistence/adapters/in-memory";
import {
  InMemoryIssuerDirectory,
  InMemoryKycAttestationRepository,
} from "./adapters/in-memory";
import { GetKycAttestation } from "./application/get-kyc-attestation";
import { IssueKycAttestation } from "./application/issue-kyc-attestation";
import { ListKycAttestations } from "./application/list-kyc-attestations";
import { RevokeKycAttestation } from "./application/revoke-kyc-attestation";
import {
  DuplicateActiveAttestationError,
  KycAttestation,
  parseKycRevokeReason,
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
  const unitOfWork = createInMemoryUnitOfWork(() => ({ attestations, audit }));
  return {
    attestations,
    issuers,
    audit,
    issue: new IssueKycAttestation(issuers, ids, unitOfWork),
    revoke: new RevokeKycAttestation(attestations, unitOfWork),
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

  test("issues an attestation with an optional retain-until", () => {
    const valid = {
      id: "kyc-1",
      subjectPkh: subject,
      issuerId,
      evidenceRef: "ref",
      issuedAt,
      expiresAt,
    };

    expect(
      unwrap(KycAttestation.issue(valid)).retainUntil,
    ).toBeNull();
    expect(
      unwrap(
        KycAttestation.issue({ ...valid, retainUntil: expiresAt + 1 }),
      ).retainUntil,
    ).toBe(expiresAt + 1);
    expectError(
      KycAttestation.issue({ ...valid, retainUntil: issuedAt }),
      "INVALID_RETAIN_UNTIL",
    );
    expectError(
      KycAttestation.issue({ ...valid, retainUntil: issuedAt - 1 }),
      "INVALID_RETAIN_UNTIL",
    );
  });

  test("revokes once with a structured reason code", () => {
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
      attestation.revoke({ reasonCode: "sanctions hit", revokedAt: issuedAt }),
      "INVALID_REVOKE_REASON",
    );

    const revoked = unwrap(
      attestation.revoke({ reasonCode: "SANCTIONS", revokedAt: issuedAt }),
    );
    expect(revoked.status).toBe("REVOKED");
    expect(revoked.revokeReason).toBe("SANCTIONS");
    expect(revoked.statusAt(issuedAt)).toBe("REVOKED");

    expectError(
      revoked.revoke({ reasonCode: "OTHER", revokedAt: issuedAt }),
      "ATTESTATION_NOT_ACTIVE",
    );
  });
});

describe("parseKycRevokeReason", () => {
  test("accepts only the four reason codes", () => {
    expect(parseKycRevokeReason("SANCTIONS")).toBe("SANCTIONS");
    expect(parseKycRevokeReason(" PEP ")).toBe("PEP");
    expect(parseKycRevokeReason("DOCUMENT_MISMATCH")).toBe("DOCUMENT_MISMATCH");
    expect(parseKycRevokeReason("OTHER")).toBe("OTHER");

    expect(parseKycRevokeReason("sanctions")).toBeNull();
    expect(parseKycRevokeReason("")).toBeNull();
    expect(parseKycRevokeReason("SANCTIONS: bad actor")).toBeNull();
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

  test("maps a concurrent issue to ATTESTATION_ALREADY_ACTIVE", async () => {
    const { issue, attestations } = setup();
    attestations.saveIssued = async () => {
      throw new DuplicateActiveAttestationError();
    };

    expectError(
      await issue.execute(issueCommand),
      "ATTESTATION_ALREADY_ACTIVE",
    );
  });

  test("rejects an unknown or inactive issuer", async () => {
    const attestations = new InMemoryKycAttestationRepository();
    const issuers = new InMemoryIssuerDirectory([
      { id: "PRIVY", name: "Privy", active: false },
    ]);
    const issue = new IssueKycAttestation(
      issuers,
      new SequentialIdGenerator("kyc"),
      createInMemoryUnitOfWork(() => ({
        attestations,
        audit: new InMemoryAuditLog(),
      })),
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

  test("stores the optional retain-until", async () => {
    const { attestations, issue } = setup();
    const attestation = unwrap(
      await issue.execute({ ...issueCommand, retainUntil: expiresAt + 1 }),
    );

    expect(
      (await attestations.findById(attestation.id))?.retainUntil,
    ).toBe(expiresAt + 1);
  });
});

describe("RevokeKycAttestation", () => {
  test("revokes an existing attestation", async () => {
    const { issue, revoke, get } = setup();
    const attestation = unwrap(await issue.execute(issueCommand));

    const revoked = unwrap(
      await revoke.execute({
        attestationId: attestation.id,
        reasonCode: "SANCTIONS",
        revokedAt: issuedAt + 1,
        actor,
      }),
    );

    expect(revoked.status).toBe("REVOKED");
    expect((unwrap(await get.execute({ id: attestation.id, at: issuedAt + 2 })) as { status: string }).status).toBe("REVOKED");
  });

  test("rejects an unknown reason code before writing", async () => {
    const { issue, revoke, attestations, audit } = setup();
    const attestation = unwrap(await issue.execute(issueCommand));

    expectError(
      await revoke.execute({
        attestationId: attestation.id,
        reasonCode: "sanctions hit",
        revokedAt: issuedAt + 1,
        actor,
      }),
      "INVALID_REVOKE_REASON",
    );
    expect((await attestations.findById(attestation.id))?.status).toBe("ACTIVE");
    expect(await audit.list()).toHaveLength(1);
  });

  test("rejects an unknown or already revoked attestation", async () => {
    const { issue, revoke } = setup();
    const attestation = unwrap(await issue.execute(issueCommand));

    expectError(
      await revoke.execute({
        attestationId: "missing",
        reasonCode: "OTHER",
        revokedAt: issuedAt,
        actor,
      }),
      "ATTESTATION_NOT_FOUND",
    );

    unwrap(
      await revoke.execute({
        attestationId: attestation.id,
        reasonCode: "OTHER",
        revokedAt: issuedAt,
        actor,
      }),
    );

    expectError(
      await revoke.execute({
        attestationId: attestation.id,
        reasonCode: "OTHER",
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

  test("records one KYC_REVOKED row with the reason code as detail", async () => {
    const { issue, revoke, audit } = setup();
    const attestation = unwrap(await issue.execute(issueCommand));
    unwrap(
      await revoke.execute({
        attestationId: attestation.id,
        reasonCode: "SANCTIONS",
        revokedAt: issuedAt + 5,
        actor: "board-ops",
      }),
    );

    const rows = await audit.list({ entityId: attestation.id });
    expect(rows.map((row) => row.action)).toEqual([
      "KYC_REVOKED",
      "KYC_ISSUED",
    ]);
    expect(rows[0]).toMatchObject({ actor: "board-ops", detail: "SANCTIONS" });
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
        reasonCode: "OTHER",
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
  test("derives status at read time without exposing the evidence ref", async () => {
    const { issue, get } = setup();
    const attestation = unwrap(await issue.execute(issueCommand));

    const view = unwrap(await get.execute({ id: attestation.id, at: issuedAt }));
    expect(view).toMatchObject({
      issuerId: "MANUAL",
      issuedAt,
      retainUntil: null,
    });
    expect(view).not.toHaveProperty("evidenceRef");
    expect(JSON.stringify(view)).not.toContain("s3://bucket");

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
        reasonCode: "SANCTIONS",
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
