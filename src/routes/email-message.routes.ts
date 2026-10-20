import { Router } from "express";
import { EmailMessageController } from "../controllers/email-message.controller";
import { ReplyDraftController } from "../controllers/reply-draft.controller";
import { validateAccessToken } from "../lib/validate-token";

const router = Router();
const emailMessageController = new EmailMessageController();
const replyDraftController = new ReplyDraftController();

router.use(validateAccessToken);

router.get("/", emailMessageController.getMessages.bind(emailMessageController));
router.get("/:id", emailMessageController.getMessage.bind(emailMessageController));
router.post("/:id/undo", emailMessageController.undoMarkRead.bind(emailMessageController));
router.post("/:id/dismiss", emailMessageController.dismissReply.bind(emailMessageController));
router.post("/:id/draft", replyDraftController.createForMessage.bind(replyDraftController));

export { router as emailMessageRouter };
