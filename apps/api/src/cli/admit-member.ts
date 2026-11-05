import { MemberClass } from "@sequoia/shared";
import { defineCommand } from "citty";
import { createMembershipContainer } from "../composition/membership";
import { resolveOperator } from "./operator";

export default defineCommand({
  meta: {
    name: "admit",
    description: "Admit a Sequoia member",
  },
  args: {
    "owner-pkh": { type: "string", required: true },
    attestation: { type: "string", required: true },
    "approval-ref": { type: "string", required: true },
    "joined-at": { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");

    const actor = resolveOperator();

    const joinedAt =
      args.joinedAt === undefined ? Date.now() : Number(args.joinedAt);
    if (!Number.isInteger(joinedAt) || joinedAt < 0) {
      throw new Error("--joined-at must be a non-negative integer");
    }

    const { admitMember, close } = createMembershipContainer(databaseUrl);

    try {
      const result = await admitMember.execute({
        ownerPkh: args.ownerPkh as string,
        kycAttestationId: args.attestation as string,
        boardApprovalRef: args.approvalRef as string,
        memberClass: MemberClass.Standard,
        joinedAt,
        now: Date.now(),
        actor,
      });

      if (!result.ok) {
        console.error(`Admission failed: ${result.error.code}`);
        if (result.error.code === "UNEXPECTED") {
          console.error(result.error.cause);
        }
        process.exitCode = 1;
        return;
      }

      const output = {
        id: result.value.id,
        ownerPkh: result.value.ownerPkh.value,
        kycAttestationId: result.value.kycAttestationId,
        boardApprovalRef: result.value.boardApprovalRef,
        status: result.value.status,
      };

      if (Boolean(args.json)) {
        console.log(JSON.stringify(output));
      } else {
        console.log(
          `Admitted ${output.id} (${output.ownerPkh}) with ${output.kycAttestationId} under ${output.boardApprovalRef}`,
        );
      }
    } finally {
      await close();
    }
  },
});
