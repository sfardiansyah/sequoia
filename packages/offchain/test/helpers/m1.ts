import {
  Data,
  Emulator,
  Lucid,
  applyParamsToScript,
  generateEmulatorAccount,
  getAddressDetails,
  slotToBeginUnixTime,
  unixTimeToEnclosingSlot,
  validatorToAddress,
  validatorToScriptHash,
  type EmulatorAccount,
  type LucidEvolution,
  type SlotConfig,
  type Script,
  type TxSignBuilder,
  type UTxO,
} from "@lucid-evolution/lucid";
import { compiledValidator } from "../../src/blueprint";

/**
 * M1 genesis helpers (ADR 0008 §5). The state NFT policy is compiled against a
 * seed output reference, so the seed must exist before any script hash is known.
 */

export const STATE_ASSET_NAME = "STATE";
export const CONFIG_MIN_LOVELACE = 5_000_000n;
export const KYC_MIN_LOVELACE = 3_000_000n;
const SEED_LOVELACE = 12_345_678n;

export type M1Actors = {
  deployer: EmulatorAccount;
  kycIssuer: EmulatorAccount;
  bankIssuer: EmulatorAccount;
};

export type M1Ledger = {
  emulator: Emulator;
  lucid: LucidEvolution;
  actors: M1Actors;
  roles: M1Roles;
  slotConfig: SlotConfig;
};

export type M1Roles = {
  boardKeys: string[];
  kycIssuer: string;
  bankIssuer: string;
};

export function m1TestConfig(): TestConfig {
  return {
    contributionYear: 2026n,
    annualAmount: 1_000_000n,
    memberCapitalBps: 7_000n,
    capitalParticipationBps: 3_000n,
    standardCapitalParticipationMaxBps: 5_000n,
    boardThreshold: 2n,
    network: 0n,
  };
}

export type TestConfig = {
  contributionYear: bigint;
  annualAmount: bigint;
  memberCapitalBps: bigint;
  capitalParticipationBps: bigint;
  standardCapitalParticipationMaxBps: bigint;
  boardThreshold: bigint;
  network: bigint;
};

const keyHash = (address: string): string => getAddressDetails(address).paymentCredential!.hash;

/**
 * Lucid's schema typings cannot infer the value from the schema (`Exact<T>` is
 * `T`), so these two wrappers pin the value side.
 */
type PlutusDataArg = ReturnType<typeof Data.castTo>;
export const castTo = (value: unknown, schema: unknown): PlutusDataArg =>
  (Data.castTo as unknown as (v: unknown, s: unknown) => PlutusDataArg)(value, schema);
export const encode = (value: unknown, schema: unknown): string =>
  (Data.to as unknown as (v: unknown, s: unknown) => string)(value, schema);

export function m1Roles(actors: M1Actors): M1Roles {
  const board = [0, 1, 2].map(() =>
    keyHash(generateEmulatorAccount({ lovelace: 0n }).address),
  );
  return {
    boardKeys: board,
    kycIssuer: keyHash(actors.kycIssuer.address),
    bankIssuer: keyHash(actors.bankIssuer.address),
  };
}

/** A funded emulator: the deployer owns the seed; issuers pay for their own txs. */
export async function m1Ledger(): Promise<M1Ledger> {
  const deployer = generateEmulatorAccount({ lovelace: 1_000_000_000n });
  const kycIssuer = generateEmulatorAccount({ lovelace: 100_000_000n });
  const bankIssuer = generateEmulatorAccount({ lovelace: 100_000_000n });
  const emulator = new Emulator([deployer, kycIssuer, bankIssuer]);
  const lucid = await Lucid(emulator, "Custom");
  lucid.selectWallet.fromSeed(deployer.seedPhrase);
  const actors = { deployer, kycIssuer, bankIssuer };
  // The emulator-derived slot mapping is fixed when Lucid is constructed.
  const slotConfig = lucid.newTx().rawConfig().lucidConfig.slotConfig;
  return { emulator, lucid, actors, roles: m1Roles(actors), slotConfig };
}

export function selectActor(ledger: M1Ledger, actor: keyof M1Actors): void {
  ledger.lucid.selectWallet.fromSeed(ledger.actors[actor].seedPhrase);
}

/**
 * A validator sees the lower bound as the start of the enclosing slot, not the
 * wall-clock value passed to `validFrom`. Datums pinned to the bound use this.
 */
export function scriptTime(ledger: M1Ledger, unixTime: number): number {
  return slotToBeginUnixTime(
    unixTimeToEnclosingSlot(unixTime, ledger.slotConfig),
    ledger.slotConfig,
  );
}

export function stateNftScript(seed: UTxO): Script {
  const seedRef = castTo(
    { transaction_id: seed.txHash, output_index: BigInt(seed.outputIndex) },
    Data.Object({ transaction_id: Data.Bytes(), output_index: Data.Integer() }),
  );
  return {
    type: "PlutusV3",
    script: applyParamsToScript(
      compiledValidator("state_nft.state_nft.mint").compiledCode,
      [seedRef],
    ),
  };
}

export function configScript(stateNftPolicy: string): Script {
  return {
    type: "PlutusV3",
    script: applyParamsToScript(compiledValidator("config.config.spend").compiledCode, [
      castTo(stateNftPolicy, Data.Bytes()),
    ]),
  };
}

export function membershipScript(stateNftPolicy: string): Script {
  return {
    type: "PlutusV3",
    script: applyParamsToScript(
      compiledValidator("membership.membership.mint").compiledCode,
      [castTo(stateNftPolicy, Data.Bytes())],
    ),
  };
}

export function bankScript(): Script {
  return {
    type: "PlutusV3",
    script: applyParamsToScript(
      compiledValidator("bank_attestation.bank_attestation.spend").compiledCode,
      [],
    ),
  };
}

export function kycScript(stateNftPolicy: string): Script {
  return {
    type: "PlutusV3",
    script: applyParamsToScript(
      compiledValidator("kyc_attestation.kyc_attestation.mint").compiledCode,
      [castTo(stateNftPolicy, Data.Bytes())],
    ),
  };
}

export function stateUnit(stateNftPolicy: string): string {
  return stateNftPolicy + Buffer.from(STATE_ASSET_NAME).toString("hex");
}

const credential = Data.Object({ VerificationKey: Data.Bytes() });

const configDatumSchema = Data.Object({
  contribution_year: Data.Integer(),
  annual_amount: Data.Integer(),
  member_capital_bps: Data.Integer(),
  capital_participation_bps: Data.Integer(),
  standard_capital_participation_max_bps: Data.Integer(),
  board_keys: Data.Array(Data.Bytes()),
  board_threshold: Data.Integer(),
  kyc_issuer: credential,
  bank_issuer: credential,
  network: Data.Integer(),
  membership_policy: Data.Bytes(),
  kyc_policy: Data.Bytes(),
  bank_policy: Data.Bytes(),
});

/** Field order mirrors `contracts/lib/sequoia/types.ak`. */
export type PolicyHashes = { membership: string; kyc: string; bank: string };

export function configDatum(
  roles: M1Roles,
  config: TestConfig,
  policies: PolicyHashes,
) {
  return encode(
    {
      contribution_year: config.contributionYear,
      annual_amount: config.annualAmount,
      member_capital_bps: config.memberCapitalBps,
      capital_participation_bps: config.capitalParticipationBps,
      standard_capital_participation_max_bps: config.standardCapitalParticipationMaxBps,
      board_keys: roles.boardKeys,
      board_threshold: config.boardThreshold,
      kyc_issuer: { VerificationKey: roles.kycIssuer },
      bank_issuer: { VerificationKey: roles.bankIssuer },
      network: config.network,
      membership_policy: policies.membership,
      kyc_policy: policies.kyc,
      bank_policy: policies.bank,
    },
    configDatumSchema,
  );
}

/**
 * Creates the one-shot seed and resolves it by transaction hash. The wallet's
 * other UTxOs are unordered and shared with later tests, so they are not a seed.
 */
export async function createSeed(ledger: M1Ledger): Promise<UTxO> {
  const { lucid, emulator } = ledger;
  const address = await lucid.wallet().address();
  const tx = await lucid
    .newTx()
    .pay.ToAddress(address, { lovelace: SEED_LOVELACE })
    .complete();
  const hash = await submitTx(tx);
  emulator.awaitBlock(1);

  const seed = (await lucid.utxosAt(address)).find(
    (utxo) => utxo.txHash === hash && utxo.assets.lovelace === SEED_LOVELACE,
  );
  if (seed === undefined) throw new Error("seed UTxO was not created");
  return seed;
}

export type Genesis = {
  seed: UTxO;
  stateNft: Script;
  stateNftPolicy: string;
  configValidator: Script;
  configAddress: string;
  membershipValidator: Script;
  membershipPolicy: string;
  kycValidator: Script;
  kycPolicy: string;
  kycAddress: string;
  bankValidator: Script;
  bankPolicy: string;
  bankAddress: string;
  datum: string;
  configUtxo: UTxO;
};

/**
 * One transaction: spend the seed, mint one STATE, create the config box.
 * Not a board action — genesis is deployer-trusted in M1 (ADR 0008).
 */
export async function genesis(
  ledger: M1Ledger,
  config: TestConfig,
): Promise<Genesis> {
  const { lucid, emulator, roles } = ledger;
  const seed = await createSeed(ledger);
  const stateNft = stateNftScript(seed);
  const stateNftPolicy = validatorToScriptHash(stateNft);
  const configValidator = configScript(stateNftPolicy);
  const configAddress = validatorToAddress("Custom", configValidator);
  const membershipValidator = membershipScript(stateNftPolicy);
  const membershipPolicy = validatorToScriptHash(membershipValidator);
  const kycValidator = kycScript(stateNftPolicy);
  const kycPolicy = validatorToScriptHash(kycValidator);
  const kycAddress = validatorToAddress("Custom", kycValidator);
  const bankValidator = bankScript();
  const bankPolicy = validatorToScriptHash(bankValidator);
  const bankAddress = validatorToAddress("Custom", bankValidator);
  const datum = configDatum(roles, config, {
    membership: membershipPolicy,
    kyc: kycPolicy,
    bank: bankPolicy,
  });
  const unit = stateUnit(stateNftPolicy);

  const tx = await lucid
    .newTx()
    .collectFrom([seed])
    .attach.MintingPolicy(stateNft)
    .mintAssets({ [unit]: 1n }, Data.void())
    .pay.ToAddressWithData(
      configAddress,
      { kind: "inline", value: datum },
      { lovelace: CONFIG_MIN_LOVELACE, [unit]: 1n },
    )
    .complete();
  await submitTx(tx);
  emulator.awaitBlock(1);

  const configUtxo = await lucid.utxoByUnit(unit);
  return {
    seed,
    stateNft,
    stateNftPolicy,
    configValidator,
    configAddress,
    membershipValidator,
    membershipPolicy,
    kycValidator,
    kycPolicy,
    kycAddress,
    bankValidator,
    bankPolicy,
    bankAddress,
    datum,
    configUtxo,
  };
}

export async function submitTx(tx: TxSignBuilder): Promise<string> {
  return (await tx.sign.withWallet().complete()).submit();
}

/** Runs a transaction builder and returns the rejection, or fails the test. */
export async function expectRejected(build: () => Promise<unknown>): Promise<unknown> {
  try {
    await build();
  } catch (error) {
    return error;
  }
  throw new Error("expected the transaction to be rejected");
}
