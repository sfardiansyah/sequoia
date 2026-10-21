import { isMemberClass } from "@coop/shared";
import { createMembershipContainer } from "../composition/membership";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const ownerPkh = readArg("owner-pkh");
const kycCommitment = readArg("kyc-commitment");
const memberClass = readArg("member-class") ?? "STANDARD";
const joinedAt = Number(readArg("joined-at") ?? Date.now());

if (!ownerPkh || !kycCommitment) {
  throw new Error("--owner-pkh and --kyc-commitment are required");
}
if (!isMemberClass(memberClass)) {
  throw new Error("--member-class must be STANDARD or FOUNDER");
}
if (!Number.isInteger(joinedAt) || joinedAt < 0) {
  throw new Error("--joined-at must be a non-negative integer");
}

const { admitMember, close } = createMembershipContainer(databaseUrl);

try {
  // Admin CLI: the operator is responsible for KYC and board approval.
  const result = await admitMember.execute({
    ownerPkh,
    kycCommitment,
    memberClass,
    joinedAt,
    kycVerified: true,
    boardApproved: true,
  });

  if (!result.ok) {
    console.error(`Admission failed: ${result.error}`);
    process.exitCode = 1;
  } else {
    console.log(`Admitted ${result.value.id} (${result.value.ownerPkh})`);
  }
} finally {
  await close();
}
