import { Router } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import { validateBody, validateParams } from "../../middlewares/validation.middleware";
import { requireAuth } from "../auth/auth.middleware";
import { getExpense, listCurrentExpenses, recordExpense, voidExpense } from "./expenses.controller";
import { expenseParamsSchema, recordExpenseSchema, voidExpenseSchema } from "./expenses.schemas";

const router = Router();
router.use(requireAuth);
router.get("/current", requireCapability("expenses.view"), listCurrentExpenses);
router.get("/:id", requireCapability("expenses.view"), validateParams(expenseParamsSchema), getExpense);
router.post("/", requireCapability("expenses.manage"), validateBody(recordExpenseSchema), recordExpense);
router.post("/:id/void", requireCapability("expenses.manage"), validateParams(expenseParamsSchema), validateBody(voidExpenseSchema), voidExpense);

export default router;
