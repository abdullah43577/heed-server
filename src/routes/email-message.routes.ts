import { Router } from "express";
import { EmailMessageController } from "../controllers/email-message.controller";
import { validateAccessToken } from "../lib/validate-token";

const router = Router();
const emailMessageController = new EmailMessageController();

router.use(validateAccessToken);

router.get("/", emailMessageController.getMessages.bind(emailMessageController));

export { router as emailMessageRouter };
