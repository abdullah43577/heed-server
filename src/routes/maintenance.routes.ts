import { Router } from "express";
import { MaintenanceController } from "../controllers/maintenance.controller";

const router = Router();
const maintenanceController = new MaintenanceController();

// Not behind validateAccessToken: driven by a platform cron, guarded by CRON_SECRET.
router.post("/sync", maintenanceController.runMailSync.bind(maintenanceController));
router.post("/reports", maintenanceController.runReportSweep.bind(maintenanceController));
router.post("/retention", maintenanceController.runRetention.bind(maintenanceController));
router.post("/backlog", maintenanceController.runBacklogStep.bind(maintenanceController));

export { router as maintenanceRouter };
