import express from "express";
import cors from "cors";

import { env } from "./config/env";

import healthRouter from "./routes/health.routes";
import categoriesRouter from "./routes/categories.routes";
import productsRouter from "./routes/products.routes"; 

import { errorHandler } from "./middlewares/error.middleware";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);

app.use("/api/categories", categoriesRouter);
app.use("/api/products", productsRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(
    `KUCHI'S API running on http://localhost:${env.PORT}`
  );
});