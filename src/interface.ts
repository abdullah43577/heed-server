import { type Request } from "express";
import { type JwtPayload } from "jsonwebtoken";

export interface IUserRequest extends Request {
  userId?: string;
  refreshToken?: string;
}

export interface CustomJwtPayload extends JwtPayload {
  id: string;
}
