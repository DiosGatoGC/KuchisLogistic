import { Router } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validation.middleware";
import { requireAuth } from "../auth/auth.middleware";
import {
  activateUser,
  createUser,
  deactivateUser,
  getUser,
  listUsers,
  resetUserPassword,
  updateUser,
} from "./users.controller";
import {
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
  userIdParamsSchema,
} from "./users.schemas";

const router = Router();

router.use(requireAuth, requireCapability("users.manage"));

router.get("/", validateQuery(listUsersQuerySchema), listUsers);
router.post("/", validateBody(createUserSchema), createUser);
router.get("/:id", validateParams(userIdParamsSchema), getUser);
router.patch(
  "/:id",
  validateParams(userIdParamsSchema),
  validateBody(updateUserSchema),
  updateUser
);
router.post(
  "/:id/activate",
  validateParams(userIdParamsSchema),
  activateUser
);
router.post(
  "/:id/deactivate",
  validateParams(userIdParamsSchema),
  deactivateUser
);
router.post(
  "/:id/reset-password",
  validateParams(userIdParamsSchema),
  validateBody(resetPasswordSchema),
  resetUserPassword
);

export default router;
