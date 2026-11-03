import { defineCommand } from "citty";
import { createAuditContainer } from "../composition/audit";

const list = defineCommand({
  meta: { name: "list", description: "List audit events, newest first" },
  args: {
    "entity-type": { type: "string" },
    "entity-id": { type: "string" },
    actor: { type: "string" },
    limit: { type: "string", default: "50" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");

    const limit = Number(args.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error("--limit must be an integer between 1 and 500");
    }

    const container = createAuditContainer(databaseUrl);

    try {
      const events = await container.audit.list({
        entityType: args.entityType as string | undefined,
        entityId: args.entityId as string | undefined,
        actor: args.actor as string | undefined,
        limit,
      });

      if (Boolean(args.json)) {
        console.log(JSON.stringify(events));
        return;
      }

      for (const event of events) {
        const detail = event.detail === null ? "" : `  ${event.detail}`;
        console.log(
          `${new Date(event.occurredAt).toISOString()}  ${event.actor}  ${event.action}  ${event.entityType}/${event.entityId}${detail}`,
        );
      }
    } finally {
      await container.close();
    }
  },
});

export default defineCommand({
  meta: { name: "audit", description: "Audit trail administration" },
  subCommands: { list },
});
