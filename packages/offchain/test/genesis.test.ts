import { beforeAll, describe, expect, test } from "bun:test";
import { Data, getAddressDetails, validatorToScriptHash } from "@lucid-evolution/lucid";
import {
  CONFIG_MIN_LOVELACE,
  createSeed,
  expectRejected,
  genesis,
  m1Ledger,
  m1Roles,
  stateNftScript,
  stateUnit,
  submitTx,
  type Genesis,
  type M1Ledger,
  type M1Roles,
  type TestConfig,
} from "./helpers/m1";

// #22–#24 replace these with the real applied script hashes; nothing reads them in M1.
const PLACEHOLDER_POLICY = "00".repeat(28);

const roles: M1Roles = m1Roles();

const config: TestConfig = {
  contributionYear: 2026n,
  annualAmount: 1_000_000n,
  memberCapitalBps: 7_000n,
  capitalParticipationBps: 3_000n,
  standardCapitalParticipationMaxBps: 5_000n,
  boardThreshold: 2n,
  network: 0n,
  membershipPolicy: PLACEHOLDER_POLICY,
  kycPolicy: PLACEHOLDER_POLICY,
  bankPolicy: PLACEHOLDER_POLICY,
};

describe("state NFT and config genesis", () => {
  let ledger: M1Ledger;
  let m1: Genesis;

  beforeAll(async () => {
    ledger = await m1Ledger();
    m1 = await genesis(ledger, roles, config);
  });

  test("genesis creates exactly one config box holding one STATE", async () => {
    const boxes = await ledger.lucid.utxosAt(m1.configAddress);

    expect(boxes).toHaveLength(1);
    const box = boxes[0]!;
    expect(box.assets).toEqual({
      lovelace: CONFIG_MIN_LOVELACE,
      [stateUnit(m1.stateNftPolicy)]: 1n,
    });
    expect(box.scriptRef).toBeUndefined();
    expect(box.datum?.replace(/^0x/, "")).toBe(m1.datum);
  });

  test("the config datum follows the ADR 0008 field order", async () => {
    const box = (await ledger.lucid.utxosAt(m1.configAddress))[0]!;
    const constr = (value: unknown) => value as { index: number; fields: unknown[] };
    const datum = constr(Data.from(box.datum!));

    expect(datum.index).toBe(0);
    expect(datum.fields).toHaveLength(13);
    expect(datum.fields.slice(0, 5)).toEqual([2026n, 1_000_000n, 7_000n, 3_000n, 5_000n]);
    expect(datum.fields[5]).toEqual(roles.boardKeys);
    expect(datum.fields[6]).toBe(2n);
    expect(constr(datum.fields[7])).toEqual({ index: 0, fields: [roles.kycIssuer] });
    expect(constr(datum.fields[8])).toEqual({ index: 0, fields: [roles.bankIssuer] });
    expect(datum.fields.slice(9)).toEqual([0n, PLACEHOLDER_POLICY, PLACEHOLDER_POLICY, PLACEHOLDER_POLICY]);
  });

  test("the config address and the state policy are the applied script hashes", () => {
    const addressHash = getAddressDetails(m1.configAddress).paymentCredential?.hash;
    expect(addressHash).toBe(validatorToScriptHash(m1.configValidator));
    expect(validatorToScriptHash(m1.stateNft)).toBe(m1.stateNftPolicy);
  });

  test("the seed is spent by genesis", async () => {
    const utxos = await ledger.lucid.utxosAt(await ledger.lucid.wallet().address());
    const seedStillThere = utxos.some(
      (utxo) => utxo.txHash === m1.seed.txHash && utxo.outputIndex === m1.seed.outputIndex,
    );
    expect(seedStillThere).toBe(false);
  });

  test("a second mint with the same policy fails", async () => {
    const unit = stateUnit(m1.stateNftPolicy);

    const failure = await expectRejected(async () => {
      const tx = await ledger.lucid
        .newTx()
        .attach.MintingPolicy(m1.stateNft)
        .mintAssets({ [unit]: 1n }, Data.void())
        .complete();
      await submitTx(tx);
    });

    expect(failure).toBeInstanceOf(Error);
  });

  test("minting two STATE in one transaction fails", async () => {
    const seed = await createSeed(ledger);
    const stateNft = stateNftScript(seed);
    const unit = stateUnit(validatorToScriptHash(stateNft));

    const failure = await expectRejected(async () => {
      const tx = await ledger.lucid
        .newTx()
        .collectFrom([seed])
        .attach.MintingPolicy(stateNft)
        .mintAssets({ [unit]: 2n }, Data.void())
        .complete();
      await submitTx(tx);
    });

    expect(failure).toBeInstanceOf(Error);
  });

  test("spending the config box fails", async () => {
    const failure = await expectRejected(async () => {
      const tx = await ledger.lucid
        .newTx()
        .collectFrom([m1.configUtxo], Data.void())
        .attach.SpendingValidator(m1.configValidator)
        .complete();
      await submitTx(tx);
    });

    expect(String(failure)).toContain("failed script execution");
  });
});
