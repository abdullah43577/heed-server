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

// null, or an empty note, clears it: drafts go back to the default voice.
export const updateMailAccountSchema = z.object({
  styleNote: z
    .string()
    .trim()
    .max(MAX_STYLE_NOTE_CHARS, "Keep the style note short")
    .transform(value => value || null)
    .nullable(),
});
