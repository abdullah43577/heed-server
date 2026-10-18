import { z } from "zod";

export const getNotificationsQuerySchema = z.object({
  isRead: z
    .enum(["true", "false"])
    .transform(value => value === "true")
    .optional(),
});

export const registerDeviceSchema = z.object({
  deviceToken: z.string().min(1),
  deviceType: z.string().max(20).optional(),
});
