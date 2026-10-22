import { z } from "zod";

export const askQuestionSchema = z.object({
  question: z.string().trim().min(2, "Ask a question").max(500, "Keep the question under 500 characters"),
});

export type AskQuestion = z.infer<typeof askQuestionSchema>;
