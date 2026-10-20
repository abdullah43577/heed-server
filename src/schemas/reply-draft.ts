import { z } from "zod";

const body = z.string().max(10000, "That reply is too long");

export const updateDraftSchema = z.object({
  body: body.optional(),
  replyAll: z.boolean().optional(),
});

export type UpdateDraft = z.infer<typeof updateDraftSchema>;

export const rewriteDraftSchema = z
  .object({
    preset: z.enum(["shorter", "warmer", "formal", "decline"]).optional(),
    instruction: z.string().trim().min(2, "Say how to change it").max(200, "Keep the instruction short").optional(),
    body: body.optional(),
  })
  .refine(data => !!data.preset !== !!data.instruction, "Choose a quick change or write an instruction");

export type RewriteDraft = z.infer<typeof rewriteDraftSchema>;

export const sendDraftSchema = z.object({
  body,
  replyAll: z.boolean(),
});

export type SendDraft = z.infer<typeof sendDraftSchema>;
