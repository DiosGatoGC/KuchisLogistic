"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { OperationalDialog } from "@/components/ui/operational-dialog";
import { SelectField } from "@/components/ui/select-field";
import { Surface } from "@/components/ui/surface";
import { useAuth } from "@/features/auth/auth-context";
import { ApiError } from "@/lib/api/client";

import { executeExpenseMutation } from "./expense-mutations";
import { getCurrentExpenses, recordExpense, voidExpense } from "./expenses-api";
import { classifyExpenseMutationFailure, expensesApiErrorMessage } from "./expenses-errors";
import {
  EXPENSE_CATEGORY_LABELS,
  canOfferExpenseVoid,
  expensePermissions,
  normalizeCurrentExpenses,
  reconcileCreatedExpense,
  reconcileVoidedExpense,
  runWithExpenseLock,
  validateRecordExpense,
  validateVoidReason,
} from "./expenses-model";
import type { CurrentExpensesResult, Expense, ExpenseCategory, RecordExpenseInput } from "./expenses-types";
import { formatOperationalDate, formatOperationalMoney, USER_ROLE_LABELS } from "../shifts/shift-formatters";

const initialForm = { category: "SUPPLIES" as ExpenseCategory, customCategory: "", description: "", amount: "" };
const voidConflictCodes = new Set(["SHIFT_EXPENSE_ALREADY_VOIDED", "SHIFT_EXPENSE_CHANGED", "EXPENSE_SHIFT_CLOSED"]);
const expenseCategoryOptions = Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => ({
  value: value as ExpenseCategory,
  label,
}));

export function ExpensesView() {
  const { user, getAccessToken, logout } = useAuth();
  const permissions = expensePermissions(user?.capabilities ?? []);
  const [current, setCurrent] = useState<CurrentExpensesResult | null>(null);
  const [form, setForm] = useState(initialForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [voidTarget, setVoidTarget] = useState<Expense | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidReasonError, setVoidReasonError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [blockedKeys, setBlockedKeys] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestRef = useRef(0);
  const locksRef = useRef(new Set<string>());

  const handleUnauthorized = useCallback(async (error: unknown) => {
    if (error instanceof ApiError && error.kind === "unauthorized") {
      await logout();
      return true;
    }
    return false;
  }, [logout]);

  const loadExpenses = useCallback(async () => {
    const requestId = ++requestRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const accessToken = await getAccessToken();
      const result = await getCurrentExpenses(accessToken);
      if (requestId !== requestRef.current) return null;
      setCurrent(normalizeCurrentExpenses(result));
      setBlockedKeys(new Set());
      return result;
    } catch (error) {
      if (requestId !== requestRef.current) return null;
      if (await handleUnauthorized(error)) return null;
      setErrorMessage(expensesApiErrorMessage(error, "No pudimos consultar los gastos del turno."));
      return null;
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  }, [getAccessToken, handleUnauthorized]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadExpenses(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadExpenses]);

  const blockKey = (key: string) => setBlockedKeys((previous) => new Set(previous).add(key));

  const applyCreateResult = (
    result: Awaited<ReturnType<typeof executeExpenseMutation>>,
    before: CurrentExpensesResult,
    payload: RecordExpenseInput,
  ) => {
    if (result.kind === "confirmed") {
      setCurrent(result.current);
      setForm(initialForm);
      setNotice("Gasto registrado y confirmado con el estado autoritativo.");
      return;
    }
    if (result.kind === "confirmed-refetch-failed") {
      blockKey("create");
      setErrorMessage("El gasto fue registrado, pero no pudimos confirmar la lista actual. Verifica antes de registrar otro.");
      return;
    }
    if (result.kind === "unresolved") {
      blockKey("create");
      setErrorMessage("El resultado del registro es incierto. Verifica los gastos antes de intentar otro.");
      return;
    }
    setCurrent(result.current);
    const decision = reconcileCreatedExpense(before.expenses, result.current.expenses, payload);
    if (decision === "applied") {
      setForm(initialForm);
      setNotice("La respuesta fue incierta; una lectura autoritativa confirmó el gasto.");
    } else if (decision === "unchanged") {
      setErrorMessage("La lectura autoritativa no encontró un gasto nuevo. Revisa antes de decidir otro intento.");
    } else {
      blockKey("create");
      setErrorMessage("No pudimos identificar de forma única el resultado. Revisa la lista antes de registrar otro gasto.");
    }
  };

  const handleCreate = async () => {
    if (!current?.shift || !permissions.canManage || blockedKeys.has("create")) return;
    const validation = validateRecordExpense(form);
    setFormErrors(validation.errors);
    const payload = validation.payload;
    if (!payload) return;
    const before = current;
    await runWithExpenseLock(locksRef.current, "create", async () => {
      setBusyKey("create");
      setErrorMessage(null);
      setNotice(null);
      try {
        const accessToken = await getAccessToken();
        const result = await executeExpenseMutation({
          mutate: () => recordExpense(payload, accessToken),
          refetch: () => getCurrentExpenses(accessToken),
          classifyFailure: classifyExpenseMutationFailure,
        });
        applyCreateResult(result, before, payload);
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        setErrorMessage(expensesApiErrorMessage(error));
      } finally {
        setBusyKey(null);
      }
    });
  };

  const resetVoidDialog = () => {
    setVoidTarget(null);
    setVoidReason("");
    setVoidReasonError(null);
  };

  const closeVoidDialog = () => {
    if (busyKey?.startsWith("void:")) return;
    resetVoidDialog();
  };

  const handleVoid = async () => {
    if (!voidTarget || !current || !permissions.canManage || blockedKeys.has(voidTarget.id)) return;
    const validation = validateVoidReason(voidReason);
    setVoidReasonError(validation.error);
    const reason = validation.value;
    if (!reason) return;
    const target = voidTarget;
    const key = `void:${target.id}`;
    await runWithExpenseLock(locksRef.current, key, async () => {
      setBusyKey(key);
      setErrorMessage(null);
      setNotice(null);
      try {
        const accessToken = await getAccessToken();
        const result = await executeExpenseMutation({
          mutate: () => voidExpense(target.id, reason, accessToken),
          refetch: () => getCurrentExpenses(accessToken),
          classifyFailure: classifyExpenseMutationFailure,
        });
        if (result.kind === "confirmed") {
          setCurrent(result.current);
          setNotice("Gasto anulado y confirmado con el estado autoritativo.");
          resetVoidDialog();
          return;
        }
        if (result.kind === "confirmed-refetch-failed" || result.kind === "unresolved") {
          blockKey(target.id);
          setErrorMessage("El resultado de la anulación no pudo verificarse. Actualiza antes de otra acción.");
          resetVoidDialog();
          return;
        }
        setCurrent(result.current);
        const decision = reconcileVoidedExpense(result.current.expenses, target.id);
        if (decision === "applied") {
          setNotice("La respuesta fue incierta; la anulación quedó confirmada por la lectura autoritativa.");
          resetVoidDialog();
        } else if (decision === "unchanged") {
          setErrorMessage("El gasto continúa activo. Revisa antes de decidir otro intento de anulación.");
        } else {
          blockKey(target.id);
          setErrorMessage("No pudimos determinar el estado del gasto. Actualiza antes de otra acción.");
          resetVoidDialog();
        }
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        if (error instanceof ApiError && voidConflictCodes.has(error.code ?? "")) {
          const refreshed = await loadExpenses();
          const decision = refreshed ? reconcileVoidedExpense(refreshed.expenses, target.id) : "ambiguous";
          if (decision === "applied") setNotice("El gasto ya figura anulado en el estado autoritativo.");
          else setErrorMessage(expensesApiErrorMessage(error));
          resetVoidDialog();
          return;
        }
        setErrorMessage(expensesApiErrorMessage(error));
      } finally {
        setBusyKey(null);
      }
    });
  };

  if (isLoading && !current) return <LoadingState label="Consultando gastos del turno…" />;
  if (!current) {
    return <ErrorState title="Gastos no disponibles" message={errorMessage ?? "No pudimos consultar los gastos."} actionLabel="Intentar nuevamente" onAction={() => void loadExpenses()} />;
  }

  return (
    <div className="expenses-page">
      <header className="operational-heading">
        <div>
          <p className="eyebrow">Egresos operativos</p>
          <h1>Gastos del turno</h1>
          <p>Registra y audita los gastos de la jornada abierta.</p>
        </div>
        <Button type="button" variant="secondary" loading={isLoading} onClick={() => void loadExpenses()}>Actualizar</Button>
      </header>

      {(notice || errorMessage) && (
        <div className="tables-notice" data-tone={errorMessage ? "warning" : "info"} role={errorMessage ? "alert" : "status"}>
          {errorMessage ?? notice}
        </div>
      )}

      {!current.shift ? (
        <Surface className="operational-empty-card">
          <span aria-hidden="true">S/</span>
          <h2>No hay turno abierto</h2>
          <p>Los gastos operativos sólo pueden registrarse durante una jornada abierta.</p>
          {permissions.canOpenShift && <Link className="button button--primary" href="/turnos/apertura">Ir a Apertura de turno</Link>}
        </Surface>
      ) : (
        <>
          <div className="expense-summary-grid">
            <Surface className="operational-metric"><span>Gastos activos</span><strong>{current.activeExpensesCount}</strong></Surface>
            <Surface className="operational-metric"><span>Total activo</span><strong>{formatOperationalMoney(current.activeExpensesTotal)}</strong></Surface>
          </div>

          <div className="expenses-layout">
            {permissions.canManage && (
              <Surface className="expense-create-card">
                <div><p className="eyebrow">Nuevo egreso</p><h2>Registrar gasto</h2></div>
                <SelectField
                  id="expense-category"
                  label="Categoría"
                  value={form.category}
                  options={expenseCategoryOptions}
                  disabled={busyKey === "create" || blockedKeys.has("create")}
                  onChange={(category) => setForm((previous) => ({ ...previous, category, customCategory: "" }))}
                />
                {form.category === "OTHER" && <Input id="expense-custom-category" name="customCategory" label="Categoría personalizada" value={form.customCategory} maxLength={80} error={formErrors.customCategory} disabled={busyKey === "create" || blockedKeys.has("create")} onChange={(event) => setForm((previous) => ({ ...previous, customCategory: event.target.value }))} />}
                <Input id="expense-description" name="description" label="Descripción" value={form.description} maxLength={300} error={formErrors.description} disabled={busyKey === "create" || blockedKeys.has("create")} onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))} />
                <Input id="expense-amount" name="amount" label="Monto" inputMode="decimal" value={form.amount} error={formErrors.amount} disabled={busyKey === "create" || blockedKeys.has("create")} onChange={(event) => setForm((previous) => ({ ...previous, amount: event.target.value }))} />
                {blockedKeys.has("create") ? (
                  <Button type="button" variant="secondary" loading={isLoading} onClick={() => void loadExpenses()}>Verificar gastos</Button>
                ) : (
                  <Button type="button" loading={busyKey === "create"} onClick={() => void handleCreate()}>Registrar gasto</Button>
                )}
              </Surface>
            )}

            <Surface className="expense-list-card">
              <div className="expense-list-card__heading">
                <div><p className="eyebrow">Registro autoritativo</p><h2>Movimientos del turno</h2></div>
                <span>{current.expenses.length} registros</span>
              </div>
              {!permissions.canManage && <p className="table-operations-readonly">Modo solo lectura: puedes revisar gastos, pero no registrarlos ni anularlos.</p>}
              {current.expenses.length === 0 ? <p className="expenses-empty">Aún no hay gastos registrados.</p> : (
                <div className="expense-list">
                  {current.expenses.map((expense) => (
                    <article key={expense.id} className="expense-row" data-voided={expense.voided}>
                      <div className="expense-row__heading">
                        <div><span>{expense.customCategory ?? EXPENSE_CATEGORY_LABELS[expense.category]}</span><strong>{expense.description}</strong></div>
                        <strong>{formatOperationalMoney(expense.amount)}</strong>
                      </div>
                      <div className="expense-row__meta">
                        <span>{expense.voided ? "Anulado" : "Activo"}</span>
                        <span>{formatOperationalDate(expense.recordedAt)}</span>
                        <span>{expense.recordedBy.fullName} · {USER_ROLE_LABELS[expense.recordedBy.role]}</span>
                      </div>
                      {expense.voided && <div className="expense-row__void"><strong>Motivo: {expense.voidReason}</strong>{expense.voidedAt && <span>{formatOperationalDate(expense.voidedAt)}{expense.voidedBy ? ` · ${expense.voidedBy.fullName}` : ""}</span>}</div>}
                      {canOfferExpenseVoid(expense, permissions.canManage, blockedKeys.has(expense.id)) && (
                        <Button type="button" variant="ghost" onClick={() => { setVoidTarget(expense); setVoidReason(""); setVoidReasonError(null); }}>Anular gasto</Button>
                      )}
                      {!expense.voided && permissions.canManage && blockedKeys.has(expense.id) && (
                        <Button type="button" variant="secondary" onClick={() => void loadExpenses()}>Verificar estado</Button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </Surface>
          </div>
        </>
      )}

      {voidTarget && (
        <OperationalDialog
          title="Anular gasto"
          description={`Esta acción conservará ${voidTarget.description} en el historial como Anulado.`}
          busy={busyKey === `void:${voidTarget.id}`}
          onClose={closeVoidDialog}
          footer={<><Button type="button" variant="secondary" disabled={busyKey !== null} onClick={closeVoidDialog}>Cancelar</Button><Button type="button" loading={busyKey === `void:${voidTarget.id}`} onClick={() => void handleVoid()}>Confirmar anulación</Button></>}
        >
          <label className="field">
            <span className="field__label">Motivo obligatorio</span>
            <textarea className="input operational-textarea" value={voidReason} maxLength={300} disabled={busyKey !== null} aria-invalid={Boolean(voidReasonError)} onChange={(event) => setVoidReason(event.target.value)} />
            {voidReasonError && <span className="field__error" role="alert">{voidReasonError}</span>}
          </label>
        </OperationalDialog>
      )}
    </div>
  );
}
