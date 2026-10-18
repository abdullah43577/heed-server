import { AiQuotaExceededError, AiUnavailableError } from "./errors";
import { redis } from "./redis-connection";

const DAILY_LIMIT = 50;
const TRIAGE_DAILY_LIMIT = 500;
const KEY_TTL_SECONDS = 2 * 24 * 60 * 60;
// The connection sets maxRetriesPerRequest: null, so a command against a dead
// Redis waits forever. Failing closed needs a deadline of its own.
const REDIS_DEADLINE_MS = 2000;

const today = () => new Date().toISOString().slice(0, 10);

const quotaKey = function (userId: string) {
  return `ai-quota:${userId}:${today()}`;
};

const withDeadline = function <T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Redis deadline exceeded")), REDIS_DEADLINE_MS)),
  ]);
};

// Fails closed, unlike rateLimit: unmetered AI calls during a Redis outage could
// exhaust or get the provider keys banned for every user.
const failClosed = function (error: unknown): never {
  if (error instanceof AiQuotaExceededError) throw error;
  console.error("[ai-quota] Redis unavailable, refusing AI call:", error);
  throw new AiUnavailableError();
};

export const assertAiQuota = async function (userId: string) {
  try {
    const used = Number(await withDeadline(redis.get(quotaKey(userId)))) || 0;
    if (used >= DAILY_LIMIT) throw new AiQuotaExceededError();
  } catch (error) {
    failClosed(error);
  }
};

const consume = async function (key: string, limit: number) {
  try {
    const used = await withDeadline(redis.incr(key));
    if (used === 1) await withDeadline(redis.expire(key, KEY_TTL_SECONDS));
    if (used > limit) throw new AiQuotaExceededError();
  } catch (error) {
    failClosed(error);
  }
};

export const consumeAiQuota = async function (userId: string) {
  await consume(quotaKey(userId), DAILY_LIMIT);
};

// Triage is per email, so it has its own budget: a busy inbox must not spend the user's drafting allowance.
export const consumeTriageQuota = async function (mailAccountId: string) {
  await consume(`triage-quota:${mailAccountId}:${today()}`, TRIAGE_DAILY_LIMIT);
};
