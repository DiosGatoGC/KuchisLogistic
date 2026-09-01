import { Router } from "express";
import type { ReadinessChecker } from "../readiness/readiness.service";

export function createHealthRouter(readiness: ReadinessChecker) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "kuchis-api",
      timestamp: new Date().toISOString(),
    });
  });

  router.get("/ready", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    let ready = false;
    try {
      ready = await readiness.check();
    } catch {
      ready = false;
    }
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
  });

  return router;
}
