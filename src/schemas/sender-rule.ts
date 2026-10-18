import { z } from "zod";

export const createSenderRuleSchema = z.object({
  pattern: z.union([z.email(), z.string().regex(/^@[a-z0-9.-]+\.[a-z]{2,}$/i, "Use an address or @domain")]),
  kind: z.enum(["ALWAYS_LEAVE"]),
});
