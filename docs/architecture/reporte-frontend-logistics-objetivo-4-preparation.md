# Reporte — Frontend Logistics Objetivo 4: Pedidos + Cocina + Bebidas

## Resultado

**FRONTEND OBJETIVO 4 — PEDIDOS + COCINA + BEBIDAS — PASS — CERTIFICADO.** `/pedidos` dejó de ser placeholder y ahora ofrece colas operativas de Cocina y Bebidas sobre los contratos REST existentes. La interfaz distingue `PENDING`, `PREPARING` y `READY`; ejecuta únicamente la transición siguiente; protege cada ítem contra doble envío; y después de toda escritura vuelve a consultar la cola antes de adoptar el estado. No se implementaron polling, Realtime ni autoridad optimista. El smoke humano Production confirmó los flujos reales completos y su cleanup seguro.

## 1. Rama

- Rama existente: `feat/logistics-preparation`.
- No se creó ni cambió de rama.

## 2. HEAD inicial

- HEAD inicial: `9964f1b27e77c81a700d0ced7a8ff4d7cedf0adf`.
- Corresponde a `Merge Frontend Logistics Objetivo 3 — ordering workflow`.
- Working tree inicial: limpio.

## 3. Scope

Se modificó exclusivamente `apps/logistics` y se creó este reporte. Backend, cliente público, packages compartidos, Supabase remoto, SQL, migrations, RPC, RLS, Vercel y `main` permanecieron intactos. No hubo commit, push, merge ni deploy.

## 4. Contratos backend

Se leyeron completos, en modo de solo lectura, los routes, controller y service de `preparation`; routes, controller, service, repository, types y middleware de capabilities por ítem de `orders`; y el mapeo de errores RPC. El backend ya expone todo lo requerido y no necesitó cambios.

Contratos consumidos:

- `GET /api/logistics/preparation/kitchen`;
- `GET /api/logistics/preparation/drinks`;
- `POST /api/logistics/order-items/:orderItemId/start`;
- `POST /api/logistics/order-items/:orderItemId/ready`;
- `POST /api/logistics/order-items/:orderItemId/deliver`.

## 5. `/pedidos`

La ruta conserva el guard de capability y monta `PreparationView`. Incluye selector de estación, actualización manual, fecha de última sincronización, mensajes operativos, tres grupos de estado y estados de carga, error y cola vacía.

## 6. Kitchen

Cocina consulta exclusivamente su endpoint real y filtra defensivamente por `preparationStation === "KITCHEN"`. El tab aparece sólo si el usuario puede ver o gestionar Cocina.

## 7. Drinks

Bebidas consulta exclusivamente su endpoint real y filtra defensivamente por `preparationStation === "DRINKS"`. El tab aparece sólo si el usuario puede ver o gestionar Bebidas.

## 8. Capabilities view

`orders.kitchen.view` y `orders.drinks.view` habilitan lectura únicamente en su estación. El smoke read-only confirmó que las tarjetas siguen visibles y no se renderiza ningún botón mutante.

## 9. Capabilities manage

`orders.kitchen.manage` y `orders.drinks.manage` habilitan la acción correspondiente a la estación. La decisión se toma por capability, no por rol hardcodeado; el backend conserva la autorización final por ítem.

## 10. Queue response

Los tipos frontend reflejan la respuesta real: datos del `orderItem`, `additions`, `order`, `session` y `servicePoint`. La UI usa el ID de `orderItem` para transiciones, el `sequenceNumber` backend para la comanda y los nombres ya resueltos por el backend. No importa runtime desde `apps/api` y no introduce `any`.

## 11. Status grouping

La cola se agrupa en `Pendientes`, `Preparando` y `Listos`. Cada grupo usa un filtro estable, por lo que conserva dentro del estado el orden entregado por backend (`sentAt` y `lineNumber`, ordenados allí). El estado se expresa con texto, contador y señal visual; no depende sólo del color.

## 12. Transitions

La acción siguiente es estricta:

- `PENDING` → `start` → `PREPARING`;
- `PREPARING` → `ready` → `READY`;
- `READY` → `deliver` → `DELIVERED` y desaparición de la cola activa.

No existe control para saltar estados ni modal intermedio.

## 13. Double-submit

Cada botón queda disabled/loading durante su solicitud y `runWithItemLock` aplica además un lock síncrono por `orderItemId`. El doble toque del smoke generó un único POST.

## 14. Concurrency

Los locks son por ítem: operar uno no bloquea el resto de la cola. Un 404, 409 o código de transición concurrente no repite el POST; fuerza una sola lectura de la estación y adopta la realidad devuelta por backend.

## 15. Ambiguous writes

Ante red o 5xx, el frontend no reintenta la escritura. Ejecuta una sola lectura de reconciliación y clasifica el resultado como aplicado, sin cambios o cambiado por otro actor. Si sigue igual, permite un nuevo intento únicamente después de que la persona revise el aviso; si la lectura también falla, exige actualizar antes de decidir.

## 16. Refetch

Hay GET inicial, GET manual, GET al recuperar visibilidad, GET tras transición confirmada y GET de reconciliación tras conflictos o fallos ambiguos. Las solicitudes obsoletas al cambiar de tab se descartan. No hay polling.

## 17. REST authority

No existe movimiento optimista entre columnas. Incluso después de HTTP 200, la UI sólo adopta el nuevo estado tras el GET autoritativo. Si el POST fue aceptado pero el refetch falla, conserva la cola anterior y muestra una instrucción segura para actualizar.

## 18. Notes

Las notas reales se muestran completas, con wrapping, etiqueta textual y contraste específico. No se truncan ni se reconstruyen en frontend.

## 19. Additions

Las adiciones se preservan en el orden del response y muestran `quantityPerItem × additionName`. La vista no calcula precios ni modifica su semántica.

## 20. Elapsed time

El tiempo transcurrido se calcula desde `order.sentAt`, nunca desde timestamps de transición. Presenta `Ahora`, minutos, horas o días y usa un fallback seguro si la fecha no es válida.

## 21. Empty states

Una estación completamente vacía muestra `No hay pedidos pendientes en Cocina/Bebidas` con actualización manual. Cada columna vacía dentro de una cola activa muestra `Sin ítems` sin ocultar los otros estados.

## 22. Errors

Se mapean de forma operacional `ORDER_ITEM_NOT_FOUND`, cancelaciones y transiciones inválidas/no permitidas, además de 401, 403, 404, 409, 429, red, configuración y 5xx. No se exponen mensajes raw, stacks, credenciales ni datos sensibles.

## 23. Responsive

- 1440×900: tres columnas amplias, sin overflow de documento.
- 1024×768: tres columnas legibles, documento exactamente del ancho del viewport.
- 844×390: Compact Operational Shell completo, tres estados visibles y altura contenida.
- 667×375: Compact Operational Shell con tablero de 780 px y scroll horizontal localizado; documento de 667 px.
- 390×844: `LandscapeGate` visible, shell operacional ausente y documento de 390 px.

La emulación visual retiró temporalmente sólo la condición `pointer: coarse` necesaria para representar los breakpoints móviles en el navegador desktop; las condiciones originales fueron restauradas.

## 24. Compact shell

El header compacto muestra `K · Pedidos`, tabs Cocina/Bebidas y menú de usuario. El tablero utiliza todo el alto restante, mantiene scroll vertical dentro de cada estado y horizontal sólo alrededor de las columnas. No usa `scale()` ni tipografía miniatura.

## 25. Accessibility

Se conservaron botones semánticos, focus visible, navegación por teclado, `aria-live`, `aria-busy`, labels para estación y colas, status textual y estados disabled. Tras refetch se intenta conservar el foco en la acción siguiente del mismo ítem; si el ítem desaparece, el aviso vivo comunica el resultado.

## 26. Tests

`npm run test:preparation`: PASS, 34/34. Cubre agrupación y orden, separación de estaciones, additions, notes, identidad visible, capabilities view/manage, acciones y destinos, elapsed time, límites exactos de antigüedad, fallback seguro, cola vacía, reconciliación, locks por ítem, éxito con refetch, 409 sin retry, red ambigua sin retry, errores ordinarios y fallos de refetch.

## 27. Tables regression

`npm run test:tables`: PASS, 5/5.

## 28. Ordering regression

`npm run test:ordering`: PASS, 35/35.

## 29. Lint

`npm run lint`: PASS.

## 30. Typecheck

`npm run typecheck`: PASS con TypeScript strict y sin `any` nuevo.

## 31. Build

`npm run build`: PASS con Next.js 16.3.2 y Webpack. `/pedidos` quedó incluida entre las 14 rutas estáticas. No se reinvestigaron Webpack ni TypeScript CLI.

## 32. Audit

`npm audit`: PASS; 0 vulnerabilidades.

## 33. Smoke local

Se utilizó un backend contractual efímero y un bypass Auth local sin credenciales, ambos retirados antes de la validación final. Pasaron:

- carga y separación de colas Kitchen/Drinks;
- Mesa 1 / comanda del fixture, cantidades, producto, additions, notes y elapsed time;
- Kitchen: `PENDING → PREPARING → READY → DELIVERED`, con desaparición posterior;
- Drinks: `PENDING → PREPARING → READY → DELIVERED`, con desaparición posterior;
- un doble toque en Drinks generó exactamente un POST;
- cada transición confirmó el nuevo estado mediante GET;
- read-only: 0 botones mutantes, tarjetas y etiquetas `Solo lectura` visibles;
- tabs acordes con capabilities;
- 1440×900, 1024×768, 844×390, 667×375 y 390×844;
- 0 errores o warnings de aplicación en consola.

Capturas generadas fuera del working tree: `/tmp/kuchis-preparation-1440x900.png`, `/tmp/kuchis-preparation-1024x768.png`, `/tmp/kuchis-preparation-844x390.png`, `/tmp/kuchis-preparation-667x375.png`, `/tmp/kuchis-preparation-readonly-1024x768.png` y `/tmp/kuchis-preparation-gate-390x844.png`.

## 34. Smoke humano Production ejecutado

El smoke humano real se ejecutó de forma controlada. Production comenzó sin turno `OPEN` y sin service sessions `OPEN` o `AWAITING_PAYMENT`. Localhost se habilitó temporalmente en CORS exclusivamente para esta validación y fue retirado nuevamente al finalizar.

Se abrió un turno controlado con `openingCash = 0`, se abrió Mesa 1 y se creó una única comanda real, Comanda #1, con:

- 1× Clásica, con Queso ×1;
- 1× Inca Kola 600 ml.

El backend separó correctamente Clásica en `KITCHEN` e Inca Kola 600 ml en `DRINKS`: PASS.

### Cocina — Production

La cola real mostró `Mesa 1 · Comanda #1`, 1× Clásica y Queso ×1. La UI real confirmó:

- `PENDING → Iniciar → PREPARING`: PASS;
- `PREPARING → Marcar listo → READY`: PASS;
- `READY → Entregar → DELIVERED`: PASS;
- desaparición del ítem de la cola activa después de `DELIVERED`: PASS.

### Bebidas — Production

La cola real mostró `Mesa 1 · Comanda #1` y 1× Inca Kola 600 ml. La UI real confirmó:

- `PENDING → Iniciar → PREPARING`: PASS;
- `PREPARING → Marcar listo → READY`: PASS;
- `READY → Entregar → DELIVERED`: PASS;
- desaparición del ítem de la cola activa después de `DELIVERED`: PASS.

### Autoridad backend

Una comprobación read-only posterior confirmó ambos ítems realmente en `DELIVERED`, con `preparingAt`, `readyAt` y `deliveredAt` reales: PASS.

### Cleanup Production

Después del smoke, ambos ítems fueron cancelados mediante el endpoint backend oficial, exclusivamente para limpiar Production:

- Clásica: `DELIVERED → CANCELLED`, `cancelledFromStatus = DELIVERED`: PASS;
- Inca Kola 600 ml: `DELIVERED → CANCELLED`, `cancelledFromStatus = DELIVERED`: PASS.

Posteriormente se confirmó:

- service session de Mesa 1 liberada;
- session status `CANCELLED`;
- Mesa 1 libre y `activeSession = null`;
- turno controlado cerrado;
- `GET /shifts/current` con `shift = null`.

Production terminó sin turno abierto, sin mesa del smoke ocupada, sin service session del smoke activa y sin consumo activo del smoke: PASS. Localhost fue retirado nuevamente de CORS: PASS.

No se registran UUIDs, tokens, contraseñas, credenciales ni valores de configuración local.

## 35. No-Realtime

No se añadió Realtime. La sincronización usa únicamente REST en los momentos documentados y no realiza polling.

## 36. Scope no implementado

No se implementaron Realtime, cancelaciones, transferencias, checkout, cobro, Estado de mesas completo, actualización de carta, turnos, gastos, cierre/cuadre, historial, usuarios ni Objetivo 5.

## 37. Riesgos

El riesgo residual aceptado es la ausencia de Realtime: una cola abierta puede quedar desactualizada hasta la próxima actualización manual, recuperación de visibilidad o reconciliación REST. Las escrituras ambiguas se mitigan sin retry automático, pero requieren decisión humana cuando backend continúa mostrando el estado original.

### MEJORA UX IMPLEMENTADA

La antigüedad visual se calcula en frontend desde `order.sentAt`: normal/verde antes de 10 minutos, amarillo desde 10 y antes de 15, naranja desde 15 y antes de 20, y rojo desde 20 minutos. Un único reloj local actualiza el cálculo cada 60 segundos, sin GET adicional, polling backend ni Realtime. Los tests de límites exactos, fallback de fecha y lógica compartida entre Kitchen y Drinks pasan; las transiciones operacionales permanecen intactas.

## 38. Siguiente objetivo

`FRONTEND OBJETIVO 5 — ESTADO DE MESAS + CORRECCIONES / TRANSFERENCIAS / CANCELACIONES`.

No se inició.

## 39. Conclusión

**FRONTEND OBJETIVO 4 — PEDIDOS + COCINA + BEBIDAS — PASS — CERTIFICADO.**

La implementación satisface colas reales de Cocina y Bebidas, capabilities view/manage, estados y transiciones estrictas, double-submit por ítem, concurrencia recuperable, reconciliación sin retry automático, autoridad REST, contenido operativo legible, accesibilidad, responsive y regresiones de Mesas y Comandar. El smoke humano Production confirmó la separación real `KITCHEN`/`DRINKS`, ambas cadenas completas hasta `DELIVERED`, la desaparición de las colas activas, la autoridad backend y el cleanup final. Production quedó limpia y CORS volvió a su configuración cerrada. Queda lista para revisión humana y posterior commit, push, PR y merge.
