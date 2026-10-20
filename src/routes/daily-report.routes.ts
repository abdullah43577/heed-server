import { Router } from "express";
import { DailyReportController } from "../controllers/daily-report.controller";
import { validateAccessToken } from "../lib/validate-token";

const router = Router();
const dailyReportController = new DailyReportController();

router.use(validateAccessToken);

router.get("/", dailyReportController.getReports.bind(dailyReportController));
router.get("/:id", dailyReportController.getReport.bind(dailyReportController));

export { router as dailyReportRouter };
