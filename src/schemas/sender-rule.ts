import { z } from "zod";

export const createSenderRuleSchema = z.object({
  pattern: z.union([z.email(), z.string().regex(/^@[a-z0-9.-]+\.[a-z]{2,}$/i, "Use an address or @domain")]),
  kind: z.enum(["ALWAYS_LEAVE", "ALWAYS_HANDLE", "NEVER_DRAFT"]),
  // Left out (or null) applies the rule to every connected account.
  mailAccountId: z.string().min(1).nullable().optional(),
});

export type CreateSenderRule = z.infer<typeof createSenderRuleSchema>;

export const getSenderRulesQuerySchema = z.object({
  mailAccountId: z.string().min(1).optional(),
});
