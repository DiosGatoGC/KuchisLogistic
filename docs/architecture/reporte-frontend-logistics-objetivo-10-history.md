# KUCHI'S Logistics — Frontend Objetivo 10

## Resultado

**PASS CERTIFICADO.**

Se implementó Historial como módulo estrictamente de lectura para consultar turnos `CLOSED`, su paginación autoritativa y el detalle operativo direccionable. No se añadieron mutaciones, polling, Realtime, acceso directo a Supabase ni filtros que el backend no soporte.

## Alcance implementado

- `/historial` reemplaza el placeholder por la lista paginada de turnos cerrados.
- Cada registro resume apertura/cierre, actores disponibles, ventas, canales de pago, gastos, conteos y existencia de cuadre.
- `/historial/[shiftId]` ofrece entrada directa y conserva el turno seleccionado después de refresh.
- El detalle organiza turno, cierre, cuadre, atenciones/comandas, pagos, gastos, transferencias/correcciones y auditoría mediante secciones progresivas.
- Los estados de carga, error, historial vacío, página vacía/obsoleta, identificador inválido y turno inexistente son explícitos y seguros.
- El diseño conserva el shell protegido, `← Volver` y el lenguaje KUCHI'S en desktop, tablet y teléfono landscape compacto.

## Contratos exactos

### Lista

- `GET /api/logistics/history/shifts`
- Capacidad: `history.view`.
- Query: `page` entero mínimo 1, por defecto 1; `pageSize` entero 1..100, por defecto 20.
- Respuesta: `{ items, pagination }`, con `page`, `pageSize`, `total` y `totalPages` preservados del backend.
- La UI conserva el orden recibido y no ofrece filtros de fecha, personal, pago o búsqueda inexistentes.

### Detalle

- `GET /api/logistics/history/shifts/:id`
- Capacidad: `history.view`.
- Respuesta: `{ history }`.
- `SHIFT_HISTORY_NOT_FOUND` presenta un estado no encontrado sin redirigir a otro turno.
- Un `shiftId` que no es UUID se rechaza antes de emitir una solicitud.

## Capacidad y navegación

La ruta y su detalle permanecen dentro de `CapabilityGuard` con `history.view`. Una cuenta sin esa capacidad no monta las vistas ni dispara solicitudes de Historial. El módulo no expone controles o helpers de escritura.

## Paginación

La lista solicita 20 registros por página y envía siempre `page`/`pageSize` acotados. Anterior y Siguiente se deshabilitan en los extremos. Si una página queda obsoleta después de disminuir el total, se recupera una sola vez hacia la página válida más cercana; el estado con cero registros es válido y no genera ciclos de retry.

## Procedencia histórica

- Los nombres de actores con `fullNameSource: CURRENT_PROFILE` se presentan como nombre del perfil actual, no como snapshot histórico inmutable.
- Los puntos de servicio de las atenciones indican que su nombre corresponde a la configuración actual (`CURRENT_SERVICE_POINT`).
- Los nombres origen/destino de transferencias se identifican como preservados al momento de transferir (`TRANSFER_SNAPSHOT`).
- Los valores nulos de nombre o actor se muestran como información no disponible, sin fabricar identidad histórica.

## Autoridad financiera

Ventas, efectivo, Yape, tarjeta, comisiones, gastos, efectivo esperado, confirmados y diferencias provienen directamente de la respuesta HTTP. El frontend sólo aplica formato PEN, porcentaje y fecha/hora; no recalcula snapshots de cierre ni diferencias de cuadre.

## Archivos cambiados

- `apps/logistics/src/app/(protected)/historial/page.tsx`
- `apps/logistics/src/app/(protected)/historial/[shiftId]/page.tsx`
- `apps/logistics/src/features/history/history-api.ts`
- `apps/logistics/src/features/history/history-types.ts`
- `apps/logistics/src/features/history/history-model.ts`
- `apps/logistics/src/features/history/history-list-view.tsx`
- `apps/logistics/src/features/history/history-detail-view.tsx`
- `apps/logistics/src/features/history/history-model.test.ts`
- `apps/logistics/src/app/globals.css`
- `apps/logistics/package.json`
- `docs/architecture/reporte-frontend-logistics-objetivo-10-history.md`

## Validación automatizada

Ejecutada desde `apps/logistics`:

| Comando | Resultado |
| --- | --- |
| `npm run test:history` | PASS — 7 tests, 0 fallos |
| `npm run test:navigation` | PASS — 6 tests, 0 fallos |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

La prueba focal cubre query y límites de paginación, normalización de lista, historial cero, recuperación de página obsoleta, metadatos, cuadre presente/ausente, dinero directo, actores nulos, detalle completo, diferencias firmadas, atenciones/comandas/ítems/adiciones, pagos, gastos anulados, snapshots de transferencias, auditoría, UUID directo, error estable, capability gating y ausencia de modelo mutante.

## Smoke humano controlado en Production

El smoke utilizó exclusivamente datos históricos reales existentes y no creó mutaciones en Production.

### Verificado manualmente

- `/historial` cargó múltiples turnos `CLOSED` con fechas de apertura/cierre, actores, ventas, efectivo, Yape, tarjeta, gastos, conteos y acción Ver detalle: PASS.
- La lista mostró correctamente turnos con `Con cuadre` y `Sin cuadre`, diferentes conteos de atenciones/comandas y ningún control mutante: PASS.
- El detalle del turno abierto el 9 Sep 2026 a las 5:07 p. m. y cerrado a las 5:18 p. m. cargó estado, timestamps, efectivo inicial y actores: PASS.
- El snapshot de cierre presentó ventas, canales, comisión/totales de tarjeta, gastos y efectivo esperado desde los campos históricos autoritativos: PASS.
- El cuadre histórico presentó esperado, confirmado y diferencia cero para efectivo, Yape y tarjeta, además de fecha, actor y la nota conservada del smoke del Objetivo 9: PASS.
- Los tres gastos controlados de Objetivos 8/9 permanecieron como evidencia histórica anulada: `Compra de servilletas smoke` por S/ 10.00, `Compra de detergente smoke` por S/ 5.00 y `Taxi de emergencia smoke` por S/ 7.00, con sus motivos de anulación/limpieza visibles: PASS.
- Las secciones Atenciones y comandas, Pagos, Gastos, Transferencias y correcciones, y Auditoría estuvieron estructuradas y mostraron contadores. En este turno las primeras, pagos y transferencias estaban vacías; Auditoría contenía registros: PASS.
- Los actores aplicables se mostraron con `(perfil actual)`, respetando la procedencia `CURRENT_PROFILE`: PASS.
- Un hard refresh en la URL exacta `/historial/<shiftId>` conservó y volvió a cargar el mismo turno, sin regresar a la lista: PASS.
- La entrada directa al UUID válido inexistente `00000000-0000-4000-8000-000000000001` presentó `Turno no encontrado`, explicación, Intentar nuevamente y Volver al historial, sin redirección, error descontrolado ni loop: `SHIFT_HISTORY_NOT_FOUND` PASS.

### No verificado manualmente

- Navegación página 1 → página 2 → página 1: no había suficientes registros reales para una segunda página y no se fabricaron turnos.
- Detalle profundo de un turno sin cuadre; sólo se comprobó su indicador `Sin cuadre` en la lista.
- Secciones históricas no vacías de pagos o transferencias.
- Diferencias de cuadre positivas o negativas.
- Todas las variantes posibles de detalles de auditoría.
- Responsive en teléfono landscape compacto.

Estos casos permanecen en cobertura automatizada/modelo o dependen de la disponibilidad de datos históricos reales.

## Riesgos residuales

- La disponibilidad de detalles reales sin cuadre, pagos y transferencias no vacíos depende del historial existente en Production.
- Los nombres con fuente `CURRENT_PROFILE` pueden cambiar respecto del momento del evento; la UI declara esa procedencia.
- La recuperación de página obsoleta depende de una segunda lectura autoritativa y presenta error si ésta falla, sin entrar en retry infinito.
- La paginación multipágina y las diferencias de cuadre con signo no pudieron verificarse manualmente por falta de casos reales suficientes; conservan cobertura automatizada.

**Frontend Objective 10 — PASS CERTIFICADO.**
