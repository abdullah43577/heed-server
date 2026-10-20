import { Router } from "express";
import { MailAccountController } from "../controllers/mail-account.controller";
import { validateAccessToken } from "../lib/validate-token";

const router = Router();
const mailAccountController = new MailAccountController();

// Google sends the user's browser here, so it carries no access token.
router.get("/oauth/callback", mailAccountController.oauthCallback.bind(mailAccountController));

router.use(validateAccessToken);

router.get("/", mailAccountController.getAccounts.bind(mailAccountController));
router.post("/connect", mailAccountController.connect.bind(mailAccountController));
router.patch("/:id", mailAccountController.update.bind(mailAccountController));
router.post("/:id/learn-style", mailAccountController.learnStyle.bind(mailAccountController));
router.delete("/:id", mailAccountController.disconnect.bind(mailAccountController));

export { router as mailAccountRouter };
