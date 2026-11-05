import { defineCommand } from "citty";
import {
  DEFAULT_SPLITS,
  MemberClass,
  STANDARD_CAPITAL_PARTICIPATION_MAX_BPS,
} from "@sequoia/shared";
import { createCapitalContainer } from "../composition/capital";
import { resolveOperator } from "./operator";

const standardSplit = DEFAULT_SPLITS[MemberClass.Standard];

const setYear = defineCommand({
  meta: {
    name: "set",
    description: "Configure the annual amount for a contribution year",
  },
  args: {
    "contribution-year": { type: "string", required: true },
    "annual-amount": { type: "string", required: true },
    "approval-ref": { type: "string", required: true },
    "created-at": { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const actor = resolveOperator();
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");

    const createdAt =
      args.createdAt === undefined ? Date.now() : Number(args.createdAt);
    const container = createCapitalContainer(databaseUrl);

    try {
      const result = await container.configureContributionYear.execute({
        year: Number(args.contributionYear),
        approvalRef: args.approvalRef as string,
        annualAmount: Number(args.annualAmount),
        memberCapitalBps: standardSplit.memberCapitalBps,
        capitalParticipationBps: standardSplit.capitalParticipationBps,
        standardCapitalParticipationMaxBps:
          STANDARD_CAPITAL_PARTICIPATION_MAX_BPS,
        createdAt,
        actor,
      });

      if (!result.ok) {
        console.error(`Year configuration failed: ${result.error.code}`);
        if (result.error.code === "UNEXPECTED") console.error(result.error.cause);
        process.exitCode = 1;
        return;
      }

      const output = {
        year: result.value.year,
        approvalRef: result.value.approvalRef,
        annualAmount: result.value.annualAmount,
        memberCapitalBps: result.value.memberCapitalBps,
        capitalParticipationBps: result.value.capitalParticipationBps,
        standardCapitalParticipationMaxBps:
          result.value.standardCapitalParticipationMaxBps,
        createdAt: result.value.createdAt,
      };

      console.log(
        Boolean(args.json)
          ? JSON.stringify(output)
          : `Configured ${output.year}: ${output.annualAmount} IDR, ${output.memberCapitalBps}/${output.capitalParticipationBps} bps, cap ${output.standardCapitalParticipationMaxBps} bps`,
      );
    } finally {
      await container.close();
    }
  },
});

const year = defineCommand({
  meta: {
    name: "year",
    description: "Contribution year parameters",
  },
  subCommands: { set: setYear },
});

const record = defineCommand({
  meta: {
    name: "record",
    description: "Record an annual contribution snapshot",
  },
  args: {
    "member-id": { type: "string", required: true },
    "contribution-year": { type: "string", required: true },
    "recorded-at": { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");

    const recordedAt =
      args.recordedAt === undefined ? Date.now() : Number(args.recordedAt);
    const container = createCapitalContainer(databaseUrl);

    try {
      const result = await container.recordContribution.execute({
        memberId: args.memberId as string,
        contributionYear: Number(args.contributionYear),
        recordedAt,
      });

      if (!result.ok) {
        console.error(`Record failed: ${result.error.code}`);
        if (result.error.code === "UNEXPECTED") console.error(result.error.cause);
        process.exitCode = 1;
        return;
      }

      const output = {
        id: result.value.id,
        memberId: result.value.memberId,
        contributionYear: result.value.contributionYear,
        annualAmount: result.value.annualAmount,
        memberCapitalBps: result.value.memberCapitalBps,
        capitalParticipationBps: result.value.capitalParticipationBps,
        memberCapital: result.value.memberCapital.toString(),
        capitalParticipation: result.value.capitalParticipation.toString(),
        recordedAt: result.value.recordedAt,
      };

      console.log(
        Boolean(args.json)
          ? JSON.stringify(output)
          : `Recorded ${output.id} for ${output.memberId} (${output.contributionYear}): ${output.memberCapital} Member Capital / ${output.capitalParticipation} Capital Participation`,
      );
    } finally {
      await container.close();
    }
  },
});

const attest = defineCommand({
  meta: {
    name: "attest",
    description: "Create a mock bank attestation",
  },
  args: {
    "member-id": { type: "string", required: true },
    "contribution-year": { type: "string", required: true },
    amount: { type: "string", required: true },
    "bank-ref": { type: "string", required: true },
    "created-at": { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const actor = resolveOperator();
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");

    const createdAt =
      args.createdAt === undefined ? Date.now() : Number(args.createdAt);
    const container = createCapitalContainer(databaseUrl);

    try {
      const result = await container.createBankAttestation.execute({
        memberId: args.memberId as string,
        contributionYear: Number(args.contributionYear),
        amount: Number(args.amount),
        bankReference: args.bankRef as string,
        createdAt,
        actor,
      });

      if (!result.ok) {
        console.error(`Attestation failed: ${result.error.code}`);
        if (result.error.code === "UNEXPECTED") console.error(result.error.cause);
        process.exitCode = 1;
        return;
      }

      const output = {
        id: result.value.id,
        memberId: result.value.memberId,
        contributionYear: result.value.contributionYear,
        amount: String(result.value.amount),
        bankReference: result.value.bankReference,
        actor: result.value.actor,
        createdAt: result.value.createdAt,
      };

      console.log(
        Boolean(args.json)
          ? JSON.stringify(output)
          : `Created ${output.id} for ${output.memberId} (${output.contributionYear}): ${output.amount} IDR ref ${output.bankReference} by ${output.actor}`,
      );
    } finally {
      await container.close();
    }
  },
});

export default defineCommand({
  meta: { name: "contribution", description: "Contribution administration" },
  subCommands: { year, record, attest },
});
