# KUCHI'S Logistics — Frontend Objetivo 6

## Resultado

**PASS CERTIFICADO.**

El lifecycle corregido de Checkout/Cobro superó el smoke humano repetido contra el backend desplegado y la limpieza final de Production. El backend permanece como autoridad exclusiva de estados, importes, opciones de pago y `checkoutToken`.

## Cronología de validación

### Resultado automatizado inicial

**PASS — ready for controlled human smoke.**

El preview, los métodos de pago y la seguridad frente a escrituras ambiguas superaron la validación automatizada inicial.

### Primer smoke humano

**FAIL — frontend payment lifecycle blocker discovered.**

Evidencia confirmada:

- El preview de Mesa 1 renderizó correctamente productos, additions y `businessAmount`.
- `CASH` y `YAPE` mostraron el total sin comisión, y `CARD` mostró el `feeRate` autoritativo de 5%.
- La confirmación final de `CASH` por S/ 26.50 se renderizó correctamente.
- La confirmación no completó el pago ni alcanzó una pantalla terminal de éxito.
- La UI mostró “El estado de la cuenta cambió.”, mensaje incorrecto para este conflicto de lifecycle.
- `GET /api/logistics/service-points/status` confirmó que Mesa 1 seguía ocupada.
- La sesión controlada `3431da6a-539b-47dc-8593-9a390e5425a8` permaneció `OPEN`.
- No se confirmó ningún pago exitoso.

## Causa raíz

El frontend enviaba `POST /api/logistics/sessions/:id/payments` directamente desde una sesión `OPEN`. El contrato de sesiones expone `POST /api/logistics/sessions/:id/await-payment`, y `ServicePointsService.awaitPayment()` exige la transición estricta `OPEN` → `AWAITING_PAYMENT`. Checkout no ejecutaba ni confirmaba esa transición antes de cobrar, por lo que el backend rechazaba el lifecycle y el fallback genérico lo presentaba erróneamente como un cambio económico de cuenta.

## Alcance implementado

- Ruta protegida `/cobrar/[sessionId]`, accesible desde el detalle activo de `/estado-mesas`.
- Preview autoritativo con punto de atención, estado de sesión, consumos facturables, cantidades, productos, additions, precios unitarios y totales de línea.
- Presentación separada de `businessAmount`, `feeRate`, `feeAmount` y `customerTotal` para `CASH`, `YAPE` y `CARD`.
- Confirmación explícita antes del pago y resultado visible solo después de respuesta o reconciliación autoritativa.
- Preflight autoritativo de sesión y transición `OPEN` → `AWAITING_PAYMENT` antes del cargo.
- Pantalla terminal dedicada “Mesa cobrada con éxito” con mesa, método, consumo, comisión y total cobrado.
- Experiencia de consulta real para usuarios con `tables.operate` sin `payments.charge`.
- Diseño alineado con el shell KUCHI'S para desktop/tablet y landscape-phone compacto.
- Sin polling, Realtime ni escrituras directas a Supabase.

## Contratos backend usados

- `GET /api/logistics/sessions/:id/checkout` con `tables.operate`.
- `POST /api/logistics/sessions/:id/await-payment` con `tables.operate`.
- `POST /api/logistics/sessions/:id/payments` con `payments.charge` y payload `{ method, expectedCheckoutToken }`.
- `GET /api/logistics/sessions/:id` y `GET /api/logistics/service-points/status` para reconciliación operativa posterior al pago o ante resultados ambiguos.

El frontend conserva el `checkoutToken` del preview visible y lo propaga sin alteración como `expectedCheckoutToken`. Los valores financieros se copian del contrato; el frontend únicamente les aplica formato visual.

## Fix y seguridad de pago

- La confirmación final adquiere un lock síncrono que cubre todo el lifecycle, no solo `POST /payments`.
- Una sesión `OPEN` ejecuta una única llamada a `await-payment`; una sesión ya `AWAITING_PAYMENT` no repite la transición.
- `POST /payments` solo puede ejecutarse después de confirmar estado `AWAITING_PAYMENT` y obtener un preview/token actuales.
- Si el preview refrescado cambió económicamente, no se cobra: se actualiza la cuenta y se exige una nueva revisión explícita.
- Ninguna mutación (`await-payment` o `payments`) se reintenta automáticamente.
- Una respuesta ambigua de `await-payment` obliga a leer la sesión: `AWAITING_PAYMENT` permite continuar, `OPEN` detiene el intento de forma recuperable, un estado cerrado detiene el flujo y una lectura fallida bloquea el pago.
- `CHECKOUT_CHANGED` queda reservado al fingerprint económico/token; `INVALID_SESSION_TRANSITION`, `SESSION_STATE_CONFLICT` y errores equivalentes reciben mensajes de lifecycle independientes.
- Ante timeout, red o respuesta de servidor ambigua, se consulta el estado autoritativo de sesión y puntos:
  - `PAID`: se muestra pago reconciliado y se bloquea otro cargo.
  - `OPEN`/`AWAITING_PAYMENT`: se obtiene un preview nuevo y solo queda disponible un nuevo intento explícito después de revisarlo.
  - `CANCELLED` u otro cierre: se bloquea el cobro.
  - reconciliación fallida: se bloquea el cobro y solo se permite repetir la verificación de lectura.
- Una respuesta de pago confirmada finaliza el flujo y bloquea más cargos incluso si el refetch operativo posterior falla.
- La pantalla terminal elimina los controles de cobro y ofrece únicamente “Volver a Estado de mesas”.

## Archivos cambiados

- `apps/logistics/src/app/(protected)/cobrar/[sessionId]/page.tsx`
- `apps/logistics/src/features/checkout/checkout-view.tsx`
- `apps/logistics/src/features/checkout/checkout-api.ts`
- `apps/logistics/src/features/checkout/checkout-types.ts`
- `apps/logistics/src/features/checkout/checkout-model.ts`
- `apps/logistics/src/features/checkout/checkout-lifecycle.ts`
- `apps/logistics/src/features/checkout/checkout-attempt.ts`
- `apps/logistics/src/features/checkout/checkout-errors.ts`
- `apps/logistics/src/features/checkout/checkout-error-model.ts`
- `apps/logistics/src/features/checkout/checkout-model.test.ts`
- `apps/logistics/src/features/table-operations/table-operations-view.tsx`
- `apps/logistics/src/components/layout/app-shell.tsx`
- `apps/logistics/src/app/globals.css`
- `apps/logistics/package.json`

## Validación automatizada

**FIX PASS — ready to repeat controlled human smoke.**

Ejecutada desde `apps/logistics`:

| Comando | Resultado |
| --- | --- |
| `npm run test:checkout` | PASS — 25 tests, 0 fallos |
| `npm run test:table-operations` | PASS — 20 tests, 0 fallos |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — `/cobrar/[sessionId]` compilada como ruta dinámica |
| `git diff --check` | PASS |

La suite enfocada cubre normalización del preview, valores autoritativos de `CASH`/`YAPE`/`CARD`, propagación del token, capabilities, read-only y double-submit. También demuestra que `OPEN` no puede ir directamente a pago, que `await-payment` precede al cargo, que `AWAITING_PAYMENT` no repite transición, que fallos deterministas/ambiguos impiden cargos inseguros, que `CHECKOUT_CHANGED` conserva semántica económica y que un pago confirmado permanece terminal aunque falle el refetch posterior.

Se ejecutó `test:table-operations` porque Estado de mesas recibió el enlace capability-driven hacia Checkout. No se ejecutaron otras suites de Objetivos 1–5 ni backend porque no se modificaron sus modelos o contratos.

## Corrección transversal de navegación detectada en smoke

El smoke humano reveló que el shell protegido no ofrecía un control interno Back consistente, por lo que en el flujo previsto de PWA instalada/fullscreen el usuario dependía del navegador, del gesto del sistema o de abandonar pantalla completa. Se incorporó al shell compartido un botón semántico `← Volver`, visible en las rutas protegidas hijas y oculto en `/home`, con variante KUCHI'S existente, foco visible y objetivo táctil apto para desktop, tablet y landscape-phone compacto.

Cada entrada creada dentro de Logistics queda identificada únicamente en `window.history.state`. El control usa `router.back()` sólo cuando esa marca demuestra que existe una entrada anterior de la propia aplicación; una entrada directa, un historial no marcado o un origen externo nunca se seleccionan como destino y ejecutan `router.replace("/home")`. No se abren ventanas nuevas ni se modifica el comportamiento nativo Back/Forward.

El terminal de Checkout suprime el Back genérico en el mismo momento en que un pago queda confirmado o reconciliado. Así conserva como única acción de salida “Volver a Estado de mesas” y no puede reexponer controles accionables de una sesión pagada. Los diálogos mantienen sus cierres locales. Comandar conserva su política ya certificada: el borrador mínimo se persiste por `sessionId` en `sessionStorage`, por lo que esta navegación compartida no introduce una nueva pérdida de borradores.

Regresión local del ajuste: `test:navigation` PASS (6/6), `test:checkout` PASS (25/25), `test:catalog-availability` PASS (10/10), `test:table-operations` PASS (20/20), `test:ordering` PASS (35/35), `test:preparation` PASS (34/34) y `test:tables` PASS (5/5). `lint`, `typecheck`, `build` y `git diff --check`: PASS.

La corrección fue verificada manualmente: `/home` ocultó el control; Home → `/carta` mostró `← Volver` y regresó correctamente; una entrada directa nueva a `/carta`, sin historial confiable de la aplicación, usó el fallback seguro a `/home`. **Navigation UX Fix — HUMAN SMOKE PASS.**

## Repetición del smoke humano

**PASS.** El Checkout de Mesa 1 cargó los artículos y la addition correctos con `businessAmount` S/ 26.50. `CASH` mostró comisión S/ 0.00 y total S/ 26.50; `YAPE` se ofreció correctamente y el preview de `CARD` conservó la comisión autoritativa de 5%, con `feeAmount` S/ 1.33 y `customerTotal` S/ 27.83.

La persona seleccionó `CASH`, revisó la confirmación explícita y completó correctamente `OPEN` → `AWAITING_PAYMENT` → `PAID`. El terminal “Mesa cobrada con éxito” presentó Mesa 1, Efectivo, consumo S/ 26.50, comisión S/ 0.00 y total cobrado S/ 26.50; los controles anteriores dejaron de ser accionables y “Volver a Estado de mesas” funcionó correctamente. Estado de mesas y Mesas mostraron Mesa 1 Libre, con cero atenciones activas y sin la sesión pagada entre las atenciones activas.

La limpieza se ejecutó mediante endpoints oficiales. El turno controlado se cerró con S/ 26.50 de ventas y efectivo, sin Yape, tarjeta ni gastos operativos. La auditoría autoritativa final confirmó cero sesiones activas y ausencia de turno abierto. **Production smoke cleanup — PASS.**

## Riesgos residuales

- No se forzaron manualmente pagos exitosos con `YAPE` o `CARD`, una carrera real `CHECKOUT_CHANGED`, ni pérdida de respuesta de `await-payment` o `payments`; estos escenarios permanecen cubiertos por el modelo y las pruebas automatizadas.
- La reconciliación ambigua usa lecturas REST y depende de conectividad recuperada; mientras no pueda confirmarse el estado, el pago permanece bloqueado de forma segura.

**Objetivo 6: PASS CERTIFICADO.**
