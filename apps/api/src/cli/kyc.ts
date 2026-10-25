import { defineCommand } from "citty";
import { createIdentityContainer } from "../composition/identity";
import {
  KYC_VALIDITY_DAYS,
  type IdentityError,
} from "../contexts/identity/domain/kyc-attestation";
import { KycStatus } from "../contexts/identity/domain/kyc-status";
import { SubjectPkh } from "../contexts/identity/domain/subject-pkh";

const DAY_MS = 86_400_000;
const KYC_STATUSES: readonly string[] = Object.values(KycStatus);

function isKycStatus(value: string): value is KycStatus {
  return KYC_STATUSES.includes(value);
}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required");
  return value;
}

function reportFailure(action: string, error: IdentityError): void {
  console.error(`${action} failed: ${error.code}`);
  if (error.code === "UNEXPECTED") console.error(error.cause);
  process.exitCode = 1;
}

const issue = defineCommand({
  meta: { name: "issue", description: "Issue a KYC attestation" },
  args: {
    "owner-pkh": { type: "string", required: true },
    "evidence-ref": { type: "string", required: true },
    issuer: { type: "string", default: "MANUAL" },
    "expires-at": { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const issuedAt = Date.now();
    const expiresAt =
      args.expiresAt === undefined
        ? issuedAt + KYC_VALIDITY_DAYS * DAY_MS
        : Number(args.expiresAt);

    if (!Number.isInteger(expiresAt)) {
      throw new Error("--expires-at must be an epoch millisecond integer");
    }

    const container = createIdentityContainer(databaseUrl());

    try {
      const result = await container.issueKycAttestation.execute({
        subjectPkh: args.ownerPkh as string,
        issuerId: args.issuer as string,
        evidenceRef: args.evidenceRef as string,
        issuedAt,
        expiresAt,
      });

      if (!result.ok) return reportFailure("Issue", result.error);

      const output = {
        id: result.value.id,
        subjectPkh: result.value.subjectPkh.value,
        issuerId: result.value.issuerId,
        expiresAt: result.value.expiresAt,
      };

      console.log(
        Boolean(args.json)
          ? JSON.stringify(output)
          : `Issued ${output.id} for ${output.subjectPkh} (expires ${new Date(output.expiresAt).toISOString()})`,
      );
    } finally {
      await container.close();
    }
  },
});

const revoke = defineCommand({
  meta: { name: "revoke", description: "Revoke a KYC attestation" },
  args: {
    id: { type: "positional", required: true },
    reason: { type: "string", required: true },
  },
  async run({ args }) {
    const container = createIdentityContainer(databaseUrl());

    try {
      const result = await container.revokeKycAttestation.execute({
        attestationId: args.id as string,
        reason: args.reason as string,
        revokedAt: Date.now(),
      });

      if (!result.ok) return reportFailure("Revocation", result.error);

      console.log(`Revoked ${result.value.id}`);
    } finally {
      await container.close();
    }
  },
});

const list = defineCommand({
  meta: { name: "list", description: "List KYC attestations" },
  args: {
    "owner-pkh": { type: "string" },
    "expiring-within": { type: "string" },
    status: { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const now = Date.now();
    const days =
      args.expiringWithin === undefined ? undefined : Number(args.expiringWithin);
    if (days !== undefined && (!Number.isFinite(days) || days < 0)) {
      throw new Error("--expiring-within must be a non-negative number of days");
    }

    const status = args.status as string | undefined;
    if (status !== undefined && !isKycStatus(status)) {
      throw new Error(
        "--status must be ACTIVE, EXPIRED, SUPERSEDED, or REVOKED",
      );
    }

    let subjectPkh: string | undefined;
    if (args.ownerPkh !== undefined) {
      const parsed = SubjectPkh.parse(args.ownerPkh as string);
      if (!parsed) {
        throw new Error(
          "--owner-pkh must be a 56-character hex public key hash",
        );
      }
      subjectPkh = parsed.value;
    }

    const container = createIdentityContainer(databaseUrl());

    try {
      const result = await container.listKycAttestations.execute({
        subjectPkh,
        expiresBefore: days === undefined ? undefined : now + days * DAY_MS,
        status: status as KycStatus | undefined,
        at: now,
      });

      if (!result.ok) return reportFailure("List", result.error);

      if (Boolean(args.json)) {
        console.log(JSON.stringify(result.value));
        return;
      }

      for (const attestation of result.value) {
        console.log(
          `${attestation.id}  ${attestation.subjectPkh}  ${attestation.status}  ${attestation.issuerId}  issued ${new Date(attestation.issuedAt).toISOString()}  expires ${new Date(attestation.expiresAt).toISOString()}  ${attestation.evidenceRef}`,
        );
      }
    } finally {
      await container.close();
    }
  },
});

export default defineCommand({
  meta: { name: "kyc", description: "KYC attestation administration" },
  subCommands: { issue, revoke, list },
});
