import express from "express";
import cors from "cors";

import { env } from "./config/env";
import healthRouter from "./routes/health.routes";
import testDbRouter from "./routes/test-db.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use("/test-db", testDbRouter);

app.listen(env.PORT, () => {
  console.log(`KUCHI'S API running on http://localhost:${env.PORT}`);
});