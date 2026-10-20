import { z } from "zod";
import { MAX_STYLE_NOTE_CHARS } from "../lib/drafting/style-prompt";

// heed:// in a real build, exp:// in Expo Go. Anything else would make the callback an open redirect.
const APP_RETURN_URL = /^(heed|exps?):\/\/\S+$/;

export const connectMailAccountSchema = z.object({
  loginHint: z.email().optional(),
  returnUrl: z.string().regex(APP_RETURN_URL, "Unsupported return url").optional(),
});

export const oauthCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

const MAX_INSTRUCTION_CHARS = 500;

// Either field can be sent alone; null, or empty text, clears it.
const clearable = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform(value => value || null)
    .nullable()
    .optional();

export const updateMailAccountSchema = z
  .object({
    styleNote: clearable(MAX_STYLE_NOTE_CHARS, "Keep the style note short"),
    instruction: clearable(MAX_INSTRUCTION_CHARS, "Keep the instruction under 500 characters"),
  })
  .refine(data => data.styleNote !== undefined || data.instruction !== undefined, "Nothing to update");

export type UpdateMailAccount = z.infer<typeof updateMailAccountSchema>;
