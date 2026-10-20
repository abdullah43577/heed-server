import { type Response } from "express";
import type { IUserRequest } from "../interface";
import { handleErrors } from "../lib/handle-errors";
import { getBacklogRunsQuerySchema, startBacklogRunSchema } from "../schemas/backlog-run";
import { BacklogService } from "../services/backlog.service";

export class BacklogRunController {
  private backlogService = new BacklogService();

  async start(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const data = startBacklogRunSchema.parse(req.body);

      const run = await this.backlogService.start(userId!, data);
      res.status(201).json({ message: "Tidy started", data: run });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async getRuns(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { mailAccountId } = getBacklogRunsQuerySchema.parse(req.query);

      const runs = await this.backlogService.getRuns(userId!, mailAccountId);
      res.status(200).json({ message: "Backlog runs fetched successfully!", data: runs });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async getRun(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      const run = await this.backlogService.getRun(id as string, userId!);
      res.status(200).json({ message: "Backlog run fetched successfully!", data: run });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async apply(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      const run = await this.backlogService.apply(id as string, userId!);
      res.status(200).json({ message: "Marked as read in Gmail", data: run });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async cancel(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      const run = await this.backlogService.cancel(id as string, userId!);
      res.status(200).json({ message: "Tidy cancelled", data: run });
    } catch (error) {
      handleErrors({ res, error });
    }
  }
}
