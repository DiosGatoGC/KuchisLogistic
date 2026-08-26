import cors from "cors";
import express from "express";
import { corsOptions } from "./config/cors";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import authRouter from "./modules/auth/auth.routes";
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

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
