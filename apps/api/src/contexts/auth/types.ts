import type { UnexpectedError } from "../../shared/errors";

export type AuthError =
  | { readonly code: "INVALID_NONCE" }
  | { readonly code: "INVALID_SIGNATURE" }
  | { readonly code: "UNAUTHORIZED" }
  | UnexpectedError;

export type AuthChallenge = {
  readonly nonce: string;
  readonly payload: string;
  readonly expiresAt: number;
};

export type WalletSignature = {
  readonly address: string;
  readonly nonce: string;
  readonly signature: string;
  readonly key: string;
};

export interface WalletVerifier {
  verify(input: WalletSignature): boolean;
  publicKeyHash(key: string): string;
}

export interface NonceStore {
  create(input: {
    nonce: string;
    address: string;
    expiresAt: number;
  }): Promise<void>;
  consume(input: {
    nonce: string;
    address: string;
    now: number;
  }): Promise<boolean>;
}

export interface TokenService {
  sign(pkh: string): Promise<string>;
  verify(token: string): Promise<{ pkh: string } | null>;
}

export type JwtPublicKey = {
  readonly kty: "OKP";
  readonly crv: "Ed25519";
  readonly x: string;
  readonly kid: string;
  readonly alg: "EdDSA";
  readonly use: "sig";
};

export interface JwksProvider {
  jwks(): Promise<{ keys: readonly JwtPublicKey[] }>;
}
