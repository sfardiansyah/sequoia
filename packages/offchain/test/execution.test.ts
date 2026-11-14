import { beforeAll, describe, expect, test } from "bun:test";
import { Data, type UTxO } from "@lucid-evolution/lucid";
import { eligibleLeaf, MS_PER_DAY } from "../src/governance";
import {
  advanceTo,
  castVote,
  executeProposal,
  finalizeProposal,
  revealVote,
  tallyProposal,
} from "./helpers/ballot";
import { issueKyc, kycTerms } from "./helpers/kyc";
import {
  configDatum,
  expectRejected,
  genesis,
  keyHash,
  m1Ledger,
  m1TestConfig,
  scriptTime,
  selectActor,
  stateUnit,
  type Genesis,
  type M1Ledger,
} from "./helpers/m1";
import { joinMember } from "./helpers/membership";
import {
  createProposal,
  decodeProposalDatum,
  proposalUnit,
  withExecuted,
  withFinalized,
} from "./helpers/proposal";

const config = m1TestConfig();

/** The config this co-op votes for: a new year and a new annual amount. */
const nextConfig = {
  ...config,
  contributionYear: 2027n,
  annualAmount: 2_000_000n,
};

const secret = (index: number): string =>
  (index + 1).toString(16).padStart(2, "0").repeat(32);
const salt = "d1".repeat(32);

const ids = {
  passed: "e1".repeat(32),
  rejected: "e2".repeat(32),
};

describe("config execution after the timelock", () => {
  let ledger: M1Ledger;
  let m1: Genesis;
  let passed: UTxO;
  let rejected: UTxO;
  let timelockEnd: number;
  let finalizedAt: number;

  const proposalBox = async (id: string): Promise<UTxO> =>
    ledger.lucid.utxoByUnit(proposalUnit(m1.governancePolicy, id));

  beforeAll(async () => {
    ledger = await m1Ledger();
    m1 = await genesis(ledger, config);

    selectActor(ledger, "kycIssuer");
    const expiry =
      BigInt(scriptTime(ledger, ledger.emulator.now())) +
      30n * BigInt(MS_PER_DAY);
    const kyc = await issueKyc(ledger, m1, kycTerms("61", expiry));
    selectActor(ledger, "member");
    const memberBox = await joinMember(ledger, m1, { memberId: "61" }, kyc);
    const proposer = keyHash(ledger.actors.member.address);
    const start = BigInt(scriptTime(ledger, ledger.emulator.now()));
    const leaves = [eligibleLeaf(secret(0)), eligibleLeaf(secret(1))];

    const passedBox = await createProposal(
      ledger,
      m1,
      nextConfig,
      { id: ids.passed, proposer, leaves, start },
      memberBox,
      kyc,
    );
    const rejectedBox = await createProposal(
      ledger,
      m1,
      nextConfig,
      { id: ids.rejected, proposer, leaves: leaves.slice(0, 1), start },
      memberBox,
      kyc,
    );

    // Casting is permissionless; the deployer pays for the vote boxes.
    selectActor(ledger, "deployer");
    const votes = [
      await castVote(ledger, m1, passedBox, {
        leaf: leaves[0]!,
        voteSecret: secret(0),
        choice: "Yes",
        salt,
      }),
      await castVote(ledger, m1, await proposalBox(ids.passed), {
        leaf: leaves[1]!,
        voteSecret: secret(1),
        choice: "Yes",
        salt,
      }),
    ];

    const fields = decodeProposalDatum((await proposalBox(ids.passed)).datum!);
    advanceTo(ledger, Number(fields.end));
    const revealed = [
      await revealVote(ledger, m1, votes[0]!, { choice: "Yes", salt }),
      await revealVote(ledger, m1, votes[1]!, { choice: "Yes", salt }),
    ];
    const tallied = await tallyProposal(
      ledger,
      m1,
      await proposalBox(ids.passed),
      revealed,
    );
    advanceTo(ledger, Number(fields.reveal_end));
    passed = await finalizeProposal(ledger, m1, config, tallied);
    rejected = await finalizeProposal(
      ledger,
      m1,
      config,
      await proposalBox(ids.rejected),
    );

    expect(decodeProposalDatum(passed.datum!).status).toBe("Passed");
    expect(decodeProposalDatum(rejected.datum!).status).toBe("Rejected");
    finalizedAt = Number(decodeProposalDatum(passed.datum!).finalizedAt);
    timelockEnd =
      finalizedAt + Number(config.timelockDays) * MS_PER_DAY;
  }, 60_000);

  test("rejects a backdated finalize time", async () => {
    advanceTo(ledger, timelockEnd);
    const backdated = withExecuted(
      withFinalized(
        passed.datum!,
        "Passed",
        BigInt(finalizedAt - 30 * MS_PER_DAY),
      ),
    );

    const failure = await expectRejected(() =>
      executeProposal(ledger, m1, m1.configUtxo, passed, {
        proposalDatum: backdated,
      }),
    );

    expect(failure).toBeInstanceOf(Error);
  });

  test("rejects an immutable-field change", async () => {
    const changed = configDatum(
      ledger.roles,
      { ...nextConfig, network: 1n },
      {
        membership: m1.membershipPolicy,
        kyc: m1.kycPolicy,
        bank: m1.bankPolicy,
        governance: m1.governancePolicy,
        ballot: m1.ballotPolicy,
      },
    );

    const failure = await expectRejected(() =>
      executeProposal(ledger, m1, m1.configUtxo, passed, {
        configDatum: changed,
      }),
    );

    expect(failure).toBeInstanceOf(Error);
  });

  test("rejects a config that is not the proposed one", async () => {
    const changed = configDatum(
      ledger.roles,
      { ...nextConfig, annualAmount: 3_000_000n },
      {
        membership: m1.membershipPolicy,
        kyc: m1.kycPolicy,
        bank: m1.bankPolicy,
        governance: m1.governancePolicy,
        ballot: m1.ballotPolicy,
      },
    );

    const failure = await expectRejected(() =>
      executeProposal(ledger, m1, m1.configUtxo, passed, {
        configDatum: changed,
      }),
    );

    expect(failure).toBeInstanceOf(Error);
  });

  test("rejects a proposal that was not passed", async () => {
    const failure = await expectRejected(() =>
      executeProposal(ledger, m1, m1.configUtxo, rejected),
    );

    expect(failure).toBeInstanceOf(Error);
  });

  test("rejects execution before the timelock", async () => {
    advanceTo(ledger, finalizedAt + MS_PER_DAY);
    const failure = await expectRejected(() =>
      executeProposal(ledger, m1, m1.configUtxo, passed, {
        validFrom: finalizedAt + MS_PER_DAY,
      }),
    );

    expect(failure).toBeInstanceOf(Error);
  });

  test("executes the passed proposal and writes the proposed config", async () => {
    advanceTo(ledger, timelockEnd);
    const executed = await executeProposal(ledger, m1, m1.configUtxo, passed);

    expect(executed.config.address).toBe(m1.configAddress);
    expect(executed.config.assets[stateUnit(m1.stateNftPolicy)]).toBe(1n);
    const written = Data.from(executed.config.datum!) as {
      index: number;
      fields: unknown[];
    };
    expect(written.fields[0]).toBe(2027n);
    expect(written.fields[1]).toBe(2_000_000n);

    const proposal = decodeProposalDatum(executed.proposal.datum!);
    expect(proposal.status).toBe("Executed");
    expect(proposal.finalizedAt).toBe(BigInt(finalizedAt));
    expect(proposal.nullifiers).toHaveLength(2);
    expect(
      executed.proposal.assets[
        proposalUnit(m1.governancePolicy, ids.passed)
      ],
    ).toBe(1n);
  });

  test("rejects a second execution", async () => {
    const executed = await proposalBox(ids.passed);
    const configBox = await ledger.lucid.utxoByUnit(
      stateUnit(m1.stateNftPolicy),
    );
    const failure = await expectRejected(() =>
      executeProposal(ledger, m1, configBox, executed),
    );

    expect(failure).toBeInstanceOf(Error);
  });
});
