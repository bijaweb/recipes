import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Last-resort error handler. Drizzle's "Failed query" errors put the bound
// parameters (names, journal text, preferences) in the message, and Express's
// default handler would print them to the log. Log the query without its
// params, and never send internal details to the client.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const e = (err ?? {}) as { message?: string; stack?: string; status?: number; statusCode?: number; cause?: { code?: string; message?: string } };
  const scrub = (s?: string) => s?.replace(/\nparams: [\s\S]*?(?=\n {4}at |$)/, "\nparams: [redacted]");
  const status = e.status ?? e.statusCode ?? 500;
  req.log.error(
    { err: { message: scrub(e.message), stack: scrub(e.stack), cause: e.cause && { code: e.cause.code, message: e.cause.message } } },
    "Unhandled error",
  );
  if (res.headersSent) return;
  res.status(status).json({ error: status < 500 && e.message ? e.message : "Internal server error" });
});

export default app;
