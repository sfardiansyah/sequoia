import { rateLimit } from "elysia-rate-limit";
import { errorEnvelope } from "../../../shared/http/error-envelope";

const rateLimited = new Response(
  JSON.stringify(errorEnvelope("RATE_LIMITED", "Too many requests")),
  {
    status: 429,
    headers: { "content-type": "application/json" },
  },
);

export function authRateLimit() {
  return rateLimit({
    duration: 60_000,
    max: 10,
    scoping: "scoped",
    // app.handle() has no server in tests; keep a stable fallback bucket.
    // Separate buckets per route and client address, matching the old limiter.
    generator: (request, server) => {
      const address = server?.requestIP(request)?.address ?? "unknown";
      return `${address}:${new URL(request.url).pathname}`;
    },
    errorResponse: rateLimited,
  });
}
