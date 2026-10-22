import { type Response } from "express";
import type { IUserRequest } from "../interface";
import { AppError } from "../lib/errors";
import { handleErrors } from "../lib/handle-errors";
import { askQuestionSchema } from "../schemas/ask";
import { AskService } from "../services/ask.service";
import { SSEHelper } from "../services/sse.service";

export class AskController {
  private askService = new AskService();

  async getConversations(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;

      const conversations = await this.askService.getConversations(userId!);
      res.status(200).json({ message: "Conversations fetched successfully!", data: conversations });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async getConversation(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      const conversation = await this.askService.getConversation(id as string, userId!);
      res.status(200).json({ message: "Conversation fetched successfully!", data: conversation });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async startConversation(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const data = askQuestionSchema.parse(req.body);

      const conversation = await this.askService.startConversation(userId!, data);
      res.status(201).json({ message: "Question asked", data: conversation });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async addQuestion(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;
      const data = askQuestionSchema.parse(req.body);

      const conversation = await this.askService.addQuestion(id as string, userId!, data);
      res.status(201).json({ message: "Question asked", data: conversation });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async deleteConversation(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      await this.askService.deleteConversation(id as string, userId!);
      res.status(200).json({ message: "Conversation deleted", data: null });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async streamAnswer(req: IUserRequest, res: Response) {
    const { userId } = req;
    const { id } = req.params;

    // Refused before SSEHelper flushes the headers, so a refusal keeps its real status
    // instead of a 200 carrying an error event.
    let prepared;
    try {
      prepared = await this.askService.prepareAnswer(id as string, userId!);
    } catch (error) {
      return handleErrors({ res, error });
    }

    const sse = new SSEHelper(res);
    let isStreaming = true;
    let streamed = "";
    sse.onDisconnect(() => {
      isStreaming = false;
    });

    // Keeps going after a disconnect on purpose: the answer is saved and shows when the user returns.
    try {
      const message = await this.askService.answer(prepared, {
        onStatus: status => {
          if (isStreaming) sse.send({ status });
        },
        onChunk: chunk => {
          streamed += chunk;
          if (isStreaming) sse.sendChunk(chunk, streamed);
        },
      });
      sse.send({ done: true, message });
      sse.close();
    } catch (error) {
      if (error instanceof AppError) {
        sse.sendError(error.message, error.code);
      } else {
        console.error("[ask] answer failed:", (error as Error).message);
        sse.sendError("Heed couldn't answer that just now. Try again in a moment.");
      }
    } finally {
      await this.askService.releaseAnswer(prepared.conversationId);
    }
  }
}
