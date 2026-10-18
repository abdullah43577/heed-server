import "dotenv/config";
import express, { type Application } from "express";
import helmet from "helmet";
import morgan from "morgan";

export const configureApp = (app: Application) => {
  app.use(morgan("dev"));
  app.use(
    express.json({
      limit: "10mb",
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: "10mb" }));
  app.use(helmet());
};
