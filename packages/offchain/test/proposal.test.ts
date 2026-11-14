import { beforeAll, describe, expect, test } from "bun:test";
import { Data, type UTxO } from "@lucid-evolution/lucid";
import { eligibleLeaf, MS_PER_DAY } from "../src/governance";
import { issueKyc, kycTerms } from "./helpers/kyc";
import {
  genesis,
  keyHash,
  m1Ledger,
  m1TestConfig,
  scriptTime,
  selectActor,
  submitWithBoard,
  type Genesis,
  type M1Ledger,
} from "./helpers/m1";
import { joinMember, memberUnit } from "./helpers/membership";
import {
  PROPOSAL_MIN_LOVELACE,
  proposalDatum,
  proposalUnit,
} from "./helpers/proposal";

const config = m1TestConfig();
const memberId = "41";
const proposalId = "cd".repeat(32);
const voteSecret = "11".repeat(32);

describe("governance proposal creation", () => {
  let ledger: M1Ledger;
  let m1: Genesis;
  let memberBox: UTxO;
  let kycBox: UTxO;

  beforeAll(async () => {
    ledger = await m1Ledger();
    m1 = await genesis(ledger, config);

    selectActor(ledger, "kycIssuer");
    const kyc = await issueKyc(
      ledger,
      m1,
      kycTerms(memberId, BigInt(ledger.emulator.now()) + 3_600_000n),
    );
    selectActor(ledger, "member");
    await joinMember(ledger, m1, { memberId }, kyc);

    memberBox = (await ledger.lucid.utxosAt(m1.membershipAddress)).find(
      (box) => box.assets[memberUnit(m1.membershipPolicy, memberId)] === 1n,
    )!;
    kycBox = (await ledger.lucid.utxosAt(m1.kycAddress)).find(
      (box) => box.assets[m1.kycPolicy + memberId] === 1n,
    )!;
    expect(memberBox).toBeDefined();
    expect(kycBox).toBeDefined();
  });

  test("a board-signed proposal is recorded", async () => {
    const now = ledger.emulator.now();
    const start = BigInt(scriptTime(ledger, now));
    const proposer = keyHash(await ledger.lucid.wallet().address());
    const leaf = eligibleLeaf(voteSecret);
    const unit = proposalUnit(m1.governancePolicy, proposalId);
    const datum = proposalDatum(
      ledger.roles,
      config,
      {
        membership: m1.membershipPolicy,
        kyc: m1.kycPolicy,
        bank: m1.bankPolicy,
        governance: m1.governancePolicy,
        ballot: m1.ballotPolicy,
      },
      { id: proposalId, proposer, leaves: [leaf], start },
    );

    let tx = ledger.lucid.newTx().addSignerKey(proposer);
    for (const key of ledger.roles.boardKeys.slice(0, 2)) {
      tx = tx.addSignerKey(key);
    }
    const built = await tx
      .attach.MintingPolicy(m1.governanceValidator)
      .mintAssets({ [unit]: 1n }, Data.void())
      .readFrom([m1.configUtxo, memberBox, kycBox])
      .pay.ToAddressWithData(
        m1.governanceAddress,
        { kind: "inline", value: datum },
        { lovelace: PROPOSAL_MIN_LOVELACE, [unit]: 1n },
      )
      .validFrom(Number(start))
      .validTo(Number(start) + 60_000)
      .complete();
    await submitWithBoard(built, ledger, 2);
    ledger.emulator.awaitBlock(1);

    const boxes = await ledger.lucid.utxosAt(m1.governanceAddress);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.assets).toEqual({
      lovelace: PROPOSAL_MIN_LOVELACE,
      [unit]: 1n,
    });

    const decoded = Data.from(boxes[0]!.datum!) as {
      index: number;
      fields: unknown[];
    };
    const constr = (value: unknown) =>
      value as { index: number; fields: unknown[] };

    expect(decoded.index).toBe(0);
    expect(decoded.fields).toHaveLength(16);
    expect(decoded.fields[0]).toBe(proposalId);
    expect(decoded.fields[1]).toBe(proposer);
    expect(constr(decoded.fields[2])).toEqual({ index: 0, fields: [] });
    const proposedConfig = constr(decoded.fields[3]);
    expect(proposedConfig.fields.slice(0, 5)).toEqual([
      2026n,
      1_000_000n,
      7_000n,
      3_000n,
      5_000n,
    ]);
    expect(proposedConfig.fields[5]).toEqual(ledger.roles.boardKeys);
    expect(proposedConfig.fields[6]).toBe(2n);
    expect(proposedConfig.fields.slice(13, 21)).toEqual([
      m1.governancePolicy,
      m1.ballotPolicy,
      5_000n,
      5_001n,
      6_667n,
      7n,
      7n,
      3n,
    ]);
    expect(decoded.fields[4]).toEqual([leaf]);
    expect(decoded.fields[5]).toBe(start);
    expect(decoded.fields[6]).toBe(
      start + config.votingDays * BigInt(MS_PER_DAY),
    );
    expect(decoded.fields[7]).toBe(
      start + (config.votingDays + config.revealDays) * BigInt(MS_PER_DAY),
    );
    expect(decoded.fields.slice(8, 14)).toEqual([[], 0n, 0n, 0n, 0n, 0n]);
    expect(constr(decoded.fields[14])).toEqual({ index: 0, fields: [] });
    expect(constr(decoded.fields[15])).toEqual({ index: 1, fields: [] });
  });
});
