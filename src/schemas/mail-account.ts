import { z } from "zod";

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
