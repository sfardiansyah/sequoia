import verifyDataSignature from "@cardano-foundation/cardano-verify-datasignature";
import { getPublicKeyFromCoseKey } from "@stricahq/cip08";
import { blake2bHex } from "blakejs";
import type { WalletSignature, WalletVerifier } from "../types";

export class CardanoWalletVerifier implements WalletVerifier {
  verify(input: WalletSignature): boolean {
    return verifyDataSignature(
      input.signature,
      input.key,
      input.nonce,
      input.address,
    );
  }

  publicKeyHash(key: string): string {
    return blake2bHex(getPublicKeyFromCoseKey(key), undefined, 28);
  }
}
