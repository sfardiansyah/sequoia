import { beforeAll, describe, expect, test } from "bun:test";
import {
  Data,
  Emulator,
  Lucid,
  applyParamsToScript,
  generateEmulatorAccount,
  validatorToAddress,
  validatorToScriptHash,
  type LucidEvolution,
  type Script,
  type UTxO,
} from "@lucid-evolution/lucid";
import { compiledValidator } from "../src/blueprint";

const probe = compiledValidator("probe.probe.spend");
const script: Script = {
  type: "PlutusV3",
  script: applyParamsToScript(probe.compiledCode, []),
};

type ProbeBoxes = {
  referenceBox: UTxO;
  referenceScriptBox: UTxO;
  spendWithReference: UTxO;
};

type ProbeLedger = {
  emulator: Emulator;
  lucid: LucidEvolution;
  address: string;
} & ProbeBoxes;

const REDEEMER = Data.void();

const SPEND_LOVELACE = 10_000_000n;

async function spendableAt(lucid: LucidEvolution, address: string): Promise<UTxO[]> {
  const utxos = await lucid.utxosAt(address);
  return utxos.filter(
    (utxo) => utxo.scriptRef === undefined && utxo.assets.lovelace === SPEND_LOVELACE,
  );
}

async function deposit(
  lucid: LucidEvolution,
  emulator: Emulator,
  address: string,
): Promise<ProbeBoxes> {
  const wallet = await lucid.wallet().address();
  const tx = await lucid
    .newTx()
    .pay.ToAddressWithData(
      address,
      { kind: "inline", value: Data.void() },
      { lovelace: 10_000_000n },
    )
    .pay.ToAddressWithData(
      address,
      { kind: "inline", value: Data.void() },
      { lovelace: 10_000_000n },
    )
    .pay.ToAddressWithData(
      address,
      { kind: "inline", value: Data.void() },
      { lovelace: 10_000_000n },
    )
    .pay.ToAddressWithData(
      address,
      { kind: "inline", value: Data.void() },
      { lovelace: 20_000_000n },
      script,
    )
    .pay.ToAddress(wallet, { lovelace: 5_000_000n })
    .complete();

  await (await tx.sign.withWallet().complete()).submit();
  emulator.awaitBlock(1);

  const atScript = await lucid.utxosAt(address);
  const spendable = atScript.filter(
    (utxo) => utxo.scriptRef === undefined && utxo.assets.lovelace === SPEND_LOVELACE,
  );
  const referenceScriptBox = atScript.find((utxo) => utxo.scriptRef !== undefined);
  const referenceBox = (await lucid.utxosAt(wallet)).find(
    (utxo) => utxo.assets.lovelace === 5_000_000n,
  );

  if (spendable.length !== 3 || referenceScriptBox === undefined || referenceBox === undefined) {
    throw new Error("probe setup did not produce the expected UTxOs");
  }

  return { spendWithReference: spendable[0]!, referenceScriptBox, referenceBox };
}

async function submitSpend(
  ledger: ProbeLedger,
  utxo: UTxO,
  referenceInputs: UTxO[],
  attachScript: boolean,
): Promise<void> {
  let tx = ledger.lucid
    .newTx()
    .collectFrom([utxo], REDEEMER);

  if (referenceInputs.length > 0) {
    tx = tx.readFrom(referenceInputs);
  }

  if (attachScript) {
    tx = tx.attach.SpendingValidator(script);
  }

  const unsigned = await tx.complete();
  const signed = await unsigned.sign.withWallet().complete();
  await signed.submit();
  ledger.emulator.awaitBlock(1);
}

describe("Lucid Evolution emulator probe", () => {
  // Tests share the deposit and run in file order: each spend removes one UTxO.
  let ledger: ProbeLedger;

  beforeAll(async () => {
    const account = generateEmulatorAccount({ lovelace: 1_000_000_000n });
    const emulator = new Emulator([account]);
    const lucid = await Lucid(emulator, "Custom");
    lucid.selectWallet.fromSeed(account.seedPhrase);

    const address = validatorToAddress("Custom", script);
    ledger = {
      emulator,
      lucid,
      address,
      ...(await deposit(lucid, emulator, address)),
    };
  });

  test("the applied script matches the blueprint hash", () => {
    expect(validatorToScriptHash(script)).toBe(probe.hash);
  });

  test("CIP-31: a reference input reaches a Plutus V3 script context", async () => {
    await submitSpend(ledger, ledger.spendWithReference, [ledger.referenceBox], true);
  });

  test("CIP-33: the script can run from a reference script UTxO", async () => {
    const spendable = await spendableAt(ledger.lucid, ledger.address);
    expect(spendable).toHaveLength(2);

    await submitSpend(
      ledger,
      spendable[0]!,
      [ledger.referenceScriptBox, ledger.referenceBox],
      false,
    );
  });

  test("the probe fails when no reference input is present", async () => {
    const spendable = await spendableAt(ledger.lucid, ledger.address);
    expect(spendable).toHaveLength(1);

    let failure: unknown;
    try {
      await submitSpend(ledger, spendable[0]!, [], true);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("failed script execution");
  });
});
