import { Router } from "express";
import { SenderRuleController } from "../controllers/sender-rule.controller";
import { validateAccessToken } from "../lib/validate-token";

const router = Router();
const senderRuleController = new SenderRuleController();

router.use(validateAccessToken);

router.get("/", senderRuleController.getRules.bind(senderRuleController));
router.post("/", senderRuleController.createRule.bind(senderRuleController));
router.delete("/:id", senderRuleController.deleteRule.bind(senderRuleController));

export { router as senderRuleRouter };
