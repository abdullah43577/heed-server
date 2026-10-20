import { Router } from "express";
import { BacklogRunController } from "../controllers/backlog-run.controller";
import { validateAccessToken } from "../lib/validate-token";

const router = Router();
const backlogRunController = new BacklogRunController();

router.use(validateAccessToken);

router.post("/", backlogRunController.start.bind(backlogRunController));
router.get("/", backlogRunController.getRuns.bind(backlogRunController));
router.get("/:id", backlogRunController.getRun.bind(backlogRunController));
router.post("/:id/apply", backlogRunController.apply.bind(backlogRunController));
router.post("/:id/cancel", backlogRunController.cancel.bind(backlogRunController));

export { router as backlogRunRouter };
