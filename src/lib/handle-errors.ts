import { ZodError } from "zod";
import { type Response } from "express";
import jwt from "jsonwebtoken";
import { Prisma } from "../generated/prisma/client";
import { AppError } from "./errors";
import { getEnv } from "./get-env";

interface IHandleErrors {
  res: Response;
  error: any;
}

export const handleErrors = function ({ res, error }: IHandleErrors) {
  if (error instanceof jwt.JsonWebTokenError) {
    return res.status(401).json({ message: "Invalid token!" });
  }
  if (error instanceof jwt.TokenExpiredError) {
    return res.status(401).json({ message: "Token has expired!" });
  }

  if (error instanceof ZodError) {
    const errors = error.issues.map(err => ({
      field: err.path.join("."),
      message: err.message,
    }));
    return res.status(400).json({ message: "Validation error", errors });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const field = (error.meta?.target as string[] | undefined)?.[0] ?? "field";
    return res.status(409).json({
      message: "Duplicate entry",
      error: { field, message: `${field} already exists` },
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return res.status(404).json({ message: "Record not found" });
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ message: "Invalid data format", error: error.message });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ message: error.message, ...(error.code && { code: error.code }) });
  }

  console.error("Unhandled error:", error);
  return res.status(500).json({
    message: typeof error === "string" ? error : "Internal Server Error",
    error: getEnv("NODE_ENV") === "development" ? error : undefined,
  });
};
