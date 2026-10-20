export type AppEnvironment = "development" | "test" | "production";

export type AppConfig = {
  readonly serviceName: string;
  readonly version: string;
  readonly environment: AppEnvironment;
  readonly port: number;
};

const ENVIRONMENTS: readonly AppEnvironment[] = [
  "development",
  "test",
  "production",
];

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const environment = env.NODE_ENV ?? "development";

  if (!ENVIRONMENTS.includes(environment as AppEnvironment)) {
    throw new Error(`NODE_ENV must be one of: ${ENVIRONMENTS.join(", ")}`);
  }

  const port = Number(env.PORT ?? "3000");

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return {
    serviceName: "coop-api",
    version: "0.1.0",
    environment: environment as AppEnvironment,
    port,
  };
}
