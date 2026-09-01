import { Router } from "express";
import { validateBody } from "../../middlewares/validation.middleware";
import { login, me } from "./auth.controller";
import { requireAuth } from "./auth.middleware";
import { loginSchema } from "./auth.schemas";

const router = Router();

router.post("/login", validateBody(loginSchema), login);
router.get("/me", requireAuth, me);

export default router;
