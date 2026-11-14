import { beforeAll, describe, expect, test } from "bun:test";
import { Data, getAddressDetails, validatorToScriptHash } from "@lucid-evolution/lucid";
import {
  CONFIG_MIN_LOVELACE,
  createSeed,
  expectRejected,
  genesis,
  m1Ledger,
  m1TestConfig,
  stateNftScript,
  stateUnit,
  submitTx,
  type Genesis,
  type M1Ledger,
} from "./helpers/m1";

const config = m1TestConfig();

describe("state NFT and config genesis", () => {
  let ledger: M1Ledger;
  let m1: Genesis;

  beforeAll(async () => {
    ledger = await m1Ledger();
    m1 = await genesis(ledger, config);
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

  test("the config datum follows the ADR 0009 config v2 field order", async () => {
    const box = (await ledger.lucid.utxosAt(m1.configAddress))[0]!;
    const constr = (value: unknown) => value as { index: number; fields: unknown[] };
    const datum = constr(Data.from(box.datum!));

    expect(datum.index).toBe(0);
    expect(datum.fields).toHaveLength(21);
    expect(datum.fields.slice(0, 5)).toEqual([2026n, 1_000_000n, 7_000n, 3_000n, 5_000n]);
    expect(datum.fields[5]).toEqual(ledger.roles.boardKeys);
    expect(datum.fields[6]).toBe(2n);
    expect(constr(datum.fields[7])).toEqual({ index: 0, fields: [ledger.roles.kycIssuer] });
    expect(constr(datum.fields[8])).toEqual({ index: 0, fields: [ledger.roles.bankIssuer] });
    expect(datum.fields.slice(9, 13)).toEqual([
      0n,
      m1.membershipPolicy,
      m1.kycPolicy,
      m1.bankPolicy,
    ]);
    expect(datum.fields.slice(13)).toEqual([
      m1.governancePolicy,
      m1.ballotPolicy,
      5_000n,
      5_001n,
      6_667n,
      7n,
      7n,
      3n,
    ]);
  });

  test("the config address and the state policy are the applied script hashes", () => {
    const addressHash = getAddressDetails(m1.configAddress).paymentCredential?.hash;
    expect(addressHash).toBe(validatorToScriptHash(m1.configValidator));
    expect(validatorToScriptHash(m1.stateNft)).toBe(m1.stateNftPolicy);
    expect(validatorToScriptHash(m1.membershipValidator)).toBe(m1.membershipPolicy);
    expect(validatorToScriptHash(m1.kycValidator)).toBe(m1.kycPolicy);
    expect(validatorToScriptHash(m1.bankValidator)).toBe(m1.bankPolicy);
    expect(validatorToScriptHash(m1.governanceValidator)).toBe(
      m1.governancePolicy,
    );
    expect(getAddressDetails(m1.kycAddress).paymentCredential?.hash).toBe(m1.kycPolicy);
    expect(getAddressDetails(m1.bankAddress).paymentCredential?.hash).toBe(m1.bankPolicy);
    expect(getAddressDetails(m1.governanceAddress).paymentCredential?.hash).toBe(
      m1.governancePolicy,
    );
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

  test("a config spend with no passed proposal fails", async () => {
    const failure = await expectRejected(async () => {
      const tx = await ledger.lucid
        .newTx()
        .collectFrom([m1.configUtxo], Data.void())
        .attach.SpendingValidator(m1.configValidator)
        .pay.ToContract(
          m1.configAddress,
          { kind: "inline", value: m1.datum },
          m1.configUtxo.assets,
        )
        .complete();
      await submitTx(tx);
    });

    expect(String(failure)).toContain("failed script execution");
  });
});
