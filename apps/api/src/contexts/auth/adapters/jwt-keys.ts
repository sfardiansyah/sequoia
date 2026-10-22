import { calculateJwkThumbprint, exportJWK, importPKCS8 } from "jose";
import type { CryptoKey } from "jose";
import type { JwtPublicKey } from "../types";

export type JwtSigningKey = {
  readonly kid: string;
  readonly privateKey: CryptoKey;
  readonly publicKey: JwtPublicKey;
};

export type JwtKeySet = {
  readonly active: JwtSigningKey;
  readonly all: readonly JwtSigningKey[];
};

// Keys are base64-encoded PKCS#8 Ed25519 keys, comma-separated. The last key
// signs; every key verifies, so a new key can be appended before retiring one.
export async function loadJwtKeys(raw: string | undefined): Promise<JwtKeySet> {
  const entries = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new Error(
      "JWT_PRIVATE_KEYS must contain at least one base64-encoded PKCS#8 Ed25519 key",
    );
  }

  const keys: JwtSigningKey[] = [];

  for (const [index, entry] of entries.entries()) {
    try {
      const pem = Buffer.from(entry, "base64").toString("utf8");
      const privateKey = await importPKCS8(pem, "EdDSA", {
        extractable: true,
      });

      const jwk = await exportJWK(privateKey);
      if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.x) {
        throw new Error("not an Ed25519 key");
      }

      const kid = await calculateJwkThumbprint(
        { kty: "OKP", crv: "Ed25519", x: jwk.x },
        "sha256",
      );

      if (keys.some((key) => key.kid === kid)) {
        throw new Error(`duplicate key ${kid}`);
      }

      keys.push({
        kid,
        privateKey,
        publicKey: {
          kty: "OKP",
          crv: "Ed25519",
          x: jwk.x,
          kid,
          alg: "EdDSA",
          use: "sig",
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JWT key ${index + 1}: ${reason}`);
    }
  }

  const active = keys[keys.length - 1];
  if (!active) throw new Error("JWT_PRIVATE_KEYS must contain a key");

  return { active, all: keys };
}
