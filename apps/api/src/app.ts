import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { createCorsOptions } from "./config/cors";
import { env, type ApiEnv } from "./config/env";
import { jsonConsoleLogger, silentLogger, type ApiLogger } from "./logging/logger";
import { createErrorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { privateNoStore, requireJsonContentType } from "./middlewares/http-security.middleware";
import { createRateLimiters } from "./middlewares/rate-limit.middleware";
import { createRequestContextMiddleware } from "./middlewares/request-context.middleware";
import { readinessService, type ReadinessChecker } from "./readiness/readiness.service";
import authRouter from "./modules/auth/auth.routes";
import checkoutRouter from "./modules/checkout/checkout.routes";
import expensesRouter from "./modules/expenses/expenses.routes";
import historyRouter from "./modules/history/history.routes";
import logisticsCatalogRouter from "./modules/logistics-catalog/logistics-catalog.routes";
import ordersRouter from "./modules/orders/orders.routes";
import preparationRouter from "./modules/preparation/preparation.routes";
import servicePointsRouter from "./modules/service-points/service-points.routes";
import serviceSessionsRouter from "./modules/service-points/service-sessions.routes";
import shiftsRouter from "./modules/shifts/shifts.routes";
import transfersRouter from "./modules/transfers/transfers.routes";
import usersRouter from "./modules/users/users.routes";
import categoriesRouter from "./routes/categories.routes";
import { createHealthRouter } from "./routes/health.routes";
import productsRouter from "./routes/products.routes";

export interface CreateAppOptions {
  logger?: ApiLogger;
  configureRoutes?: (app: Express) => void;
  readiness?: ReadinessChecker;
}

export function createApp(config: ApiEnv = env, options: CreateAppOptions = {}) {
  const app = express();
  const logger = options.logger
    ?? (config.NODE_ENV === "test" ? silentLogger : jsonConsoleLogger);
  const limiters = createRateLimiters(config, logger);

  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);
  app.use(createRequestContextMiddleware(logger));
  app.use(
    helmet({
      contentSecurityPolicy: false,
      strictTransportSecurity: config.NODE_ENV === "production"
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
    })
  );
  app.use(cors(createCorsOptions(config)));

  app.use("/health", createHealthRouter(options.readiness ?? readinessService));

  app.use("/api/logistics", privateNoStore);
  app.use("/api/auth", privateNoStore);
  app.use("/api", limiters.global);
  app.post("/api/logistics/auth/login", limiters.loginIp);

  app.use(requireJsonContentType);
  app.use(
    express.json({
      limit: config.JSON_BODY_LIMIT_BYTES,
      type: ["application/json", "application/*+json"],
    })
  );
  app.post("/api/logistics/auth/login", limiters.loginUsername);

  options.configureRoutes?.(app);

  app.use("/api/categories", categoriesRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/logistics/auth", authRouter);
  app.use("/api/logistics/expenses", expensesRouter);
  app.use("/api/logistics/history", historyRouter);
  app.use("/api/logistics/users", usersRouter);
  app.use("/api/logistics/shifts", shiftsRouter);
  app.use("/api/logistics/service-points", servicePointsRouter);
  app.use("/api/logistics/sessions", serviceSessionsRouter);
  app.use("/api/logistics/catalog", logisticsCatalogRouter);
  app.use("/api/logistics/preparation", preparationRouter);
  app.use("/api/logistics", ordersRouter);
  app.use("/api/logistics", checkoutRouter);
  app.use("/api/logistics", transfersRouter);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}

const app = createApp();

export default app;
