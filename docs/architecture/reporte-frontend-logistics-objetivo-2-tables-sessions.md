# Reporte — Frontend Logistics Objetivo 2: Mesas y sesiones

## Resultado

**FRONTEND OBJETIVO 2 — PASS — CERTIFICADO.** La pantalla Mesas consume los contratos REST reales del backend, representa los 18 puntos y sus estados, respeta capabilities, abre atenciones con confirmación, resuelve concurrencia mediante refetch, consulta el detalle básico y libera únicamente a través de la operación segura del backend. La validación contractual local se completó con mocks y el flujo mutante fue confirmado posteriormente mediante un smoke humano real y controlado contra Production.

## 1. Rama

- Rama: `feat/logistics-tables`.
- No se creó ni cambió de rama.

## 2. HEAD inicial

- HEAD: `feefacef93a1daff194cbbed496b5eac808f5ce6`.
- Punto de partida: merge del Frontend Objetivo 1 certificado.
- Working tree inicial: limpio.

## 3. Scope

Se modificó únicamente `apps/logistics` y se creó este reporte. La Foundation del Objetivo 1 se conservó: no se rediseñaron Auth, Home, shells, identidad ni geometría física.

## 4. Contratos backend inspeccionados

Se leyeron completos:

- `service-points.routes.ts` y `service-sessions.routes.ts`.
- `service-points.controller.ts`.
- `service-points.service.ts`.
- `service-points.schemas.ts`.
- `service-points.types.ts`.
- `service-points.repository.ts`.
- `apps/api/src/app.ts`.
- `apps/api/src/authorization/capabilities.ts`.

También se comprobó el envelope público de errores y la operación RPC de release únicamente para mapear correctamente respuestas; no se modificó backend, SQL ni Supabase.

## 5. Tipos frontend

`tables-types.ts` replica sólo el contrato público necesario:

- `ServicePointType`.
- `ActiveServiceSessionStatus`.
- `ServiceSessionStatus`.
- `ActiveServiceSession`.
- `ServicePointStatus`.
- `ServiceSessionDetail`.
- `ReleasedServiceSession`.
- envelopes de status, detalle y release.

No se usa `any`, no se importan tipos runtime desde backend y no se acopla el bundle frontend a `apps/api`.

## 6. Service points API

`tables-api.ts` concentra las operaciones:

- `GET /api/logistics/service-points/status`.
- `POST /api/logistics/service-points/:id/open`.
- `GET /api/logistics/sessions/:id`.
- `POST /api/logistics/sessions/:id/release`.

Cada llamada obtiene el access token vigente desde el lifecycle Auth y usa el `apiRequest` central. No hay UUID hardcodeados ni retries automáticos.

## 7. Service point status

El plano se construye exclusivamente con `GET /service-points/status`. La respuesta del backend sustituye todos los estados `Sin sincronizar`. Se muestra una advertencia segura si el backend entrega una cantidad distinta de los 18 puntos esperados, sin inventar datos faltantes.

## 8. Session detail

Al seleccionar una atención activa, `Ver atención` consulta el `session.id` real. El detalle muestra únicamente:

- punto;
- status;
- `openedAt`;
- `openedBy.fullName`;
- `openedBy.role`.

No se muestran totales, comandas, ítems, pagos ni consumo inexistentes en el contrato.

## 9. Permisos

- `tables.view` permite abrir el módulo y consultar estados/detalles.
- `tables.operate` habilita la confirmación de apertura en puntos libres.
- `tables.release` habilita la acción de liberación desde un detalle activo.
- El backend continúa siendo la autoridad final para cada operación.

## 10. Modo read-only

Un usuario con `tables.view` sin `tables.operate`:

- ve los estados reales;
- puede abrir el detalle de un punto ocupado;
- no puede abrir puntos libres;
- no ve liberación si tampoco tiene `tables.release`.

La batería local confirmó que los libres quedan deshabilitados, los ocupados siguen consultables y el detalle no expone acciones operacionales.

## 11. Mapping de estados

- `isActive === false` → `INACTIVA`.
- `activeSession === null` → `LIBRE`.
- `activeSession.status === OPEN` → `ABIERTA`.
- `activeSession.status === AWAITING_PAYMENT` → `PENDIENTE DE PAGO`.

Cada estado utiliza color y texto. En compact, `Pendiente de pago` se abrevia como `Pend. pago` sin perder significado.

## 12. Puntos inactivos

Permanecen visibles en la geometría física con borde discontinuo, tono neutral, texto `Inactiva`, control deshabilitado y sin posibilidad de apertura.

## 13. Open flow

Un punto libre con permiso operacional abre un dialog. Al confirmar se ejecuta un único `POST /service-points/:id/open`; la UI muestra busy localizado y conserva visibles los demás puntos. Tras la respuesta siempre se intenta refetch de status.

## 14. Confirmación

No existe apertura con un solo tap. El dialog pregunta `¿Deseas abrir …?` y ofrece Cancelar/Abrir. Escape, backdrop, botón cerrar, focus trap y retorno de foco están implementados.

## 15. NO_OPEN_SHIFT

`NO_OPEN_SHIFT` se presenta como `No existe un turno abierto.` dentro del dialog. No se inicia un turno ni se navega automáticamente a otro módulo.

## 16. Concurrency / occupied

Para `409 SERVICE_POINT_OCCUPIED`:

1. no se reintenta el POST;
2. se consulta status nuevamente;
3. se representa la atención activa devuelta por backend;
4. se informa que otro usuario abrió el punto.

`SESSION_STATE_CONFLICT`, `SERVICE_SESSION_CHANGED` y sesiones desaparecidas también provocan refetch, sin ocultar el conflicto.

## 17. Release

La liberación usa exclusivamente `POST /sessions/:id/release`. La UI advierte que sólo puede liberar una atención sin consumo. No presume que una sesión `OPEN` sea liberable: el backend/RPC decide las invariantes.

## 18. Reason validation

El motivo se trimea, es obligatorio y admite como máximo 500 caracteres. Existe validación cliente, contador visible y validación backend final. Los rechazos por consumo o ítems pendientes se traducen a mensajes operacionales seguros.

## 19. Refetch strategy

- carga inicial REST;
- retry manual;
- botón Actualizar;
- refetch al recuperar visibilidad de la pestaña;
- refetch después de open y release;
- refetch después de conflictos relevantes.

No hay polling, `setInterval`, cache optimista ni actualización local que pretenda sustituir al backend. Si una mutación pasa pero el refetch falla, se informa expresamente y se solicita actualización manual.

## 20. Realtime

No implementado. No se añadieron canales, subscriptions, SQL o lógica Supabase Realtime.

## 21. Diseño Salón preservado

La disposición permanece exactamente:

- fila superior: `6, 5, 4, 3, 2, 1`;
- inferior: `7, B4, B3, B2, B1`.

La geometría se resuelve centralmente por nombre/tipo/sortOrder; los IDs operacionales siempre provienen del backend.

## 22. Llevar preservado

`LL1–LL7` conserva las siete tarjetas verticales y su orden físico. La prueba local confirmó los siete identificadores reales en la vista Llevar.

## 23. Compact shell

- 844×390: 11 puntos de Salón, estados visibles, toolbar compacta y sin overflow global.
- 667×375: documento de 667 px, viewport del plano de 655 px y contenido de 780 px; el scroll horizontal queda localizado.
- Los status badges permanecen visibles también en compact.
- El dialog de atención ocupó 209 px de alto dentro de un viewport de 390 px.

Para emular teléfono coarse en el navegador desktop se retiró temporalmente sólo la condición `pointer: coarse`; la media query original fue restaurada antes de las validaciones finales.

## 24. Accessibility

- Cada punto es un `button` con label de acción y estado.
- Estados no dependen sólo del color.
- Dialogs con `role=dialog`, `aria-modal`, título/descripción asociados y `aria-busy`.
- Focus trap, Escape, backdrop y retorno de foco.
- Loading/error/notice usan `role=status`, `role=alert` y `aria-live` según corresponde.
- Inputs exponen estado inválido y descripción asociada.
- Acciones busy se deshabilitan y existe lock síncrono adicional contra doble submit.

## 25. Errores

Se mapearon mensajes seguros para:

- `SERVICE_POINT_NOT_FOUND`;
- `SERVICE_POINT_INACTIVE`;
- `SERVICE_POINT_OCCUPIED`;
- `NO_OPEN_SHIFT`;
- `SESSION_NOT_FOUND` / `SERVICE_SESSION_NOT_FOUND`;
- `INVALID_SESSION_TRANSITION`;
- `SESSION_STATE_CONFLICT` / `SERVICE_SESSION_CHANGED`;
- invariantes de release;
- 401, 403, 404, 409, 429, 5xx, network y configuración.

Un 401 entrega el control al lifecycle Auth mediante logout. No se muestran errores raw ni stack traces.

## 26. Lint

`npm run lint`: PASS.

## 27. Typecheck

`npm run typecheck`: PASS con strict TypeScript y sin `any`.

## 28. Build

`npm run build`: PASS con Next.js 16.3.2 y Webpack; 14 páginas estáticas generadas. Se conservaron `--webpack` y `experimental.useTypeScriptCli: false` sin reinvestigarlos.

## 29. Audit

`npm audit`: PASS; 0 vulnerabilidades.

## 30. Tests

Se añadió una suite focalizada con `node:test`, sin framework adicional. Cubre:

- LIBRE, OPEN, AWAITING_PAYMENT e INACTIVA;
- capability read-only;
- orden físico de Salón;
- trim/requerido/máximo del release reason;
- `NO_OPEN_SHIFT`, conflictos, network y rate limit.

La protección de doble submit se implementa en dos niveles: `disabled/loading` y un lock síncrono con `useRef`, que evita dos POST incluso antes del siguiente render.

## 31. Smoke local

Se utilizó un backend mock efímero con los 18 contratos de status y sesiones. Pasaron:

- carga de 18 puntos;
- estados libre/abierta/pendiente/inactiva;
- apertura confirmada y refetch;
- detalle con session ID real del fixture;
- motivo obligatorio;
- release y retorno a libre;
- `NO_OPEN_SHIFT`;
- conflicto occupied con refetch;
- modo read-only;
- Salón y Llevar;
- 1440×900, 1024×768, 844×390 y 667×375;
- 0 errores/warnings de aplicación en la sesión Webpack final.

El bypass Auth visual, el mock, los cambios de breakpoint y los artefactos generados se retiraron antes de build/lint/typecheck.

## 32. Smoke remoto

El smoke humano real y controlado contra Production fue ejecutado exitosamente. Para realizarlo se habilitó temporalmente localhost en CORS; al finalizar se retiró nuevamente y Production volvió a su configuración cerrada.

Evidencia confirmada:

- login real: PASS;
- status Production real y sincronización de los 18 puntos: PASS;
- estados reales renderizados: PASS;
- `NO_OPEN_SHIFT` real, presentado correctamente antes de abrir el turno controlado: PASS;
- apertura de turno controlado con caja inicial en cero: PASS;
- selección de Mesa 1 libre y confirmación de apertura: PASS;
- open real y transición Mesa 1 `LIBRE → ABIERTA`: PASS;
- detalle real obtenido mediante el `session.id` devuelto por backend, incluidos `openedAt`, `openedBy` y role reales: PASS;
- release real con el motivo `Smoke test Frontend Objetivo 2`, ejecutado mediante backend/RPC seguro: PASS;
- refetch real posterior al release: PASS;
- retorno de Mesa 1 `ABIERTA → LIBRE`, confirmado también mediante refresh: PASS;
- turno controlado cerrado y ausencia posterior de turno abierto: PASS;
- Production limpia al finalizar, sin mesa de smoke ocupada: PASS;
- CORS localhost retirado nuevamente: PASS.

No se registran credenciales, tokens, IDs sensibles ni valores del entorno en esta evidencia.

## 33. Cambios explícitamente no realizados

- Backend, endpoints o contratos.
- `apps/client` o `packages/shared`.
- Supabase remoto, SQL, migrations, RPC o RLS.
- Realtime.
- Comandas, productos, adicionales, Cocina/Bebidas.
- Transferencias, cancelaciones, checkout o pagos.
- Transiciones `await-payment` / `reopen`: se representan sus estados, pero su UX queda para el módulo que gestione pago.
- Estado de mesas completo, PWA o deploy.
- Commit, push o merge.

## 34. Riesgos

- Riesgo aceptado: la vista revalida al volver a foco, pero todavía no usa Realtime porque pertenece a un objetivo posterior. Otro dispositivo puede cambiar un estado mientras esta pestaña permanece visible; el botón Actualizar y los refetch post-mutation reducen el riesgo hasta esa fase.

## 35. Siguiente objetivo recomendado

`FRONTEND OBJETIVO 3 — COMANDAR`.

No se inició en esta ejecución.

## 36. Conclusión

**FRONTEND OBJETIVO 2 — MESAS FUNCIONALES + SERVICE SESSIONS — PASS — CERTIFICADO.**

Los 18 puntos y sus estados reales son representables; read-only, apertura confirmada, protección de doble submit, concurrencia, `NO_OPEN_SHIFT`, detalle, release seguro y refetch están implementados y confirmados por la regresión local y el smoke humano real contra Production. El turno controlado quedó cerrado, la mesa volvió a `LIBRE`, Production quedó limpia y localhost fue retirado nuevamente de CORS.

Listo para revisión humana, commit, push, PR y merge. El siguiente objetivo es `FRONTEND OBJETIVO 3 — COMANDAR`; no se inició en esta ejecución.
