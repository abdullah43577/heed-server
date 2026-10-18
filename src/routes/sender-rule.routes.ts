import { Router } from "express";
import { SenderRuleController } from "../controllers/sender-rule.controller";
import { validateAccessToken } from "../lib/validate-token";

const router = Router();
const senderRuleController = new SenderRuleController();

router.use(validateAccessToken);

router.post("/", senderRuleController.createRule.bind(senderRuleController));

export { router as senderRuleRouter };
