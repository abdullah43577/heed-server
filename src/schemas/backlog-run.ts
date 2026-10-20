import { z } from "zod";

export const startBacklogRunSchema = z.object({
  mailAccountId: z.string().min(1),
  windowDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
});

export type StartBacklogRun = z.infer<typeof startBacklogRunSchema>;

export const getBacklogRunsQuerySchema = z.object({
  mailAccountId: z.string().min(1).optional(),
});
