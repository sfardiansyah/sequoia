import { defineCommand, runMain } from "citty";

const member = defineCommand({
  meta: { name: "member", description: "Member administration" },
  subCommands: {
    admit: () => import("./admit-member").then((module) => module.default),
  },
});

const main = defineCommand({
  meta: {
    name: "sequoia",
    version: "0.1.0",
    description: "Sequoia admin CLI",
  },
  subCommands: {
    migrate: () => import("./migrate").then((module) => module.default),
    member,
    kyc: () => import("./kyc").then((module) => module.default),
  },
});

runMain(main);
