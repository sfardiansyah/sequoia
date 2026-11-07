import blueprint from "../../../contracts/plutus.json";

export type CompiledValidator = {
  title: string;
  compiledCode: string;
  hash: string;
};

const validators = blueprint.validators as CompiledValidator[];

/**
 * Reads one validator out of the committed Aiken blueprint. `plutus.json` is
 * the only interface the off-chain builders use (ADR 0008 §11).
 */
export function compiledValidator(title: string): CompiledValidator {
  const validator = validators.find((entry) => entry.title === title);
  if (validator === undefined) {
    throw new Error(`Blueprint has no validator ${title}`);
  }
  return validator;
}
