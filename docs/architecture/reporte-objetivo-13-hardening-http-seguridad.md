# Objetivo 13 — Reporte de hardening HTTP y seguridad

Fecha local de cierre: 2026-08-31 (America/Lima).

## Ajustes de revisión humana final

- **Orden de rate limiting:** request context → Helmet → CORS → health/no-store → limiter global → limiter login IP → validación Content-Type → parser JSON → limiter login username. Así, CORS y `Cache-Control: no-store` alcanzan los 429 privados, `/health` queda fuera, OPTIONS sigue excluido, y JSON malformado consume tanto el límite global como el límite de login por IP antes de llegar al parser.
- **P0001 exacto:** después de `trim`, el mensaje completo debe cumplir `^[A-Z][A-Z_]+$` y pertenecer a la allowlist. Mensajes como `CHECKOUT_CHANGED unexpected internal detail`, texto alrededor de un código o el formato heredado `CODE: detalle` devuelven 500 con `operationCode` sanitizado.
- **Defaults CORS locales:** development/test sin configuración explícita admite `localhost` y `127.0.0.1` en puertos 3000 y 3002. Production no cambió y continúa fail-closed.

## 1–5. Estado inicial, baseline y auditoría HTTP

1. **Rama:** `feat/logistics-backend-foundation`.
2. **HEAD inicial:** `6bb32cef1a4864699bbf6273f9028e4d622c8610` (`6bb32ce feat: add stale checkout protection`).
3. **Estado inicial:** worktree limpio; `git diff --check` sin errores; CHECKOUT_CHANGED ya estaba cerrado en Git. No se encontró trabajo local inesperado.
4. **Baseline anterior a la implementación:** typecheck PASS; unitarias `115/115`; compile PASS; E2E `1/1`; concurrencia `9/9`; Realtime `1/1` con exactamente `33` broadcasts; CHECKOUT_CHANGED `14/14`. Los resets fueron exclusivamente contra Supabase local. Un `listen EPERM` observado al lanzar procesos/socket IPC dentro del sandbox fue reproducido como restricción del entorno; la misma suite autorizada fuera del sandbox pasó sin cambios de producción.
5. **Auditoría HTTP inicial:** Express tenía `express.json({ limit: "100kb" })`, CORS con fallback fail-open `*`, allowlist CORS incompleta (`GET`, `POST`, `OPTIONS`), `health` público, catálogo público y rutas privadas bajo `/api/logistics`. El inventario de routers confirmó métodos explícitos `GET`, `POST` y `PATCH`, además de `HEAD` implícito para GET y `OPTIONS` para preflight. El error handler ya devolvía JSON, pero el logger podía incluir mensajes/cause/hints externos sin una allowlist segura. El login ya mantenía una respuesta pública común para usuario inexistente, contraseña incorrecta y cuenta inactiva.

## 6–11. Archivos, dependencias, CORS y headers

6. **Archivos modificados:** `apps/api/.env.example`, `apps/api/package.json`, `apps/api/package-lock.json`, `apps/api/src/app.ts`, configuración de CORS/environment, mapper de errores RPC, logger, error middleware, tipo Express y la prueba heredada `apps/api/src/tests/objective11.test.ts` para alinearla con el contrato P0001 exacto. Se añadieron middleware de seguridad HTTP, rate limiting, request context y `apps/api/src/tests/security-hardening.test.ts`, además de este reporte.
7. **Dependencias añadidas:** únicamente `helmet@8.3.0` y `express-rate-limit@8.7.0`, instaladas de forma normal. No se realizó upgrade masivo ni se inició el checkpoint de auditoría profunda de dependencias.
8. **CORS final:** `createCorsOptions` usa configuración validada. Separa origins por coma, aplica trim, elimina duplicados y sólo acepta origins HTTP/HTTPS sin credenciales, path, query ni hash. Requests sin `Origin` siguen operativas. `credentials` permanece deshabilitado porque la API usa Bearer token y no requiere cookies cross-site.
9. **Origins en production:** `CORS_ALLOWED_ORIGINS` es obligatorio; falta, lista vacía, origin inválido o wildcard producen fallo de configuración al startup nombrando sólo la variable. No existe fallback wildcard. Development/test usan por defecto explícito `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:3002` y `http://127.0.0.1:3002`; un wildcard sólo puede configurarse explícitamente fuera de production.
10. **Métodos CORS:** `GET`, `HEAD`, `POST`, `PATCH`, `OPTIONS`, derivados del inventario real. Headers permitidos: `Authorization` y `Content-Type`. Preflight PATCH y OPTIONS están cubiertos por pruebas.
11. **Security headers:** Helmet se aplica globalmente; están presentes `X-Content-Type-Options`, protección de framing y `Referrer-Policy`; `X-Powered-By` se deshabilita explícitamente. HSTS se activa sólo en production, con `max-age=31536000` e `includeSubDomains`, y queda apagado en HTTP local. CSP se deshabilitó deliberadamente: este servicio entrega JSON, no una aplicación HTML, y no necesita una política de recursos de navegador.

## 12–21. Parsing, request context, logging y errores

12. **Body limit:** `JSON_BODY_LIMIT` conserva default seguro `100kb`, acepta unidades `b`, `kb` o `mb`, y se valida entre 1 KiB y 1 MiB. Un body real superior al límite devuelve HTTP 413, `PAYLOAD_TOO_LARGE`, sin stack ni texto interno de body-parser.
13. **JSON malformado:** `entity.parse.failed` se normaliza a HTTP 400, `INVALID_JSON`, con mensaje público estable; no expone `SyntaxError`, posición, body recibido ni stack.
14. **Content-Type:** sólo `POST`/`PATCH` que efectivamente llevan body exigen `application/json` o `application/*+json`. Tipo incorrecto devuelve HTTP 415, `UNSUPPORTED_MEDIA_TYPE`. GET, HEAD, OPTIONS y POST sin body no son bloqueados.
15. **Request IDs:** cada request recibe un UUID v4 generado con `crypto.randomUUID()`. Siempre se responde `X-Request-ID`; el valor entrante de `X-Request-ID` se ignora y dos requests producen IDs distintos. No se cambió el contrato de los bodies existentes.
16. **Logging:** logger JSON mínimo sobre stdout/stderr en development/production. Cada respuesta completada registra `timestamp`, `requestId`, `method`, `pathname` sin query, `status` y `durationMs`. Los errores registran además código y tipo interno seguro. En tests el logger por defecto es silencioso, pero el mismo middleware permanece activo y las pruebas inyectan un logger de captura.
17. **Redacción de secretos:** los registros sólo aceptan valores primitivos seleccionados por código. No se registran headers, Authorization, cookies, query completa, body, username, password, email de auth, JWT/tokens, notas, datos de pago, checkoutToken, environment, claves Supabase, mensajes PostgreSQL ni cause. Las pruebas usan valores sensibles conocidos y verifican que no aparezcan en logs ni respuestas.
18. **AppError:** conserva su status, código y mensaje público. Sólo `VALIDATION_ERROR` puede incluir una proyección limitada de `fields.path`/`fields.message`; `cause` y detalles arbitrarios nunca se serializan.
19. **Error desconocido:** devuelve HTTP 500, `INTERNAL_SERVER_ERROR` y `Ocurrió un error interno.`. Nunca retorna stack, cause, SQLSTATE, mensaje PostgreSQL/Supabase, rutas del filesystem, environment ni tokens.
20. **Allowlist P0001:** la allowlist canónica se deriva de las claves reales de `publicMessages`, evitando duplicar el catálogo. Sólo se acepta el mensaje completo tras `trim` si cumple `^[A-Z][A-Z_]+$`. P0001 conocidos preservan sus mappings: `ACTOR_INVALID` 403, not-found 404, inputs inválidos 400 y conflictos 409; `CHECKOUT_CHANGED`, `SHIFT_NOT_OPEN` y `PAYMENT_ALREADY_EXISTS` mantienen su semántica pública.
21. **P0001 desconocido:** P0001 con token no soportado, sin token exacto, con texto alrededor de un código conocido, malformado y errores no-P0001 pasan a HTTP 500 sanitizado. Se conserva el `operationCode` suministrado por la operación y el cause sólo queda disponible internamente; nunca se convierte un código desconocido o parcialmente extraído en 409.

## 22–30. Rate limiting, proxy, cache, environment y auth

22. **Rate limit global:** limiter en `/api` con store en memoria, ventana default `60000 ms` y máximo `600`, configurables y acotados. Se ejecuta antes de la validación Content-Type y del parser JSON, de modo que requests malformadas no lo evaden. CORS y `no-store` privados se ejecutan antes del limiter. Excluye OPTIONS y `/health` queda fuera. Al exceder devuelve HTTP 429, `RATE_LIMITED`, mensaje público, headers estándar draft-8 y `Retry-After`; no emite headers legacy.
23. **Login por IP:** limiter independiente en `POST /api/logistics/auth/login`, default `30` intentos fallidos por `900000 ms`, con soporte IPv6 de la librería. Se ejecuta antes del body parser, por lo que JSON malformado consume la cuota y termina en `AUTH_RATE_LIMITED` al excederla. Devuelve 429 sin indicar si el usuario existe.
24. **Login por username:** segundo limiter independiente, default `10` intentos fallidos por `900000 ms`, colocado después de `express.json` porque requiere `req.body`. La key usa SHA-256 del username con `trim().toLowerCase()`; no contiene ni registra username/password. Input ausente, no-string o vacío comparte una key constante segura. Ambos limiters de login usan `skipSuccessfulRequests`: un login exitoso no consume la cuota antifuerza-bruta, mientras fallos de credenciales/validación sí la consumen.
25. **Limitación serverless:** los tres contadores son best-effort por proceso/instancia. En Vercel no garantizan un contador global entre instancias, no reemplazan límites de Supabase Auth, plataforma/WAF ni un shared store. Redis, tabla Supabase y arquitectura distribuida quedaron explícitamente fuera de este checkpoint y pendientes de Production Readiness si el riesgo lo exige.
26. **Trust proxy:** `TRUST_PROXY` sólo acepta `false` o `loopback`, con default seguro `false`; no se permite `true` ni `1` a ciegas. Con proxy deshabilitado, `req.ip` conserva la conexión directa y un `X-Forwarded-For` enviado por cliente no controla la key. La topología final de Vercel queda pendiente para Production Readiness.
27. **Cache-Control privado:** `/api/logistics` y `/api/auth` reciben `Cache-Control: no-store`, incluidas respuestas de auth. El catálogo público `/api/categories` y `/api/products` conserva una política separada y no recibe `no-store` por esta regla.
28. **Environment:** Zod valida al startup `NODE_ENV`, `PORT`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`, `JSON_BODY_LIMIT`, límites global/login y `TRUST_PROXY`. Production exige Supabase HTTPS y CORS explícito. Los secretos sólo se validan por presencia/formato mínimo; los errores listan nombres de variables, nunca valores. `.env.example` fue actualizado y `.env` no fue tocado.
29. **Enumeración/login:** username inexistente, contraseña incorrecta y cuenta inactiva mantienen la misma respuesta pública `INVALID_CREDENTIALS`; no se expone `auth_email`, respuesta raw de Supabase ni claves. La validación de un token de un actor que se vuelve inactivo conserva el código de negocio preexistente `ACCOUNT_INACTIVE`; no se rediseñó Auth.
30. **API 404:** una ruta inexistente termina en HTTP 404 JSON con código estable `ROUTE_NOT_FOUND`; no cae en el HTML default de Express y no rompe rutas existentes.

## 31–39. Cobertura y regresión final

31. **Hardening tests:** suite dedicada de `25/25` pruebas, sin esperas temporales largas. Cubre headers, CORS, PATCH/OPTIONS/no-Origin, JSON/+json, 413, 400, 415, IDs, logs, sanitización, 404, cache, limiters global/IP/username, JSON malformado contado antes del parser, CORS/no-store en 429 temprano, trust proxy, anti-enumeración, P0001 conocido/exacto/desconocido y configuración production simulada.
32. **Typecheck final:** PASS.
33. **Unit tests finales:** `140/140` PASS en 20 suites: las `115/115` existentes más `25/25` de hardening.
34. **Compile final:** PASS.
35. **E2E final:** `1/1` PASS.
36. **Concurrencia final:** `9/9` PASS; invariantes A–H sin cambios de cardinalidad ni semántica.
37. **Realtime final:** `1/1` PASS con exactamente `33` broadcasts: SHIFT_CHANGED 2, TABLES_CHANGED 7, ORDERS_CHANGED 7, kitchen PREPARATION_CHANGED 4, drinks PREPARATION_CHANGED 4, CATALOG_CHANGED 4 y FINANCE_CHANGED 5.
38. **CHECKOUT_CHANGED final:** `14/14` PASS; token canónico, stale/rollback, doble pago y carreras conservaron sus invariantes.
39. **git diff --check:** PASS antes y después del reporte; también se verificaron los archivos nuevos no rastreados para whitespace final.

## 40–42. Alcance y deuda restante

40. **Cambios remotos:** NO. No se ejecutó `db push`, deploy, commit, push ni merge.
41. **Cambios SQL:** NO. No se modificaron migraciones, schema, RPCs, triggers, RLS, Realtime SQL, datos remotos ni `packages/shared/database.types.ts`. Tampoco se modificaron `apps/client`, `apps/logistics` ni frontend.
42. **Deuda restante del Objetivo 13:** readiness profunda de DB, estrategia global de timeouts/AbortController, validación de topología Vercel y `trust proxy`, decisión de rate limiting distribuido/WAF/shared store, auditoría final npm/dependencias, despliegues, monitoreo externo y observabilidad distribuida. Ninguno de esos bloques se inició.

## Criterio final

- CORS FAIL-CLOSED PROD / NO WILDCARD PROD ✅
- PATCH / OPTIONS / REQUEST SIN ORIGIN ✅
- HELMET / HSTS PROD / X-POWERED-BY OFF ✅
- BODY LIMIT 413 / JSON 400 / CONTENT-TYPE 415 ✅
- REQUEST ID / LOGGING ESTRUCTURADO / NO SECRET LOGGING ✅
- ERRORES DESCONOCIDOS SANITIZADOS ✅
- P0001 CONOCIDOS SIN CAMBIO / DESCONOCIDO A 500 ✅
- RATE LIMIT GLOBAL / LOGIN IP / LOGIN USERNAME ✅
- LIMITACIÓN SERVERLESS DOCUMENTADA ✅
- TRUST PROXY SAFE / PRIVATE NO-STORE ✅
- ENV VALIDATION / AUTH RESPONSE SAFE / JSON 404 ✅
- NO SQL / NO REMOTE / REGRESIÓN COMPLETA ✅
