import { defineCommand } from "citty";
import { isMemberClass } from "@sequoia/shared";
import { createMembershipContainer } from "../composition/membership";

export default defineCommand({
  meta: {
    name: "admit",
    description: "Admit a Sequoia member",
  },
  args: {
    "owner-pkh": { type: "string", required: true },
    "kyc-commitment": { type: "string", required: true },
    "member-class": { type: "string", default: "STANDARD" },
    "joined-at": { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");

    const memberClass = args.memberClass as string;
    if (!isMemberClass(memberClass)) {
      throw new Error("--member-class must be STANDARD or FOUNDER");
    }

    const joinedAt =
      args.joinedAt === undefined ? Date.now() : Number(args.joinedAt);
    if (!Number.isInteger(joinedAt) || joinedAt < 0) {
      throw new Error("--joined-at must be a non-negative integer");
    }

    const { admitMember, close } = createMembershipContainer(databaseUrl);

    try {
      // Admin CLI: the operator is responsible for KYC and board approval.
      const result = await admitMember.execute({
        ownerPkh: args.ownerPkh as string,
        kycCommitment: args.kycCommitment as string,
        memberClass,
        joinedAt,
        kycVerified: true,
        boardApproved: true,
      });

      if (!result.ok) {
        console.error(`Admission failed: ${result.error}`);
        process.exitCode = 1;
        return;
      }

      const output = {
        id: result.value.id,
        ownerPkh: result.value.ownerPkh,
        status: result.value.status,
      };

      if (Boolean(args.json)) {
        console.log(JSON.stringify(output));
      } else {
        console.log(`Admitted ${output.id} (${output.ownerPkh})`);
      }
    } finally {
      await close();
    }
  },
});
