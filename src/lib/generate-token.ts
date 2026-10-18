import "dotenv/config";
const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, GOOGLE_VERIFICATION_TOKEN } = getEnv(["ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET", "GOOGLE_VERIFICATION_TOKEN"]);
import jwt, { type Secret } from "jsonwebtoken";
import { getEnv } from "./get-env";

type Payload = {
  id: string;
};

export const generateAccessToken = (dataObj: Payload) => {
  return jwt.sign(dataObj, ACCESS_TOKEN_SECRET as Secret, { expiresIn: "30m" });
};

export const generateRefreshToken = (dataObj: Payload) => {
  return jwt.sign(dataObj, REFRESH_TOKEN_SECRET as Secret, { expiresIn: "7d" });
};

export const generateGoogleVerificationToken = (dataObj: Payload) => {
  return jwt.sign(dataObj, GOOGLE_VERIFICATION_TOKEN as Secret, { expiresIn: "2m" });
};
