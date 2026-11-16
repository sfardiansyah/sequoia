import { beforeAll, describe, expect, test } from "bun:test";
import {
  POOL_MIN_LOVELACE,
  expectRejected,
  genesis,
  poolDatum,
  poolUnit,
  scriptTime,
  selectActor,
  submitTx,
  testConfig,
  testLedger,
  type Genesis,
  type Ledger,
} from "./helpers/harness";
import { attestPool, decodePoolDatum } from "./helpers/treasury";

const config = testConfig();
const bankRef = "ab".repeat(32);

/**
 * The pool is attested accounting, not on-chain cash: the treasurer writes the
 * bank balance and `committed` is bookkeeping for approved projects (ADR 0010
 * §1–§2). `committed` can only move once projects exist (#38), so the emulator
 * covers it at zero; the below-`committed` case is in `treasury_rules.test.ak`.
 */
describe("treasury pool attestation", () => {
  let ledger: Ledger;
  let m1: Genesis;

  beforeAll(async () => {
    ledger = await testLedger();
    m1 = await genesis(ledger, config);
  });

  const poolBox = () => ledger.lucid.utxoByUnit(poolUnit(m1.stateNftPolicy));

  test("the treasurer funds the empty pool", async () => {
    selectActor(ledger, "bankIssuer");
    const box = await attestPool(ledger, m1, {
      balance: 25_000_000n,
      bankRefHash: bankRef,
    });

    expect(decodePoolDatum(box.datum!)).toEqual({
      balance: 25_000_000n,
      committed: 0n,
    });
    expect(box.assets[poolUnit(m1.stateNftPolicy)]).toBe(1n);
    expect(box.address).toBe(m1.treasuryAddress);
    expect(box.assets.lovelace).toBe(POOL_MIN_LOVELACE);
  });

  test("the balance moves both ways and the box stays a singleton", async () => {
    const lowered = await attestPool(ledger, m1, {
      balance: 4_000_000n,
      bankRefHash: bankRef,
    });
    expect(decodePoolDatum(lowered.datum!).balance).toBe(4_000_000n);

    const raised = await attestPool(ledger, m1, {
      balance: 40_000_000n,
      bankRefHash: bankRef,
    });
    expect(decodePoolDatum(raised.datum!).balance).toBe(40_000_000n);
    expect(raised.assets[poolUnit(m1.stateNftPolicy)]).toBe(1n);
  });

  test("a non-treasurer cannot attest", async () => {
    selectActor(ledger, "deployer");
    const failure = await expectRejected(() =>
      attestPool(ledger, m1, { balance: 1n, bankRefHash: bankRef }),
    );

    expect(String(failure)).toContain("failed script execution");
  });

  test("a negative balance and an empty bank reference fail", async () => {
    selectActor(ledger, "bankIssuer");
    const negative = await expectRejected(() =>
      attestPool(ledger, m1, { balance: -1n, bankRefHash: bankRef }),
    );
    const emptyReference = await expectRejected(() =>
      attestPool(ledger, m1, { balance: 1n, bankRefHash: "" }),
    );

    expect(negative).toBeInstanceOf(Error);
    expect(emptyReference).toBeInstanceOf(Error);
  });

  test("a tampered datum, a moved pool, and a mint on the spend path fail", async () => {
    const committed = decodePoolDatum((await poolBox()).datum!).committed;
    const tampered = await expectRejected(() =>
      attestPool(ledger, m1, {
        balance: 1_000_000n,
        datum: poolDatum(1_000_000n, committed + 1n),
      }),
    );
    const moved = await expectRejected(() =>
      attestPool(ledger, m1, {
        balance: 1_000_000n,
        address: ledger.actors.member.address,
      }),
    );
    const minted = await expectRejected(() =>
      attestPool(ledger, m1, {
        balance: 1_000_000n,
        mint: { name: "01".repeat(32), quantity: 1n },
      }),
    );

    expect(tampered).toBeInstanceOf(Error);
    expect(moved).toBeInstanceOf(Error);
    expect(minted).toBeInstanceOf(Error);
  });

  test("a box at the treasury script without the pool token cannot be attested", async () => {
    const now = scriptTime(ledger, ledger.emulator.now());
    const funding = await ledger.lucid
      .newTx()
      .pay.ToContract(
        m1.treasuryAddress,
        { kind: "inline", value: poolDatum(1n, 0n) },
        { lovelace: POOL_MIN_LOVELACE },
      )
      .validFrom(now)
      .validTo(now + 60_000)
      .complete();
    await submitTx(funding);
    ledger.emulator.awaitBlock(1);

    const impostor = (await ledger.lucid.utxosAt(m1.treasuryAddress)).find(
      (utxo) => utxo.assets[poolUnit(m1.stateNftPolicy)] !== 1n,
    );
    if (impostor === undefined) throw new Error("impostor box missing");

    const failure = await expectRejected(() =>
      attestPool(ledger, m1, { balance: 2n, box: impostor }),
    );

    expect(String(failure)).toContain("failed script execution");
  });
});
