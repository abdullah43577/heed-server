import z from "zod";

export const updateProfileSchema = z.object({
  first_name: z.string().trim().min(2, "First name must be at least 2 characters").optional(),
  last_name: z.string().trim().min(2, "Last name must be at least 2 characters").optional(),
});

export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export const updateSettingsSchema = z.object({
  theme: z.enum(["SYSTEM", "LIGHT", "DARK"]).optional(),
  notifications: z.boolean().optional(),
});

export type UpdateSettings = z.infer<typeof updateSettingsSchema>;
