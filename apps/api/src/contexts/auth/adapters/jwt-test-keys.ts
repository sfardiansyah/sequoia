import { exportPKCS8, generateKeyPair } from "jose";

export async function newJwtPrivateKey(): Promise<string> {
  const { privateKey } = await generateKeyPair("EdDSA", { extractable: true });
  return Buffer.from(await exportPKCS8(privateKey)).toString("base64");
}
