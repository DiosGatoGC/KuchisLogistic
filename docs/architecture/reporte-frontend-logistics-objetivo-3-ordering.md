# Reporte — Frontend Logistics Objetivo 3: Comandar

## Resultado

**FRONTEND OBJETIVO 3 — COMANDAR — PASS — CERTIFICADO.** El flujo nace de una service session real, consume catálogo y comandas mediante los contratos REST existentes, mantiene Nueva comanda separada del historial enviado, personaliza adicionales y notas, calcula un total únicamente visual, confirma antes de crear y adopta siempre la respuesta real del backend. Tras un HTTP 201 válido limpia el draft, prepara feedback con la secuencia real y vuelve directamente a Mesas mediante `router.replace`. La interfaz es operacional y textual: no renderiza imágenes, thumbnails ni placeholders fotográficos.

## 1. Rama

- Rama existente: `feat/logistics-ordering`.
- No se creó ni cambió de rama.

## 2. HEAD inicial

- HEAD: `5e295f2c7e066361c89c44aafe38d941beba21fb`.
- Corresponde a `Merge Frontend Logistics Objetivo 2`.
- Working tree inicial: limpio.

## 3. Scope

Se modificó exclusivamente `apps/logistics` y se creó este reporte. No se modificaron backend, cliente público, shared, Supabase, SQL, migrations, RPC, RLS, Realtime, Vercel ni `main`.

## 4. Contratos backend

Se leyeron completos routes, schemas, controller, service, repository y types de `orders`; routes, schemas, controller, service y repository de `logistics-catalog`; `rpc-errors.ts`; y la convención de adicionales de `apps/client/src/lib/catalog.ts`. La inspección fue únicamente de lectura.

## 5. Catálogo

`ordering-api.ts` consume con Auth:

- `GET /api/logistics/catalog/categories`;
- `GET /api/logistics/catalog/products`;
- `GET /api/logistics/catalog/products?category=adicionales`.

No se inventaron endpoints de búsqueda o adicionales.

## 6. Categorías

Las categorías se ordenan por `sortOrder`, se agrega `Todos` para la vista completa y se excluye siempre el slug reservado `adicionales` del menú principal.

## 7. Productos

Los productos muestran nombre, precio, disponibilidad y el indicador `+ Adicionales` cuando corresponde. Los agotados siguen visibles como `NO DISPONIBLE`, con control deshabilitado.

## 8. Decisión UX sin imágenes

`imagePath` se tipa porque pertenece al contrato, pero no se consume en componentes, payload ni cálculo. El DOM del smoke registró `0` imágenes en escritorio, tablet y compact.

## 9. Adicionales

Sólo aparecen si `allowsAdditions === true`. Se cargan como productos de la categoría `adicionales`, no pueden duplicarse, los no disponibles quedan deshabilitados y `quantityPerItem` se limita a `1–100` cuando están seleccionados.

## 10. Availability

Un producto principal agotado no puede agregarse. La revalidación conserva líneas afectadas por cambios de catálogo, las marca inválidas y bloquea el envío hasta corregirlas.

## 11. Route

Se creó `/comandar/[sessionId]` con App Router. El `sessionId` procede del backend; no se usan nombre, número de mesa ni `sortOrder` como identificador operacional.

## 12. Entrada desde Mesas

El detalle de una atención muestra `Comandar` únicamente cuando la sesión está `OPEN` y el usuario tiene `orders.create`. `AWAITING_PAYMENT` no ofrece la acción.

## 13. Capabilities

La ruta exige `tables.view` y `orders.create` mediante guards existentes. No se hardcodean roles; el backend conserva la autoridad final.

## 14. Layout

La pantalla usa tres zonas: Categorías, Productos y Nueva comanda. Cada panel tiene scroll interno y mantiene targets táctiles sin cards fotográficas.

## 15. Responsive

- 1440×900: tres zonas amplias, sin overflow global.
- 1024×768: tres zonas compactadas, ancho de documento igual al viewport.
- 844×390: Compact Operational Shell; las tres zonas quedan operables dentro del alto disponible.
- 667×375: Compact Operational Shell con scroll horizontal localizado en el workspace de 780 px; el documento conserva el ancho del viewport.
- 390×844: `LandscapeGate` visible y shell operacional no renderizado.

La emulación temporal retiró sólo `pointer: coarse` durante la comprobación desktop del breakpoint; la condición original fue restaurada.

## 16. Búsqueda

La búsqueda es local sobre nombre y descripción, case-insensitive y normaliza acentos. No envía `q` ni utiliza `/search`.

## 17. Draft

`DraftOrder` y `DraftLine` representan exclusivamente contenido no enviado. Permiten agregar, editar, eliminar y variar cantidades dentro del contrato.

## 18. Line equivalence

Sólo se fusionan líneas con el mismo `productId`, nota trimeada equivalente y adicionales normalizados equivalentes. Personalizaciones distintas permanecen separadas.

## 19. Notes

La nota por ítem y la nota general son visual y semánticamente distintas. Ambas se trimean, admiten hasta 500 caracteres y se omiten del payload cuando quedan vacías.

## 20. Additions

El dialog permite seleccionar, deseleccionar y variar cantidades por unidad. Los adicionales se ordenan antes de comparar o construir el payload.

## 21. Total visual

Se calcula:

`(precio base + Σ precio adicional × cantidad por unidad) × cantidad de línea`.

El total se etiqueta como visual y nunca se presenta como fuente financiera de verdad.

## 22. Payload

`createOrderPayload` envía únicamente `notes?`, `items[].productId`, `quantity`, `notes?` y `additions[].productId/quantityPerItem`. No envía nombres, precios, total, estación, status ni `imagePath`.

## 23. Response y retorno operacional

El create exige HTTP 201 y valida que la respuesta contenga un `order` utilizable con id, `sequenceNumber`, session e items. Sólo después de esa confirmación se adopta la comanda real, se limpia el draft en memoria y persistido, se prepara el feedback y se ejecuta `router.replace("/mesas")`. `replace` evita que Back regrese a un Comandar vacío. Ningún error de validación, 4xx, 409, 429, 5xx, red, timeout, escritura ambigua o body inválido navega a Mesas.

El feedback usa un registro mínimo y versionado en `sessionStorage`, separado del draft y sin credenciales. Mesas lo consume y elimina al entrar, renderiza `Comanda #N enviada.` en una región `aria-live` y no lo repite después de refresh.

## 24. Enviadas

`Enviadas (N)` abre un dialog read-only con número, hora, creador, líneas, adicionales, notas y estados reales.

## 25. Separación draft/enviadas

El historial nunca reconstruye Nueva comanda. El smoke Production confirmó que el draft contenía únicamente los dos productos no enviados; después del create real quedó vacío, Enviadas pasó de 0 a 1 y la comanda persistió en backend. Con la navegación final, al volver a abrir Comandar para la misma atención, Enviadas se reconstruye mediante GET desde backend.

## 26. Double-submit

El botón usa disabled/loading y `runWithSubmitLock` aplica un lock síncrono. La prueba concurrente confirmó una sola operación para dos intentos simultáneos.

## 27. Escritura ambigua

Ante error de red o 5xx no hay retry automático. Se conserva el draft, se consulta Enviadas, se muestra `No pudimos confirmar el resultado del envío` y el reenvío permanece bloqueado hasta una decisión humana explícita.

## 28. Errores

Se mapearon los cambios contractuales de producto, adicional, cantidades, líneas, sesión y turno. No se muestran errores raw ni stack traces.

## 29. Refetch

Existe carga inicial paralela, actualización manual, refetch al recuperar visibilidad y reconciliación específica después de conflictos o escrituras ambiguas. Después de create confirmado se vuelve a Mesas, que consulta su status real; al reabrir Comandar, sus comandas se consultan nuevamente desde backend. No hay polling.

## 30. Persistence

El draft se guarda en `sessionStorage` bajo una clave versionada por `sessionId`. Persiste sólo IDs, quantities, additions y notes; al restaurar se revalida contra catálogo. Tras 201 se limpia. El flash de éxito utiliza otra clave versionada, persiste únicamente el `sequenceNumber` real y se elimina al primer consumo en Mesas.

## 31. Accessibility

Se conservaron botones semánticos, focus visible, labels, focus trap, Escape, retorno de foco, `aria-live`, `aria-busy`, estados deshabilitados y textos que no dependen sólo del color. El dialog compacto ocupó 376 px dentro de un viewport de 390 px.

## 32. Tests

`npm run test:ordering`: PASS, 35/35. Además de categorías, availability, adicionales, notas, cantidades, total, payload, sesión y persistencia, cubre el cierre tras success: limpieza de ambos drafts, feedback desde el `sequenceNumber` backend, navegación por replace, body inválido sin navegación, ausencia de navegación ante 400, 409, 429, 5xx, red y escritura ambigua, double-submit de un único POST y consumo único del flash sin repetición tras refresh.

## 33. Regression tables

`npm run test:tables`: PASS, 5/5. El smoke local confirmó 18 puntos contractuales: Salón `6,5,4,3,2,1,7,B4,B3,B2,B1`, Llevar `LL1–LL7`, confirmación de apertura, detalle real del fixture y acción Comandar para sesión OPEN. No se ejecutó open/release.

## 34. Lint

`npm run lint`: PASS.

## 35. Typecheck

`npm run typecheck`: PASS con TypeScript strict y sin `any`.

## 36. Build

`npm run build`: PASS con Next.js 16.3.2 y Webpack. Se generaron 14 rutas estáticas y `/comandar/[sessionId]` como ruta dinámica. No se reinvestigó Webpack ni `experimental.useTypeScriptCli: false`.

## 37. Audit

`npm audit`: PASS; 0 vulnerabilidades.

## 38. Smoke local

Se utilizó un backend contractual efímero, un usuario visual sin credenciales y un bypass Auth temporal retirado antes de la validación final. Pasaron:

- categorías, productos, búsqueda y availability;
- personalización con adicionales y nota;
- draft, quantities, total y confirmación;
- POST mock 201 y adopción de la respuesta real del mock;
- limpieza del draft en memoria y de su clave persistida;
- navegación automática a `/mesas` mediante replace;
- feedback `Comanda #N enviada.` con la secuencia de response;
- consumo único del feedback y ausencia del mensaje tras refresh;
- Back no regresó al draft enviado;
- desconexión real del mock durante POST: permanencia en Comandar, draft conservado, sin retry y sin navegación;
- Enviadas separada y reconstruida desde backend al reabrir;
- 1440×900, 1024×768, 844×390, 667×375 y 390×844;
- 0 imágenes, sin error overlay y 0 errores/warnings de aplicación.

El documento mantuvo el ancho del viewport en 1440×900, 1024×768, 844×390 y 667×375; el feedback no rompió Mesas en compact. En 390×844 el `LandscapeGate` quedó visible, el shell operacional no se renderizó y el ancho fue exactamente 390 px. Mocks, bypass, condición temporal de puntero, archivos de agentes y artefactos generados fueron retirados.

## 39. Smoke humano Production ejecutado

El smoke humano real se ejecutó de forma controlada. Localhost se habilitó temporalmente en CORS exclusivamente para esta validación y fue retirado al finalizar. Se confirmó:

1. Production inicialmente sin turno OPEN: PASS.
2. Production inicialmente sin service sessions activas: PASS.
3. Turno controlado con `openingCash = 0`: PASS.
4. Mesa 1 abierta mediante el frontend real: PASS.
5. Entrada Mesa 1 → Comandar: PASS.
6. Catálogo Production real: PASS.
7. Categorías Production reales: PASS.
8. `adicionales` excluida del menú principal: PASS.
9. Productos renderizados sin imágenes: PASS.
10. Producto real Clásica: PASS.
11. Adicional real Queso: PASS.
12. Producto real Inca Kola 600 ml: PASS.
13. Personalización con adicional: PASS.
14. Nota por ítem: PASS.
15. Nota general: PASS.
16. Draft exclusivamente no enviado: PASS.
17. Total visual S/ 17.00: PASS.
18. Confirmación `2 productos · S/ 17.00`: PASS.
19. POST create Production real: PASS.
20. Backend creó Comanda #1 real: PASS.
21. Feedback `Comanda #1 enviada.`: PASS.
22. Draft vacío tras success: PASS.
23. Enviadas 0 → 1: PASS.
24. Datos reales persistidos en backend: PASS.

Datos funcionales del smoke: 1× Clásica, Queso ×1, nota por ítem `smoke 03 sin cebolla`, 1× Inca Kola 600 ml y nota general `smoke frontend objetivo 03`. No se registran UUIDs, tokens ni credenciales.

Este smoke Production ocurrió antes del ajuste de navegación automática. Por tanto, certifica el create real y su persistencia, pero **no** se presenta como prueba Production del redirect success → Mesas. Ese redirect fue validado posteriormente mediante tests y smoke local contractual completos.

## 40. Cleanup Production ejecutado

- Los dos ítems del smoke se cancelaron con el endpoint backend oficial y el motivo `Cleanup smoke Frontend Objetivo 3`: `PENDING → CANCELLED`, PASS.
- La atención se liberó con el endpoint oficial: PASS.
- Resultado: session `CANCELLED`, `businessAmount = 0`, Mesa 1 no ocupada y sin active session: PASS.
- Se cerró únicamente el turno controlado y GET de turno actual devolvió ausencia de turno abierto: PASS.
- Production terminó sin turno abierto, sin Mesa 1 ocupada, sin service session activa del smoke y sin consumo activo del smoke: PASS.
- Localhost fue retirado nuevamente de CORS: PASS.

## 41. Scope no implementado

- Cocina/Bebidas: start, ready, deliver.
- Cancelaciones de ítems.
- Transferencias, checkout y pagos.
- Realtime, polling o SQL.
- Idempotency-Key no soportado por backend.
- Objetivo 4.

## 42. Riesgos

- Sin idempotencia backend, una escritura ambigua requiere reconciliación y decisión humana; el frontend evita retry automático.
- Realtime aún no existe y pertenece a un objetivo posterior; mientras tanto, la pestaña puede quedar desactualizada hasta una sincronización REST explícita.

Los riesgos son conocidos y no bloquean la certificación.

## 43. Siguiente objetivo

`FRONTEND OBJETIVO 4 — PEDIDOS + COCINA + BEBIDAS`.

No se inició.

## 44. Conclusión

**FRONTEND OBJETIVO 3 — COMANDAR — PASS — CERTIFICADO.**

La implementación satisface catálogo real, UX textual sin imágenes, adicionales, availability, draft exclusivamente no enviado, notas, cantidades, total visual, payload exacto, respuesta backend real, separación de Enviadas, double-submit, reconciliación ambigua, redirect operacional seguro, feedback de una sola vez, responsive y regresión de Mesas. El create y cleanup reales de Production están documentados sin atribuir al entorno remoto la prueba local del nuevo redirect. Queda lista para revisión humana, commit, push, PR y merge.
