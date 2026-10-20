import { type Response } from "express";
import type { IUserRequest } from "../interface";
import { handleErrors } from "../lib/handle-errors";
import { DailyReportService } from "../services/daily-report.service";

export class DailyReportController {
  private dailyReportService = new DailyReportService();

  async getReports(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;

      const reports = await this.dailyReportService.getReports(userId!);
      res.status(200).json({ message: "Reports fetched successfully!", data: reports });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async getReport(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      const report = await this.dailyReportService.getReport(id as string, userId!);
      res.status(200).json({ message: "Report fetched successfully!", data: report });
    } catch (error) {
      handleErrors({ res, error });
    }
  }
}
