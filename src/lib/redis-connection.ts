import IORedis from "ioredis";
import { getEnv } from "./get-env";
const { REDIS_URL, REDIS_HOST, REDIS_PASS, REDIS_USERNAME, REDIS_PORT, REDIS_DB, NODE_ENV } =
  getEnv(["REDIS_URL", "REDIS_HOST", "REDIS_PASS", "REDIS_USERNAME", "REDIS_PORT", "REDIS_DB", "NODE_ENV"]);

const commonOptions = {
  maxRetriesPerRequest: null,
  connectTimeout: 10000,
  lazyConnect: false,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
};

// Never log the url raw: a managed provider's url carries the password.
const redact = function (url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username ? "***:***@" : ""}${parsed.hostname}:${parsed.port || "6379"}`;
  } catch {
    return "<unparseable REDIS_URL>";
  }
};

// REDIS_URL wins deliberately: only a url can enable TLS (rediss://), and it stops a
// stray NODE_ENV=development from pointing production at localhost.
const buildConnection = function () {
  if (REDIS_URL) {
    console.log(`🔧 Redis config: REDIS_URL -> ${redact(REDIS_URL)}`);
    return new IORedis(REDIS_URL, commonOptions);
  }

  if (NODE_ENV === "development") {
    console.log("🔧 Redis config: development default -> redis://localhost:6379");
    return new IORedis({ host: "localhost", port: 6379, ...commonOptions });
  }

  // ioredis resolves an undefined host to 127.0.0.1, which looks exactly like Redis being down.
  if (!REDIS_HOST) {
    console.error("❌ Neither REDIS_URL nor REDIS_HOST is set. Redis will be dialled at 127.0.0.1:6379 and will fail.");
    console.error(`   NODE_ENV=${NODE_ENV ?? "<unset>"}. Set REDIS_URL on this service and redeploy.`);
  }

  console.log(`🔧 Redis config: discrete fields -> ${REDIS_HOST ?? "<unset>"}:${REDIS_PORT ?? 6379}`);

  return new IORedis({
    host: REDIS_HOST,
    port: Number(REDIS_PORT ?? 6379),
    ...(REDIS_USERNAME && { username: REDIS_USERNAME }),
    ...(REDIS_PASS && { password: REDIS_PASS }),
    ...(REDIS_DB && { db: Number(REDIS_DB) }),
    ...commonOptions,
  });
};

export const redis = buildConnection();

let lastErrorLogTime = 0;
const ERROR_LOG_INTERVAL = 30_000;

redis.on("error", err => {
  const now = Date.now();
  if (now - lastErrorLogTime > ERROR_LOG_INTERVAL) {
    const code = (err as NodeJS.ErrnoException).code;
    console.error(`❌ Redis connection error [${code ?? "no code"}]:`, err.message);
    console.error(`   Target: ${redis.options.host}:${redis.options.port}`);
    console.warn("⚠️  Email queueing will not work until Redis is available.");
    lastErrorLogTime = now;
  }
});

redis.on("connect", () => {
  console.log("✅ Redis connected successfully");
  lastErrorLogTime = 0;
});

redis.on("ready", () => {
  console.log("✅ Redis ready to accept commands");
});

export const checkRedisHealth = async function () {
  try {
    const reply = await redis.ping();

    if (reply !== "PONG") throw new Error(`Unexpected PING reply: ${reply}`);

    console.log("✅ Redis health check passed");
    return true;
  } catch (error) {
    console.error("❌ Redis health check FAILED:", error instanceof Error ? error.message : error);
    console.error("   OTP verification, password reset, and rate limiting will not work.");
    return false;
  }
};
