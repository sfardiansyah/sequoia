import {
  Constr,
  Data,
  Emulator,
  Lucid,
  applyParamsToScript,
  credentialToAddress,
  generateEmulatorAccount,
  generateEmulatorAccountFromPrivateKey,
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
 * Emulator genesis helpers for the current v2 script set (ADR 0009 §9). The
 * state NFT policy is compiled against a seed output reference, so the seed must
 * exist before any script hash is known.
 */

export const STATE_ASSET_NAME = "STATE";
export const POOL_ASSET_NAME = "POOL";
export const CONFIG_MIN_LOVELACE = 5_000_000n;
export const KYC_MIN_LOVELACE = 3_000_000n;
export const MEMBER_MIN_LOVELACE = 3_000_000n;
export const POOL_MIN_LOVELACE = 5_000_000n;
const SEED_LOVELACE = 12_345_678n;

export type Actors = {
  deployer: EmulatorAccount;
  kycIssuer: EmulatorAccount;
  bankIssuer: EmulatorAccount;
  member: EmulatorAccount;
};

export type Ledger = {
  emulator: Emulator;
  lucid: LucidEvolution;
  actors: Actors;
  board: EmulatorAccount[];
  roles: Roles;
  slotConfig: SlotConfig;
};

export type Roles = {
  boardKeys: string[];
  kycIssuer: string;
  bankIssuer: string;
};

export function testConfig(): TestConfig {
  return {
    contributionYear: 2026n,
    annualAmount: 1_000_000n,
    memberCapitalBps: 7_000n,
    capitalParticipationBps: 3_000n,
    standardCapitalParticipationMaxBps: 5_000n,
    boardThreshold: 2n,
    network: 0n,
    quorumBps: 5_000n,
    projectThresholdBps: 5_001n,
    structuralThresholdBps: 6_667n,
    timelockDays: 7n,
    votingDays: 7n,
    revealDays: 3n,
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
  quorumBps: bigint;
  projectThresholdBps: bigint;
  structuralThresholdBps: bigint;
  timelockDays: bigint;
  votingDays: bigint;
  revealDays: bigint;
};

export const keyHash = (address: string): string =>
  getAddressDetails(address).paymentCredential!.hash;

/**
 * Lucid's schema typings cannot infer the value from the schema (`Exact<T>` is
 * `T`), so these two wrappers pin the value side.
 */
type PlutusDataArg = ReturnType<typeof Data.castTo>;
export const castTo = (value: unknown, schema: unknown): PlutusDataArg =>
  (Data.castTo as unknown as (v: unknown, s: unknown) => PlutusDataArg)(value, schema);
export const encode = (value: unknown, schema: unknown): string =>
  (Data.to as unknown as (v: unknown, s: unknown) => string)(value, schema);

export function testRoles(
  actors: Actors,
  board: EmulatorAccount[],
): Roles {
  return {
    boardKeys: board.map((account) => keyHash(account.address)),
    kycIssuer: keyHash(actors.kycIssuer.address),
    bankIssuer: keyHash(actors.bankIssuer.address),
  };
}

/** A funded emulator: the deployer owns the seed; issuers pay for their own txs. */
export async function testLedger(): Promise<Ledger> {
  const deployer = generateEmulatorAccount({ lovelace: 1_000_000_000n });
  const kycIssuer = generateEmulatorAccount({ lovelace: 100_000_000n });
  const bankIssuer = generateEmulatorAccount({ lovelace: 100_000_000n });
  const member = generateEmulatorAccount({ lovelace: 100_000_000n });
  // Board accounts only co-sign, but Lucid signs by private key, which a
  // seed-phrase account does not expose.
  const board = [0, 1, 2].map(() =>
    generateEmulatorAccountFromPrivateKey({ lovelace: 100_000_000n }),
  );
  const emulator = new Emulator([deployer, kycIssuer, bankIssuer, member, ...board]);
  const lucid = await Lucid(emulator, "Custom");
  lucid.selectWallet.fromSeed(deployer.seedPhrase);
  const actors = { deployer, kycIssuer, bankIssuer, member };
  // The emulator-derived slot mapping is fixed when Lucid is constructed.
  const slotConfig = lucid.newTx().rawConfig().lucidConfig.slotConfig;
  return { emulator, lucid, actors, board, roles: testRoles(actors, board), slotConfig };
}

export function selectActor(ledger: Ledger, actor: keyof Actors): void {
  ledger.lucid.selectWallet.fromSeed(ledger.actors[actor].seedPhrase);
}

/**
 * A validator sees the lower bound as the start of the enclosing slot, not the
 * wall-clock value passed to `validFrom`. Datums pinned to the bound use this.
 */
export function scriptTime(ledger: Ledger, unixTime: number): number {
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

export function governanceScript(stateNftPolicy: string): Script {
  return {
    type: "PlutusV3",
    script: applyParamsToScript(
      compiledValidator("governance.governance.mint").compiledCode,
      [castTo(stateNftPolicy, Data.Bytes())],
    ),
  };
}

export function ballotScript(stateNftPolicy: string): Script {
  return {
    type: "PlutusV3",
    script: applyParamsToScript(
      compiledValidator("ballot.ballot.mint").compiledCode,
      [castTo(stateNftPolicy, Data.Bytes())],
    ),
  };
}

/**
 * The treasury (ADR 0010 §1). The script is parameterized by the state NFT
 * policy, so a rule change moves its hash and every derived address follows.
 */
function treasuryScript(stateNftPolicy: string): Script {
  return {
    type: "PlutusV3",
    script: applyParamsToScript(
      compiledValidator("treasury.treasury.spend").compiledCode,
      [castTo(stateNftPolicy, Data.Bytes())],
    ),
  };
}

export function stateUnit(stateNftPolicy: string): string {
  return stateNftPolicy + Buffer.from(STATE_ASSET_NAME).toString("hex");
}

export function poolUnit(stateNftPolicy: string): string {
  return stateNftPolicy + Buffer.from(POOL_ASSET_NAME).toString("hex");
}

const credential = Data.Object({ VerificationKey: Data.Bytes() });

export const configDatumSchema = Data.Object({
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
  governance_policy: Data.Bytes(),
  ballot_policy: Data.Bytes(),
  quorum_bps: Data.Integer(),
  project_threshold_bps: Data.Integer(),
  structural_threshold_bps: Data.Integer(),
  timelock_days: Data.Integer(),
  voting_days: Data.Integer(),
  reveal_days: Data.Integer(),
});

/** Field order mirrors `contracts/lib/sequoia/types.ak`. */
export type PolicyHashes = {
  membership: string;
  kyc: string;
  bank: string;
  governance: string;
  ballot: string;
};

export function configDatumFields(
  roles: Roles,
  config: TestConfig,
  policies: PolicyHashes,
) {
  return {
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
    governance_policy: policies.governance,
    ballot_policy: policies.ballot,
    quorum_bps: config.quorumBps,
    project_threshold_bps: config.projectThresholdBps,
    structural_threshold_bps: config.structuralThresholdBps,
    timelock_days: config.timelockDays,
    voting_days: config.votingDays,
    reveal_days: config.revealDays,
  };
}

/** The policy ids a genesis run fixed, in datum field order. */
export function policyHashes(m1: Genesis): PolicyHashes {
  return {
    membership: m1.membershipPolicy,
    kyc: m1.kycPolicy,
    bank: m1.bankPolicy,
    governance: m1.governancePolicy,
    ballot: m1.ballotPolicy,
  };
}

export function configDatum(
  roles: Roles,
  config: TestConfig,
  policies: PolicyHashes,
) {
  return encode(configDatumFields(roles, config, policies), configDatumSchema);
}

const poolDatumSchema = Data.Object({
  balance: Data.Integer(),
  committed: Data.Integer(),
});

/** The pool opens empty: the first attestation funds it (ADR 0010 §8). */
export function poolDatum(balance: bigint, committed: bigint): string {
  return encode({ balance, committed }, poolDatumSchema);
}

/**
 * Creates the one-shot seed and resolves it by transaction hash. The wallet's
 * other UTxOs are unordered and shared with later tests, so they are not a seed.
 */
export async function createSeed(ledger: Ledger): Promise<UTxO> {
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
  membershipAddress: string;
  kycValidator: Script;
  kycPolicy: string;
  kycAddress: string;
  bankValidator: Script;
  bankPolicy: string;
  bankAddress: string;
  governanceValidator: Script;
  governancePolicy: string;
  governanceAddress: string;
  /** Reference-script UTxOs (CIP-33) so heavy validators leave the tx body. */
  governanceScriptRef: UTxO;
  ballotValidator: Script;
  ballotPolicy: string;
  ballotAddress: string;
  ballotScriptRef: UTxO;
  treasuryValidator: Script;
  treasuryPolicy: string;
  treasuryAddress: string;
  configDatum: string;
  configUtxo: UTxO;
  poolDatum: string;
  poolUtxo: UTxO;
};

/**
 * One transaction: spend the seed, mint one STATE and one POOL, create the
 * config box and the pool box. Not a board action — genesis is
 * deployer-trusted (ADR 0008 §5, ADR 0010 §8).
 */
export async function genesis(
  ledger: Ledger,
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
  const membershipAddress = validatorToAddress("Custom", membershipValidator);
  const kycValidator = kycScript(stateNftPolicy);
  const kycPolicy = validatorToScriptHash(kycValidator);
  const kycAddress = validatorToAddress("Custom", kycValidator);
  const bankValidator = bankScript();
  const bankPolicy = validatorToScriptHash(bankValidator);
  const bankAddress = validatorToAddress("Custom", bankValidator);
  const governanceValidator = governanceScript(stateNftPolicy);
  const governancePolicy = validatorToScriptHash(governanceValidator);
  const governanceAddress = validatorToAddress("Custom", governanceValidator);
  const ballotValidator = ballotScript(stateNftPolicy);
  const ballotPolicy = validatorToScriptHash(ballotValidator);
  const ballotAddress = validatorToAddress("Custom", ballotValidator);
  const treasuryValidator = treasuryScript(stateNftPolicy);
  const treasuryPolicy = validatorToScriptHash(treasuryValidator);
  const treasuryAddress = validatorToAddress("Custom", treasuryValidator);
  const config_datum = configDatum(roles, config, {
    membership: membershipPolicy,
    kyc: kycPolicy,
    bank: bankPolicy,
    governance: governancePolicy,
    ballot: ballotPolicy,
  });
  const unit = stateUnit(stateNftPolicy);
  const pool_datum = poolDatum(0n, 0n);
  // Reference scripts are read-only inputs, so they live at an address no wallet
  // controls: coin selection can never spend them and drop the script.
  const referenceAddress = credentialToAddress("Custom", {
    type: "Script",
    hash: "00".repeat(28),
  });

  const tx = await lucid
    .newTx()
    .collectFrom([seed])
    .attach.MintingPolicy(stateNft)
    .mintAssets(
      { [unit]: 1n, [poolUnit(stateNftPolicy)]: 1n },
      Data.void(),
    )
    .pay.ToAddressWithData(
      configAddress,
      { kind: "inline", value: config_datum },
      { lovelace: CONFIG_MIN_LOVELACE, [unit]: 1n },
    )
    .pay.ToAddressWithData(
      treasuryAddress,
      { kind: "inline", value: pool_datum },
      { lovelace: POOL_MIN_LOVELACE, [poolUnit(stateNftPolicy)]: 1n },
    )
    .pay.ToAddressWithData(
      referenceAddress,
      undefined,
      { lovelace: 50_000_000n },
      governanceValidator,
    )
    .pay.ToAddressWithData(
      referenceAddress,
      undefined,
      { lovelace: 30_000_000n },
      ballotValidator,
    )
    .complete();
  await submitTx(tx);
  emulator.awaitBlock(1);

  const configUtxo = await lucid.utxoByUnit(unit);
  const poolUtxo = await lucid.utxoByUnit(poolUnit(stateNftPolicy));
  const scriptRefs = (await lucid.utxosAt(referenceAddress)).filter(
    (utxo) => utxo.scriptRef,
  );
  const scriptRef = (validator: Script): UTxO => {
    const found = scriptRefs.find(
      (utxo) => (utxo.scriptRef as Script).script === validator.script,
    );
    if (found === undefined) {
      throw new Error("genesis: missing reference-script UTxO");
    }
    return found;
  };
  return {
    seed,
    stateNft,
    stateNftPolicy,
    configValidator,
    configAddress,
    membershipValidator,
    membershipPolicy,
    membershipAddress,
    kycValidator,
    kycPolicy,
    kycAddress,
    bankValidator,
    bankPolicy,
    bankAddress,
    governanceValidator,
    governancePolicy,
    governanceAddress,
    governanceScriptRef: scriptRef(governanceValidator),
    ballotValidator,
    ballotPolicy,
    ballotAddress,
    ballotScriptRef: scriptRef(ballotValidator),
    treasuryValidator,
    treasuryPolicy,
    treasuryAddress,
    configDatum: config_datum,
    configUtxo,
    poolDatum: pool_datum,
    poolUtxo,
  };
}

export async function submitTx(tx: TxSignBuilder): Promise<string> {
  return (await tx.sign.withWallet().complete()).submit();
}

/// The selected wallet signs, plus the first `boardSigners` board accounts.
export async function submitWithBoard(
  tx: TxSignBuilder,
  ledger: Ledger,
  boardSigners: number,
): Promise<string> {
  const signed = ledger.board
    .slice(0, boardSigners)
    .reduce(
      (builder, account) => builder.sign.withPrivateKey(account.privateKey),
      tx.sign.withWallet(),
    );
  return (await signed.complete()).submit();
}

// Constructor order of `MembershipRedeemer` in `contracts/lib/sequoia/types.ak`.
export const membershipRedeemer = (index: number) =>
  Data.to(new Constr(index, []));

/** Runs a transaction builder and returns the rejection, or fails the test. */
export async function expectRejected(build: () => Promise<unknown>): Promise<unknown> {
  try {
    await build();
  } catch (error) {
    return error;
  }
  throw new Error("expected the transaction to be rejected");
}
