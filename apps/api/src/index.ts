import { createApp } from "./app";
import { createMembershipContainer } from "./composition/membership";
import { loadConfig } from "./config";
import { CardanoWalletVerifier } from "./contexts/auth/adapters/cardano-verifier";
import { loadJwtKeys } from "./contexts/auth/adapters/jwt-keys";
import { JwtTokenService } from "./contexts/auth/adapters/jwt-token-service";
import { PostgresNonceStore } from "./contexts/auth/adapters/postgres-nonce-store";
import { AuthService } from "./contexts/auth/application/auth-service";

const config = loadConfig();
const databaseUrl = process.env.DATABASE_URL;
const privateKeys = process.env.JWT_PRIVATE_KEYS;

if (!databaseUrl || !privateKeys) {
  throw new Error("DATABASE_URL and JWT_PRIVATE_KEYS are required");
}

const tokens = new JwtTokenService(await loadJwtKeys(privateKeys));
const membership = createMembershipContainer(databaseUrl);
const auth = new AuthService(
  new CardanoWalletVerifier(),
  new PostgresNonceStore(membership.client),
  tokens,
);
const app = createApp(config, {
  auth,
  jwks: tokens,
  memberProfile: membership.memberProfile,
  checkDatabase: membership.checkDatabase,
});

app.listen({ port: config.port, hostname: "0.0.0.0" });
console.log(
  `${config.serviceName} ${config.version} listening on http://localhost:${config.port}`,
);
