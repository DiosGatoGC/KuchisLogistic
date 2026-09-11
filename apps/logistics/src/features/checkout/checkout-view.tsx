"use client";

import { LOGISTICS_REALTIME_TOPICS } from "@kuchis/shared/logistics-realtime";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { OperationalDialog } from "@/components/ui/operational-dialog";
import { Surface } from "@/components/ui/surface";
import { useProtectedNavigation } from "@/components/layout/protected-navigation-context";
import { useAuth } from "@/features/auth/auth-context";
import { useLogisticsRealtime } from "@/features/realtime/use-logistics-realtime";
import { isSessionInvalidError } from "@/lib/api/client";

import {
  awaitCheckoutPayment,
  confirmCheckoutPayment,
  getCheckoutPreview,
  getCheckoutReconciliation,
  getCheckoutSession,
} from "./checkout-api";
import {
  checkoutApiErrorMessage,
  classifyPaymentFailure,
  classifySessionTransitionFailure,
} from "./checkout-errors";
import { executeCheckoutLifecycle } from "./checkout-lifecycle";
import {
  checkoutPermissions,
  checkoutReconciliationDecision,
  normalizeCheckout,
  PAYMENT_METHOD_LABELS,
  paymentOperationallyClosed,
  paymentSubmissionAllowed,
  runWithPaymentLock,
} from "./checkout-model";
import type {
  CheckoutModel,
} from "./checkout-model";
import type {
  ConfirmPaymentResult,
  PaymentMethod,
} from "./checkout-types";

type Completion =
  | { kind: "confirmed"; payment: ConfirmPaymentResult["payment"] }
  | { kind: "reconciled" }
  | null;

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatFeeRate(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value);
}

function CheckoutItems({ checkout }: { checkout: CheckoutModel }) {
  if (checkout.items.length === 0) {
    return <p className="checkout-empty">Esta atención no tiene consumos facturables.</p>;
  }
  return (
    <div className="checkout-items">
      {checkout.items.map((item) => (
        <article className="checkout-item" key={item.id}>
          <div className="checkout-item__heading">
            <div>
              <strong>{item.quantity}× {item.productName}</strong>
              <span>{formatMoney(item.unitPrice)} por unidad</span>
            </div>
            <strong>{formatMoney(item.lineTotal)}</strong>
          </div>
          {item.additions.length > 0 && (
            <ul>
              {item.additions.map((addition) => (
                <li key={addition.productId}>
                  + {addition.quantityPerItem}× {addition.additionName} · {formatMoney(addition.unitPrice)}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

export function CheckoutView({ sessionId }: { sessionId: string }) {
  const { user, getAccessToken, logout } = useAuth();
  const { setGlobalBackSuppressed } = useProtectedNavigation();
  const permissions = checkoutPermissions(user?.capabilities ?? []);
  const [checkout, setCheckout] = useState<CheckoutModel | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("CASH");
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [retryBlocked, setRetryBlocked] = useState(false);
  const [completion, setCompletion] = useState<Completion>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestRef = useRef(0);
  const paymentLockRef = useRef({ current: false });

  const handleUnauthorized = useCallback(async (error: unknown) => {
    if (isSessionInvalidError(error)) {
      await logout();
      return true;
    }
    return false;
  }, [logout]);

  const adoptPreview = useCallback((result: Awaited<ReturnType<typeof getCheckoutPreview>>) => {
    setCheckout(normalizeCheckout(result.checkout));
    setErrorMessage(null);
  }, [setCheckout, setErrorMessage]);

  const loadPreview = useCallback(async () => {
    const requestId = ++requestRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const accessToken = await getAccessToken();
      const result = await getCheckoutPreview(sessionId, accessToken);
      if (requestId !== requestRef.current) return;
      adoptPreview(result);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      if (await handleUnauthorized(error)) return;
      setErrorMessage(checkoutApiErrorMessage(error, "No pudimos cargar esta cuenta."));
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  }, [
    adoptPreview,
    getAccessToken,
    handleUnauthorized,
    sessionId,
    setErrorMessage,
    setIsLoading,
  ]);

  useLogisticsRealtime({
    topics: [LOGISTICS_REALTIME_TOPICS.tables, LOGISTICS_REALTIME_TOPICS.finance],
    onInvalidate: () => {
      if (!isPaying && completion === null) return loadPreview();
    },
  });

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadPreview(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadPreview]);

  useEffect(
    () => () => setGlobalBackSuppressed(false),
    [setGlobalBackSuppressed],
  );

  const completeCheckout = useCallback((result: Exclude<Completion, null>) => {
    setCompletion(result);
    setGlobalBackSuppressed(true);
  }, [setGlobalBackSuppressed]);

  const selectedOption =
    checkout?.paymentOptions.find((option) => option.method === selectedMethod) ?? null;

  const canSubmit = paymentSubmissionAllowed({
    canCharge: permissions.canCharge,
    inFlight: isPaying,
    unresolved: retryBlocked,
    completed: completion !== null,
  });

  const reconcileBlockedPayment = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const accessToken = await getAccessToken();
      const state = await getCheckoutReconciliation(sessionId, accessToken);
      const decision = checkoutReconciliationDecision(state);
      if (decision === "paid") {
        completeCheckout({ kind: "reconciled" });
        setRetryBlocked(true);
        setNotice("La verificación autoritativa confirma que la atención ya fue pagada.");
        return;
      }
      if (decision === "closed") {
        setRetryBlocked(true);
        setErrorMessage("La atención ya no está activa y no admite otro cobro.");
        return;
      }
      const refreshed = await getCheckoutPreview(sessionId, accessToken);
      adoptPreview(refreshed);
      setRetryBlocked(false);
      setNotice("La atención sigue activa. Revisa nuevamente la cuenta antes de cobrar.");
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      setRetryBlocked(true);
      setErrorMessage(
        checkoutApiErrorMessage(error, "Todavía no pudimos confirmar el estado del cobro."),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const submitPayment = async () => {
    if (!checkout || !selectedOption || !canSubmit) return;
    await runWithPaymentLock(paymentLockRef.current, async () => {
      setIsPaying(true);
      setErrorMessage(null);
      setNotice(null);
      try {
        const accessToken = await getAccessToken();
        const lifecycle = await executeCheckoutLifecycle({
          reviewedCheckout: checkout,
          readSession: async () => (
            await getCheckoutSession(sessionId, accessToken)
          ).session,
          awaitPayment: () => awaitCheckoutPayment(sessionId, accessToken),
          refreshPreview: () => getCheckoutPreview(sessionId, accessToken),
          pay: (currentCheckoutToken) => confirmCheckoutPayment(
            sessionId,
            selectedMethod,
            currentCheckoutToken,
            accessToken,
          ),
          reconcilePayment: () => getCheckoutReconciliation(sessionId, accessToken),
          classifyAwaitFailure: classifySessionTransitionFailure,
          classifyPaymentFailure,
        });
        setShowConfirmation(false);
        if (lifecycle.kind === "checkout-changed-before-payment") {
          adoptPreview(lifecycle.preview);
          setRetryBlocked(false);
          setNotice("La cuenta cambió. Revisa el checkout actualizado antes de cobrar nuevamente.");
          return;
        }
        if (lifecycle.kind === "await-payment-not-applied") {
          setRetryBlocked(false);
          setNotice(
            "La atención sigue abierta y no se envió ningún cobro. Puedes revisar y confirmar nuevamente.",
          );
          return;
        }
        if (lifecycle.kind === "await-payment-failed") {
          setRetryBlocked(false);
          setErrorMessage(checkoutApiErrorMessage(
            lifecycle.error,
            "No se pudo preparar la atención para el cobro.",
          ));
          return;
        }
        if (lifecycle.kind === "await-payment-unresolved") {
          setRetryBlocked(true);
          setErrorMessage(
            "No pudimos confirmar si la atención quedó pendiente de pago. Verifica el estado antes de cobrar.",
          );
          return;
        }
        if (lifecycle.kind === "session-not-payable") {
          setRetryBlocked(true);
          if (lifecycle.session.status === "PAID") {
            completeCheckout({ kind: "reconciled" });
            setNotice("La atención ya figura como pagada en el estado autoritativo.");
          } else {
            setErrorMessage("La atención ya no está activa y no admite un cobro.");
          }
          return;
        }
        if (lifecycle.kind === "session-not-ready") {
          adoptPreview(lifecycle.preview);
          setRetryBlocked(false);
          setErrorMessage(
            "La atención aún no está pendiente de pago. No se envió ningún cobro.",
          );
          return;
        }
        const result = lifecycle.result;
        if (result.kind === "confirmed" || result.kind === "confirmed-reconciliation-failed") {
          completeCheckout({ kind: "confirmed", payment: result.response.payment });
          setRetryBlocked(true);
          setNotice(
            result.kind === "confirmed" && paymentOperationallyClosed(
              result.reconciliation,
              sessionId,
            )
              ? "Pago confirmado y estado operativo sincronizado."
              : "Pago confirmado. El cierre operativo aún no pudo verificarse, pero no se repetirá el cobro.",
          );
          return;
        }
        if (result.kind === "checkout-changed") {
          adoptPreview(result.preview);
          setRetryBlocked(false);
          setNotice("La cuenta cambió. Revisa el checkout actualizado antes de cobrar nuevamente.");
          return;
        }
        if (result.kind === "ambiguous-active") {
          adoptPreview(result.preview);
          setRetryBlocked(false);
          setNotice(
            "No se confirmó el cobro y la atención sigue activa. Revisa la cuenta antes de decidir otro intento.",
          );
          return;
        }
        if (result.kind === "ambiguous-paid") {
          completeCheckout({ kind: "reconciled" });
          setRetryBlocked(true);
          setNotice("La respuesta fue incierta, pero el estado autoritativo confirma que la atención ya fue pagada.");
          return;
        }
        if (result.kind === "ambiguous-closed") {
          setRetryBlocked(true);
          setErrorMessage("La atención dejó de estar activa. No se realizará otro cobro.");
          return;
        }
        setRetryBlocked(true);
        setErrorMessage(
          "El resultado del cobro no pudo confirmarse. Verifica el estado antes de intentar cualquier otro cobro.",
        );
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        setErrorMessage(checkoutApiErrorMessage(error));
      } finally {
        setIsPaying(false);
      }
    });
  };

  if (isLoading && !checkout) {
    return <LoadingState label="Consultando la cuenta…" />;
  }

  if (!checkout) {
    return (
      <ErrorState
        title="Cuenta no disponible"
        message={errorMessage ?? "No pudimos consultar esta atención."}
        actionLabel="Intentar nuevamente"
        onAction={() => void loadPreview()}
      />
    );
  }

  return (
    <div className="checkout-page">
      <header className="checkout-heading">
        <div>
          <p className="eyebrow">Checkout / Cobro</p>
          <h1>{checkout.session.servicePoint.name}</h1>
          <p>
            Cuenta autoritativa · {checkout.session.status === "OPEN" ? "Atención abierta" : "Pendiente de pago"}
          </p>
        </div>
        <Link className="button button--secondary" href="/estado-mesas">Estado de mesas</Link>
      </header>

      {(notice || errorMessage) && (
        <div
          className="tables-notice"
          data-tone={errorMessage ? "warning" : "info"}
          role={errorMessage ? "alert" : "status"}
        >
          {errorMessage ?? notice}
        </div>
      )}

      {completion ? (
        <Surface className="checkout-complete">
          <span aria-hidden="true">✓</span>
          <div className="checkout-complete__content">
            <p className="eyebrow">Cobro finalizado</p>
            <h2>
              {completion.kind === "confirmed"
                ? "Mesa cobrada con éxito"
                : "Pago confirmado por estado autoritativo"}
            </h2>
            <strong>{checkout.session.servicePoint.name}</strong>
            {completion.kind === "confirmed" ? (
              <>
                <p>Método: {PAYMENT_METHOD_LABELS[completion.payment.method]}</p>
                <dl className="checkout-success-totals">
                  <div><dt>Consumo</dt><dd>{formatMoney(completion.payment.businessAmount)}</dd></div>
                  <div><dt>Comisión</dt><dd>{formatMoney(completion.payment.feeAmount)}</dd></div>
                  <div><dt>Total cobrado</dt><dd>{formatMoney(completion.payment.customerTotal)}</dd></div>
                </dl>
                <p>La atención fue cerrada correctamente.</p>
              </>
            ) : (
              <p>El estado autoritativo confirmó el pago. No se enviará otro cargo.</p>
            )}
          </div>
          <Link className="button button--primary" href="/estado-mesas">Volver a Estado de mesas</Link>
        </Surface>
      ) : (
        <div className="checkout-layout">
          <Surface className="checkout-account">
            <header>
              <div>
                <p className="eyebrow">Consumo</p>
                <h2>Detalle de cuenta</h2>
              </div>
              <strong>{formatMoney(checkout.businessAmount)}</strong>
            </header>
            <CheckoutItems checkout={checkout} />
          </Surface>

          <Surface className="checkout-payment">
            <div>
              <p className="eyebrow">Método de pago</p>
              <h2>¿Cómo pagará?</h2>
            </div>
            {!permissions.canCharge && (
              <p className="table-operations-readonly">Modo consulta: no tienes permiso para cobrar.</p>
            )}
            <div className="checkout-methods">
              {checkout.paymentOptions.map((option) => (
                <label key={option.method} className="checkout-method" data-selected={selectedMethod === option.method}>
                  <input
                    type="radio"
                    name="payment-method"
                    value={option.method}
                    checked={selectedMethod === option.method}
                    disabled={!permissions.canCharge || retryBlocked}
                    onChange={() => setSelectedMethod(option.method)}
                  />
                  <span>
                    <strong>{PAYMENT_METHOD_LABELS[option.method]}</strong>
                    <small>Cuenta {formatMoney(option.businessAmount)}</small>
                    <small>Comisión {formatFeeRate(option.feeRate)} · {formatMoney(option.feeAmount)}</small>
                  </span>
                  <strong>{formatMoney(option.customerTotal)}</strong>
                </label>
              ))}
            </div>
            {retryBlocked ? (
              <Button type="button" variant="secondary" loading={isLoading} onClick={() => void reconcileBlockedPayment()}>
                Verificar estado del cobro
              </Button>
            ) : permissions.canCharge ? (
              <Button type="button" disabled={!selectedOption || !canSubmit} onClick={() => setShowConfirmation(true)}>
                Revisar y cobrar
              </Button>
            ) : null}
          </Surface>
        </div>
      )}

      {showConfirmation && selectedOption && (
        <OperationalDialog
          title={`Confirmar cobro con ${PAYMENT_METHOD_LABELS[selectedOption.method]}`}
          description="El cargo se enviará una sola vez con la versión actual de la cuenta."
          busy={isPaying}
          onClose={() => setShowConfirmation(false)}
          footer={
            <>
              <Button type="button" variant="secondary" disabled={isPaying} onClick={() => setShowConfirmation(false)}>
                Volver
              </Button>
              <Button type="button" loading={isPaying} disabled={!canSubmit} onClick={() => void submitPayment()}>
                Confirmar {formatMoney(selectedOption.customerTotal)}
              </Button>
            </>
          }
        >
          <dl className="checkout-confirmation">
            <div><dt>Consumo</dt><dd>{formatMoney(selectedOption.businessAmount)}</dd></div>
            <div><dt>Comisión</dt><dd>{formatMoney(selectedOption.feeAmount)}</dd></div>
            <div><dt>Total cliente</dt><dd>{formatMoney(selectedOption.customerTotal)}</dd></div>
          </dl>
        </OperationalDialog>
      )}
    </div>
  );
}
