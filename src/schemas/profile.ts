import z from "zod";
import { isValidTimeZone } from "../lib/timezone";

export const updateProfileSchema = z.object({
  first_name: z.string().trim().min(2, "First name must be at least 2 characters").optional(),
  last_name: z.string().trim().min(2, "Last name must be at least 2 characters").optional(),
});

export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export const updateSettingsSchema = z.object({
  theme: z.enum(["SYSTEM", "LIGHT", "DARK"]).optional(),
  notifications: z.boolean().optional(),
  reportTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 18:00")
    .optional(),
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone").optional(),
});

export type UpdateSettings = z.infer<typeof updateSettingsSchema>;
