import { Router } from "express";
import { AskController } from "../controllers/ask.controller";
import { validateAccessToken } from "../lib/validate-token";

const router = Router();
const askController = new AskController();

router.use(validateAccessToken);

router.get("/conversations", askController.getConversations.bind(askController));
router.post("/conversations", askController.startConversation.bind(askController));
router.get("/conversations/:id", askController.getConversation.bind(askController));
router.delete("/conversations/:id", askController.deleteConversation.bind(askController));
router.post("/conversations/:id/questions", askController.addQuestion.bind(askController));
router.get("/conversations/:id/answer", askController.streamAnswer.bind(askController));

export { router as askRouter };
