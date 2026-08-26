import cors from "cors";
import express from "express";
import { corsOptions } from "./config/cors";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import authRouter from "./modules/auth/auth.routes";
import logisticsCatalogRouter from "./modules/logistics-catalog/logistics-catalog.routes";
import ordersRouter from "./modules/orders/orders.routes";
import preparationRouter from "./modules/preparation/preparation.routes";
import servicePointsRouter from "./modules/service-points/service-points.routes";
import serviceSessionsRouter from "./modules/service-points/service-sessions.routes";
import shiftsRouter from "./modules/shifts/shifts.routes";
import usersRouter from "./modules/users/users.routes";
import transfersRouter from "./modules/transfers/transfers.routes";
import categoriesRouter from "./routes/categories.routes";
import healthRouter from "./routes/health.routes";
import productsRouter from "./routes/products.routes";

const app = express();

app.disable("x-powered-by");
app.use(cors(corsOptions));
app.use(express.json({ limit: "100kb" }));

app.use("/health", healthRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/products", productsRouter);
app.use("/api/logistics/auth", authRouter);
app.use("/api/logistics/users", usersRouter);
app.use("/api/logistics/shifts", shiftsRouter);
app.use("/api/logistics/service-points", servicePointsRouter);
app.use("/api/logistics/sessions", serviceSessionsRouter);
app.use("/api/logistics/catalog", logisticsCatalogRouter);
app.use("/api/logistics/preparation", preparationRouter);
app.use("/api/logistics", ordersRouter);
app.use("/api/logistics", transfersRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
