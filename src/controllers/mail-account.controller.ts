import { type Response } from "express";
import type { IUserRequest } from "../interface";
import { AppError, OAuthCallbackError } from "../lib/errors";
import { getEnv } from "../lib/get-env";
import { handleErrors } from "../lib/handle-errors";
import { oauthReturnPage } from "../lib/templates/oauth-return";
import { connectMailAccountSchema, oauthCallbackQuerySchema } from "../schemas/mail-account";
import { MailAccountService } from "../services/mail-account.service";

const APP_CALLBACK_URL = getEnv("APP_CALLBACK_URL") ?? "heed://oauth/callback";

const appUrl = (base: string | undefined, params: Record<string, string>) =>
  `${base ?? APP_CALLBACK_URL}?${new URLSearchParams(params).toString()}`;

export class MailAccountController {
  private mailAccountService = new MailAccountService();

  async getAccounts(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const accounts = await this.mailAccountService.getAccounts(userId!);
      res.status(200).json({ message: "Mail accounts fetched successfully!", data: accounts });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async connect(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { loginHint, returnUrl } = connectMailAccountSchema.parse(req.body ?? {});

      const data = await this.mailAccountService.startConnect(userId!, {
        ...(loginHint && { loginHint }),
        ...(returnUrl && { returnUrl }),
      });
      res.status(200).json({ message: "Continue in the browser", data });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async oauthCallback(req: IUserRequest, res: Response) {
    try {
      const query = oauthCallbackQuerySchema.parse(req.query);
      const { email, returnUrl } = await this.mailAccountService.completeConnect({
        ...(query.code && { code: query.code }),
        ...(query.state && { state: query.state }),
        ...(query.error && { error: query.error }),
      });

      res.status(200).type("html").send(oauthReturnPage(appUrl(returnUrl, { status: "connected", email }), true));
    } catch (error) {
      const code = error instanceof AppError && error.code ? error.code : "OAUTH_FAILED";
      const returnUrl = error instanceof OAuthCallbackError ? error.returnUrl : undefined;

      res.status(200).type("html").send(oauthReturnPage(appUrl(returnUrl, { status: "error", code }), false));
    }
  }

  async disconnect(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      await this.mailAccountService.disconnect(id as string, userId!);
      res.status(204).json({ message: "Mail account disconnected" });
    } catch (error) {
      handleErrors({ res, error });
    }
  }
}
