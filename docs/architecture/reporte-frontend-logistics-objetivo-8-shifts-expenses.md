# KUCHI'S Logistics — Frontend Objetivo 8

## Resultado

**PASS CERTIFICADO.**

Se implementaron y certificaron mediante smoke humano controlado en Production la apertura y consulta del turno operativo, junto con el registro, consulta y anulación auditable de gastos del turno. El backend sigue siendo la autoridad exclusiva después de cada escritura; no se añadieron polling, Realtime ni accesos directos a Supabase.

## Alcance implementado

- `/turnos/apertura` carga el turno actual y, cuando no existe uno abierto, permite registrar efectivo inicial desde S/ 0.00.
- Un turno `OPEN` presenta estado, efectivo inicial, fecha/hora de apertura y rol del actor disponible en el contrato.
- `/turnos/gastos` presenta totales activos, lista completa y formulario de registro durante un turno abierto.
- Los gastos anulados permanecen visibles con motivo, fecha y actor cuando están disponibles.
- Los usuarios con `expenses.view` sin `expenses.manage` reciben una vista de consulta real sin controles mutantes.
- El estado sin turno es válido y ofrece acceso a Apertura únicamente si existe `shift.open`.
- Home incluye “Gastos del turno” para usuarios con `expenses.view`.
- El diseño reutiliza componentes KUCHI'S y contempla desktop, tablet y landscape-phone compacto, preservando `← Volver`.

No se implementó cierre de turno, snapshot de cierre ni cuadre de caja; corresponden exclusivamente al Objetivo 9.

## Contratos backend

### Turnos

- `GET /api/logistics/shifts/current` — `shift.open` — respuesta `{ shift }`, donde `shift` puede ser `null`.
- `POST /api/logistics/shifts/open` — `shift.open` — payload exacto `{ openingCash: number }`, respuesta 201 `{ shift }`.
- `openingCash` acepta cero, exige un número finito entre 0 y S/ 99,999,999.99 y máximo dos decimales.

### Gastos

- `GET /api/logistics/expenses/current` — `expenses.view` — devuelve turno, filas completas y `activeExpensesCount`/`activeExpensesTotal` autoritativos. Sin turno devuelve `shift: null`, lista vacía y totales cero.
- `POST /api/logistics/expenses` — `expenses.manage` — payload `{ category, customCategory, description, amount }`, respuesta 201 `{ expense }`.
- `POST /api/logistics/expenses/:id/void` — `expenses.manage` — payload `{ reason }`, respuesta `{ expense }`.
- Categorías preservadas: `SUPPLIES`, `CLEANING`, `OTHER`; sólo `OTHER` envía una categoría personalizada no nula, recortada y de 1 a 80 caracteres.
- La descripción se recorta y admite 1 a 300 caracteres; el monto debe ser positivo, no superar S/ 99,999,999.99 y tener máximo dos decimales.
- El motivo de anulación se recorta, es obligatorio y admite 1 a 300 caracteres.

## Lifecycle de apertura

- La pantalla obtiene primero `GET /shifts/current`; nunca ofrece otro formulario si ya existe un turno `OPEN`.
- El submit valida el monto y adquiere un lock síncrono antes del `POST`.
- Una respuesta confirmada se reconcilia mediante un único `GET /shifts/current`.
- Una respuesta ambigua de red/servidor nunca reenvía `POST /open`: un turno `OPEN` queda reconciliado, la ausencia de turno no se presenta como éxito y una lectura fallida bloquea otro intento hasta verificar.
- `SHIFT_ALREADY_OPEN` provoca una lectura del turno existente, no otra apertura.

## Lifecycle de gastos

- No se insertan ni anulan filas de forma optimista; toda actualización visible proviene de `GET /expenses/current`.
- Crear y anular usan locks síncronos, un solo `POST` y un refetch autoritativo.
- Una creación ambigua sólo se considera aplicada si aparece exactamente una fila nueva que coincide con el payload normalizado; cero coincidencias no afirman éxito y varias coincidencias bloquean otra escritura hasta revisión.
- Una anulación ambigua se considera aplicada sólo si la fila autoritativa aparece anulada. Si sigue activa no se afirma éxito; si desaparece o la lectura falla, la acción queda bloqueada hasta verificar.
- `SHIFT_EXPENSE_ALREADY_VOIDED`, `SHIFT_EXPENSE_CHANGED` y `EXPENSE_SHIFT_CLOSED` tienen mensajes explícitos y reconciliación de lectura sin retry.
- Los totales mostrados son los campos agregados del backend; las filas anuladas no se borran ni se incluyen en esos totales autoritativos.

## Archivos cambiados

- `apps/logistics/src/app/(protected)/turnos/apertura/page.tsx`
- `apps/logistics/src/app/(protected)/turnos/gastos/page.tsx`
- `apps/logistics/src/features/shifts/*`
- `apps/logistics/src/features/expenses/*`
- `apps/logistics/src/features/home/home-dashboard.tsx`
- `apps/logistics/src/components/layout/app-shell.tsx`
- `apps/logistics/src/app/globals.css`
- `apps/logistics/package.json`
- `docs/architecture/reporte-frontend-logistics-objetivo-8-shifts-expenses.md`

## Validación automatizada

Ejecutada desde `apps/logistics`:

| Comando | Resultado |
| --- | --- |
| `npm run test:shifts` | PASS — 8 tests, 0 fallos |
| `npm run test:expenses` | PASS — 13 tests, 0 fallos |
| `npm run test:navigation` | PASS — 6 tests, 0 fallos |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — `/turnos/apertura` y `/turnos/gastos` generadas |
| `git diff --check` | PASS |

Las pruebas cubren ausencia/normalización del turno, monto cero, precisión/rango, capabilities, double-submit, fallo determinista, reconciliación ambigua y ausencia de retry. Para gastos cubren estado sin turno, preservación de filas anuladas y totales autoritativos, payloads por categoría, validaciones, read-only, locks, reconciliación de creación, motivo/gating de anulación y reconciliación de anulaciones ambiguas.

## Smoke humano controlado en Production

- El estado inicial sin turno se presentó correctamente y permitió abrir un turno con efectivo inicial S/ 0.00: PASS.
- La apertura produjo un único turno `OPEN`; estado, efectivo inicial, fecha/hora y responsable Administración se conservaron tras refresh sin duplicar la mutación: PASS.
- Gastos inició con 0 registros activos y total S/ 0.00: PASS.
- Se registraron gastos controlados `SUPPLIES` por S/ 10.00, `CLEANING` por S/ 5.00 y `OTHER` con categoría personalizada Movilidad por S/ 7.00: PASS.
- Los agregados autoritativos evolucionaron de 0/S/ 0.00 a 1/S/ 10.00, 2/S/ 15.00 y 3/S/ 22.00: PASS.
- La anulación del gasto `CLEANING`, con motivo obligatorio, lo mantuvo visible como Anulado con su auditoría, retiró su control mutante y redujo los activos a 2/S/ 17.00: PASS.
- El refresh preservó las tres filas, el estado anulado y los agregados 2/S/ 17.00: PASS.
- Durante el cierre controlado del Objetivo 9 se anularon también los dos gastos activos restantes; las tres filas quedaron únicamente como evidencia auditable: PASS.
- La auditoría final confirmó 0 sesiones de servicio activas y ausencia de turno abierto: Production limpia, PASS.

No se forzaron manualmente una cuenta separada de sólo lectura, pérdidas de respuesta en apertura/creación/anulación ni creación concurrente idéntica. Esos escenarios permanecen cubiertos por la validación automatizada descrita arriba.

## Riesgos residuales

- Una creación con múltiples filas nuevas idénticas no puede atribuirse inequívocamente a la respuesta perdida y queda bloqueada para revisión humana.
- Si no se recupera conectividad para la lectura autoritativa, la operación incierta permanece bloqueada de forma segura.
- Los escenarios de cuenta separada de sólo lectura, respuesta perdida y concurrencia idéntica no fueron forzados en Production; su cobertura certificada en este cierre es automatizada.

**Objetivo 8: PASS CERTIFICADO.**
