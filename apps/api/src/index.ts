import { createApp } from "./app";
import { loadConfig } from "./config";
import { CardanoWalletVerifier } from "./contexts/auth/adapters/cardano-verifier";
import { InMemoryRateLimiter } from "./contexts/auth/adapters/in-memory-rate-limiter";
import { JwtTokenService } from "./contexts/auth/adapters/jwt-token-service";
import { PostgresNonceStore } from "./contexts/auth/adapters/postgres-nonce-store";
import { AuthService } from "./contexts/auth/application/auth-service";
import { createPostgresMemberRepository } from "./contexts/membership/adapters/postgres/postgres-member-repository";

const config = loadConfig();
const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;

if (!databaseUrl || !jwtSecret) {
  throw new Error("DATABASE_URL and JWT_SECRET are required");
}

const { client, repository } = createPostgresMemberRepository(databaseUrl);
const auth = new AuthService(
  repository,
  new CardanoWalletVerifier(),
  new PostgresNonceStore(client),
  new JwtTokenService(jwtSecret),
);
const rateLimiter = new InMemoryRateLimiter(10, 60_000);
const app = createApp(config, { auth, rateLimiter });

app.listen(config.port);
console.log(
  `${config.serviceName} ${config.version} listening on http://localhost:${config.port}`,
);
