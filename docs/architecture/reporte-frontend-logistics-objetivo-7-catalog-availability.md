# KUCHI'S Logistics — Frontend Objetivo 7

## Resultado

**PASS CERTIFICADO.**

La ruta `/carta` superó el smoke humano controlado en Production: permite consultar el catálogo Logistics y cambiar únicamente la disponibilidad soportada por el backend. No se implementó edición de nombre, descripción, precio, categoría, imagen, estación de preparación ni additions.

## Alcance implementado

- Carga paralela de categorías y productos autoritativos.
- Identificación por categoría, nombre, precio, disponibilidad y estación de preparación.
- Filtro práctico por categoría y vista completa.
- Estados claramente diferenciados: `Disponible` y `No disponible`.
- Acción directa para marcar agotado o restaurar disponibilidad.
- Estado de solo lectura para usuarios con `tables.view` sin `catalog.availability`.
- Diseño integrado con los shells desktop/tablet y landscape-phone compacto existentes.
- Sin polling, Realtime, cambios en `apps/client` ni escrituras directas a Supabase.

## Contratos backend usados

- `GET /api/logistics/catalog/categories` con `tables.view`.
- `GET /api/logistics/catalog/products` con `tables.view`.
- `PATCH /api/logistics/catalog/products/:id/availability` con `catalog.availability` y payload exacto `{ isAvailable: boolean }`.

El filtro usa el catálogo completo ya cargado; el query opcional por categoría no fue necesario para el volumen y flujo actuales.

## Mutación y reconciliación

- Cada producto tiene su propio lock, por lo que una mutación no bloquea innecesariamente el resto de la carta.
- No existe cambio optimista ni retry automático de `PATCH`.
- Una respuesta confirmada se completa con un refetch autoritativo de productos antes de actualizar la interfaz.
- Ante error ambiguo de red/servidor se ejecuta una sola lectura de reconciliación:
  - si el valor solicitado aparece, se informa como aplicado;
  - si conserva el valor anterior, se muestra ese estado real;
  - si el producto desapareció, se informa explícitamente.
- Si el refetch posterior no puede completarse, solo ese producto queda bloqueado hasta una actualización de lectura satisfactoria.
- Los mensajes de error son seguros, en español y no exponen detalles internos.

## Archivos cambiados

- `apps/logistics/src/app/(protected)/carta/page.tsx`
- `apps/logistics/src/features/catalog-availability/catalog-availability-view.tsx`
- `apps/logistics/src/features/catalog-availability/catalog-availability-api.ts`
- `apps/logistics/src/features/catalog-availability/catalog-availability-types.ts`
- `apps/logistics/src/features/catalog-availability/catalog-availability-model.ts`
- `apps/logistics/src/features/catalog-availability/catalog-availability-mutation.ts`
- `apps/logistics/src/features/catalog-availability/catalog-availability-errors.ts`
- `apps/logistics/src/features/catalog-availability/catalog-availability-error-model.ts`
- `apps/logistics/src/features/catalog-availability/catalog-availability-model.test.ts`
- `apps/logistics/src/features/home/home-dashboard.tsx`
- `apps/logistics/src/app/globals.css`
- `apps/logistics/package.json`

## Validación automatizada

Ejecutada desde `apps/logistics`:

| Comando | Resultado |
| --- | --- |
| `npm run test:catalog-availability` | PASS — 10 tests, 0 fallos |
| `npm run test:checkout` | PASS — 25 tests, 0 fallos |
| `npm run test:table-operations` | PASS — 20 tests, 0 fallos |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — `/carta` generada correctamente |
| `git diff --check` | PASS |

La suite enfocada cubre normalización, filtrado, disponibilidad, capabilities, read-only, payload de `PATCH`, locks por producto, refetch confirmado y reconciliación ambigua/fallida. La regresión obligatoria de Objetivo 6 permaneció verde en la misma rama.

Además se mantuvo verde la regresión de Estado de mesas por ser el punto de entrada a Checkout. No se ejecutaron otras suites de Objetivos 1–5 ni backend porque no se modificaron sus modelos o contratos compartidos.

## Corrección transversal de navegación detectada en smoke

El smoke humano reveló que el shell protegido no ofrecía un control interno Back consistente, por lo que en el flujo previsto de PWA instalada/fullscreen el usuario dependía del navegador, del gesto del sistema o de abandonar pantalla completa. Se incorporó al shell compartido un botón semántico `← Volver`, visible en las rutas protegidas hijas y oculto en `/home`, con variante KUCHI'S existente, foco visible y objetivo táctil apto para desktop, tablet y landscape-phone compacto.

Cada entrada creada dentro de Logistics queda identificada únicamente en `window.history.state`. El control usa `router.back()` sólo cuando esa marca demuestra que existe una entrada anterior de la propia aplicación; una entrada directa, un historial no marcado o un origen externo nunca se seleccionan como destino y ejecutan `router.replace("/home")`. No se abren ventanas nuevas ni se modifica el comportamiento nativo Back/Forward.

El terminal de Checkout suprime el Back genérico en el mismo momento en que un pago queda confirmado o reconciliado. Así conserva como única acción de salida “Volver a Estado de mesas” y no puede reexponer controles accionables de una sesión pagada. Los diálogos mantienen sus cierres locales. Comandar conserva su política ya certificada: el borrador mínimo se persiste por `sessionId` en `sessionStorage`, por lo que esta navegación compartida no introduce una nueva pérdida de borradores.

Regresión local del ajuste: `test:navigation` PASS (6/6), `test:checkout` PASS (25/25), `test:catalog-availability` PASS (10/10), `test:table-operations` PASS (20/20), `test:ordering` PASS (35/35), `test:preparation` PASS (34/34) y `test:tables` PASS (5/5). `lint`, `typecheck`, `build` y `git diff --check`: PASS.

La corrección fue verificada manualmente: `/home` ocultó el control; Home → `/carta` mostró `← Volver` y regresó correctamente; una entrada directa nueva a `/carta`, sin historial confiable de la aplicación, usó el fallback seguro a `/home`. **Navigation UX Fix — HUMAN SMOKE PASS.**

## Smoke humano controlado

**PASS.** Evidencia verificada:

- Filtrado por categoría: PASS.
- Vista de disponibilidad de productos: PASS.
- `Inca Kola 600 ml`, Disponible → No disponible: PASS.
- Reconciliación autoritativa inmediata en `/carta`, con badge y acción actualizados sin refresh manual: PASS.
- Comandar reflejó `NO DISPONIBLE`, impidió seleccionar/agregar ese producto y mantuvo operables los demás: PASS.
- El menú público KUCHI'S reflejó “No disponible”, deshabilitó “Agregar” y mantuvo disponibles los demás productos: PASS.
- Restauración a Disponible desde `/carta`: PASS.
- Restauración en Comandar a producto accionable: PASS.
- Restauración en el menú público a disponible/añadible: PASS.
- Ninguna mutación de disponibilidad quedó después del smoke: PASS.

La auditoría autoritativa final confirmó cero sesiones activas y ausencia de turno abierto. **Production smoke cleanup — PASS.**

## Riesgos residuales

- No se forzaron manualmente una mutación concurrente del mismo producto desde otro dispositivo ni una respuesta `PATCH` interrumpida/perdida; estos escenarios permanecen cubiertos por las pruebas automatizadas.
- Sin conectividad para el refetch no se afirma éxito; el producto afectado permanece bloqueado hasta obtener estado autoritativo.

**Objetivo 7: PASS CERTIFICADO.**
