import "dotenv/config";
import express, { type Application, type Request } from "express";
import helmet from "helmet";
import morgan from "morgan";

// EventSource cannot set headers, so Ask streams carry the access token in the query; keep it out of the logs.
morgan.token("url", req => ((req as Request).originalUrl ?? req.url ?? "").replace(/([?&]token=)[^&]*/, "$1[redacted]"));

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
