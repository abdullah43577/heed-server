import { Router } from "express";
import { ReplyDraftController } from "../controllers/reply-draft.controller";
import { validateAccessToken } from "../lib/validate-token";

const router = Router();
const replyDraftController = new ReplyDraftController();

router.use(validateAccessToken);

router.get("/:id", replyDraftController.getDraft.bind(replyDraftController));
router.patch("/:id", replyDraftController.update.bind(replyDraftController));
router.post("/:id/rewrite", replyDraftController.rewrite.bind(replyDraftController));
router.post("/:id/send", replyDraftController.send.bind(replyDraftController));
router.post("/:id/cancel", replyDraftController.cancelSend.bind(replyDraftController));
router.post("/:id/dismiss", replyDraftController.dismiss.bind(replyDraftController));

export { router as replyDraftRouter };
