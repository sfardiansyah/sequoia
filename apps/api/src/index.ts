import { createApp } from "./app";
import { loadConfig } from "./config";
import { CardanoWalletVerifier } from "./contexts/auth/adapters/cardano-verifier";
import { InMemoryRateLimiter } from "./contexts/auth/adapters/in-memory-rate-limiter";
import { loadJwtKeys } from "./contexts/auth/adapters/jwt-keys";
import { JwtTokenService } from "./contexts/auth/adapters/jwt-token-service";
import { PostgresNonceStore } from "./contexts/auth/adapters/postgres-nonce-store";
import { AuthService } from "./contexts/auth/application/auth-service";
import { createPostgresMemberRepository } from "./contexts/membership/adapters/postgres/postgres-member-repository";
import { FindMemberByPkh } from "./contexts/membership/application/find-member";

const config = loadConfig();
const databaseUrl = process.env.DATABASE_URL;
const privateKeys = process.env.JWT_PRIVATE_KEYS;

if (!databaseUrl || !privateKeys) {
  throw new Error("DATABASE_URL and JWT_PRIVATE_KEYS are required");
}

const tokens = new JwtTokenService(await loadJwtKeys(privateKeys));
const { client, repository } = createPostgresMemberRepository(databaseUrl);
const auth = new AuthService(
  new CardanoWalletVerifier(),
  new PostgresNonceStore(client),
  tokens,
);
const rateLimiter = new InMemoryRateLimiter(10, 60_000);
const findMemberByPkh = new FindMemberByPkh(repository);
const app = createApp(config, {
  auth,
  rateLimiter,
  jwks: tokens,
  findMemberByPkh,
});

app.listen(config.port);
console.log(
  `${config.serviceName} ${config.version} listening on http://localhost:${config.port}`,
);
