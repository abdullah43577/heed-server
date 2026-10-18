import { type NextFunction, type Request, type Response } from "express";
const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = getEnv(["ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET"]);
import jwt, { type Secret } from "jsonwebtoken";
import type { CustomJwtPayload, IUserRequest } from "../interface";
import { handleErrors } from "./handle-errors";
import { getEnv } from "./get-env";
import { UnauthorizedError } from "./errors";

const validateAccessToken = function (req: IUserRequest, res: Response, next: NextFunction) {
  let token = req.headers["authorization"]?.split(" ")[1];

  if (!token && req.query) {
    token = req.query.token as string;
  }

  if (!token) throw new UnauthorizedError("Access Denied, No token provided!");

  try {
    const { id } = jwt.verify(token, ACCESS_TOKEN_SECRET as Secret) as CustomJwtPayload;
    req.userId = id;
    next();
  } catch (error) {
    handleErrors({ res, error });
  }
};

const validateRefreshToken = function (req: IUserRequest, res: Response, next: NextFunction) {
  try {
    let refreshToken = req.body.refreshToken;

    if (!refreshToken) throw new UnauthorizedError("Access Denied, Refresh token not provided!");

    const { id } = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET as Secret) as CustomJwtPayload;
    req.userId = id;
    next();
  } catch (error) {
    handleErrors({ res, error });
  }
};

export { validateAccessToken, validateRefreshToken };
