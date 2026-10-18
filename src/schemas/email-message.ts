import { z } from "zod";

export const getMessagesQuerySchema = z.object({
  view: z.enum(["handled", "review"]).default("handled"),
  since: z.iso.datetime({ offset: true }).transform(value => new Date(value)).optional(),
});
