# Objetivo 13 — Production Readiness local

Fecha: 2026-09-01. Alcance: validación local/integral de Production Readiness y checklist para operación remota posterior. No hubo acceso remoto, deploy ni cambios de infraestructura.

1. **Rama:** `feat/logistics-backend-foundation`.
2. **HEAD inicial:** `72bbf7cbe46e3225d668010a4932574a8d386cfa` (`72bbf7c feat: prepare logistics API for production`). Worktree inicial limpio y `git diff --check` PASS.
3. **Resumen de Parte A:** resolver central de client IP; confianza limitada en `x-forwarded-for` sólo bajo Vercel; limiters global/login-IP conectados al resolver; username limiter intacto; `TRUST_PROXY=false | loopback`; CORS production fail-closed; jerarquía de timeouts validada; MemoryStore documentado como best-effort por instancia; sin dependencias, SQL, remoto o frontend.
4. **Arquitectura client IP:** `resolveClientIp()` resuelve una identidad validada y `clientIpRateLimitKey()` la pasa por `express-rate-limit` `ipKeyGenerator(ip, 56)`, preservando protección IPv6.
5. **Detección Vercel:** `resolveDeploymentContext()` devuelve `isVercel=true` únicamente si la variable de sistema `VERCEL === "1"`. El contexto es inyectable en tests sin mutar `process.env`.
6. **Trust model de `x-forwarded-for`:** se consulta sólo en Vercel. Debe ser un único string que, tras `trim`, sea una IPv4 o IPv6 completa aceptada por `node:net.isIP`. Comas/listas, arrays, IP con puerto, texto, vacío o valores arbitrarios se rechazan. El header raw no se usa como key ni se registra.
7. **Fallback:** en Vercel, header ausente o inválido cae de forma conservadora a `req.ip`, luego `socket.remoteAddress` y finalmente `unknown-client`. Fuera de Vercel el header se ignora completamente y se usa ese mismo camino seguro Express/socket.
8. **`TRUST_PROXY`:** permanece limitado por Zod a `false | loopback`, default `false`. No se habilitó `true`, `1`, `2` ni se asumió una cantidad de hops.
9. **Global limiter:** conserva límites, códigos, headers estándar, handler, orden y exclusión de `OPTIONS`; usa el resolver central para la key.
10. **Login IP limiter:** conserva `AUTH_RATE_LIMITED`, límites y `skipSuccessfulRequests=true`; usa el resolver central para la key.
11. **Username limiter:** intacto. Mantiene `trim().toLowerCase()`, fallback `invalid-input`, SHA-256, `skipSuccessfulRequests=true` y nunca incluye password.
12. **Limitación MemoryStore:** contadores por instancia, no compartidos entre Functions, perdidos en reinicios y sin garantía de rate limiting global. Se acepta como defensa best-effort local/por instancia.
13. **Rate limit distribuido pendiente:** operación remota debe revisar Vercel Firewall/WAF/rate limiting disponible. No se añadió Redis, Upstash, DB, migration ni nueva infraestructura.
14. **Contrato de environment production:** `NODE_ENV=production`; `CORS_ALLOWED_ORIGINS` con origins finales exactos; `SUPABASE_URL` HTTPS; `SUPABASE_SECRET_KEY` únicamente server-side; `SUPABASE_REQUEST_TIMEOUT_MS=8000`; `READINESS_TIMEOUT_MS=2000`; `JSON_BODY_LIMIT=100kb`; `RATE_LIMIT_WINDOW_MS=60000`; `RATE_LIMIT_MAX=600`; `LOGIN_IP_WINDOW_MS=900000`; `LOGIN_IP_MAX=30`; `LOGIN_USERNAME_WINDOW_MS=900000`; `LOGIN_USERNAME_MAX=10`; `TRUST_PROXY=false`. `VERCEL=1` debe ser suministrado por la plataforma y `PORT` no debe definirse manualmente sin necesidad. Nunca copiar valores secretos a documentación o logs.
15. **CORS production:** missing o `*` falla al startup. Sólo origins completos exactos, separados por coma, sin path/query/hash, reflection, regex amplia ni substring. Incluir únicamente frontends realmente autorizados cuando existan dominios finales.
16. **Jerarquía de timeouts:** `READINESS_TIMEOUT_MS < SUPABASE_REQUEST_TIMEOUT_MS` está validado al startup; defaults 2000 ms < 8000 ms.
17. **Requisito `maxDuration`:** no existe configuración rastreada. La Function real debe permitir `maxDuration > SUPABASE_REQUEST_TIMEOUT_MS + margen` para abort upstream, manejo de error, sanitización y respuesta HTTP. Con el default debe superar 8000 ms más margen; no se fija un número sin conocer proyecto/plan real.
18. **Startup/serverless:** Express se exporta directamente; local ejecuta `app.listen()`, Vercel no. No existe servidor adicional, pool PostgreSQL propio, worker, background loop o shutdown complejo que añadir.
19. **Logging:** JSON estructurado con request ID, método, pathname sin query, status, duración y clasificación segura. Tests preservan request IDs y confirman ausencia de Authorization, JWT, password, secrets, bodies, errores Supabase raw y `x-forwarded-for` raw.
20. **Supabase Auth pendiente:** Security Advisor reportó Leaked Password Protection DISABLED. La operación remota debe comprobar plan/settings, habilitar si procede y revalidar login sin cambiar por accidente la política funcional de contraseñas.
21. **Realtime public access:** pendiente verificar remotamente que **Allow public access** esté OFF. No se accedió al Dashboard en esta validación.
22. **Typecheck:** PASS.
23. **Unitarias:** 177/177 PASS en 22 suites.
24. **Production-readiness:** 17/17 PASS dentro del total unitario.
25. **Readiness/timeouts:** 20/20 PASS dentro del total unitario.
26. **Hardening:** 25/25 PASS aislado. Se mantienen autenticación, códigos 429, `skipSuccessfulRequests`, username hashing, request ID, logging seguro, CORS, health y readiness.
27. **Compile:** PASS.
28. **E2E local:** 1/1 PASS (`real HTTP to PostgreSQL logistics lifecycle`).
29. **Concurrency local:** 9/9 PASS, invariantes A–H; no se añadieron retries.
30. **Realtime local:** 1/1 PASS (`real private Supabase Realtime logistics contract`).
31. **Broadcasts:** exactamente 33: `SHIFT_CHANGED=2`, `TABLES_CHANGED=7`, `ORDERS_CHANGED=7`, kitchen `PREPARATION_CHANGED=4`, drinks `PREPARATION_CHANGED=4`, `CATALOG_CHANGED=4`, `FINANCE_CHANGED=5`.
32. **CHECKOUT_CHANGED local:** 14/14 PASS.
33. **`git diff --check`:** PASS final. El reporte nuevo fue comprobado directamente para whitespace al final de línea.
34. **SQL/remoto/frontend:** NO. Sin migrations, SQL, RPC, RLS, Realtime SQL, `database.types.ts`, dependencias, `apps/client`, `apps/logistics`, `.env`, Supabase/Vercel remoto, `db push` o deploy.
35. **Cambios de código en Parte B:** ninguno. La revisión focalizada y regresión integral no demostraron bugs de Parte A; el único archivo nuevo es este reporte.
36. **Checklist remoto completo:** incluido en la sección siguiente; no fue ejecutado por Codex.
37. **Riesgos residuales:** rate limit no distribuido; identidad IP y comportamiento WAF pendientes de smoke test en Vercel real; `maxDuration` y Node runtime reales pendientes; origins finales pendientes; Runtime Logs no inspeccionados; Leaked Password Protection pendiente; Realtime public access pendiente. El cierre local no equivale a autorización de go-live.
38. **Conclusión local:** **PASS**. Código y contratos locales superan la regresión integral; la configuración y verificación remota quedan explícitamente fuera de scope.

## Checklist exacto para operación remota posterior

### Vercel

- [ ] Identificar inequívocamente el proyecto que despliega la API, no un frontend u otro servicio.
- [ ] Confirmar que el runtime Node configurado satisface `engines.node >=22`.
- [ ] Confirmar el `maxDuration` efectivo de la Function/entrypoint API y los límites del plan.
- [ ] Verificar la relación `maxDuration > SUPABASE_REQUEST_TIMEOUT_MS + margen`; con el default, superar 8000 ms dejando tiempo para abort, error handling, sanitización y respuesta.
- [ ] Configurar las variables production del contrato de este reporte sin copiar secretos a tickets, chats, capturas o logs.
- [ ] Confirmar que la plataforma suministra `VERCEL=1`.
- [ ] No definir `PORT` manualmente salvo necesidad demostrada por la configuración real.
- [ ] Mantener `TRUST_PROXY=false`; no configurar `true` ni asumir hops.
- [ ] Comprobar internamente que dos clientes reales distintos generan identidades/contadores separados y que un mismo cliente conserva su identidad, sin exponer la IP en respuestas ni logs.
- [ ] Comprobar global limiter, login IP limiter y username limiter, incluyendo códigos `RATE_LIMITED`/`AUTH_RATE_LIMITED`, headers y `skipSuccessfulRequests`.
- [ ] Revisar disponibilidad/configuración de Vercel Firewall, WAF o rate limiting distribuido; documentar la decisión y no presentar MemoryStore como protección global.
- [ ] Revisar Runtime Logs: request ID, status y clasificación segura presentes; Authorization, JWT, password, secret key, body, error upstream raw y `x-forwarded-for` raw ausentes.

### Supabase

- [ ] Confirmar que el proyecto remoto seleccionado es el proyecto correcto de KUCHI'S.
- [ ] Confirmar que Auth Leaked Password Protection continúa WARN/DISABLED antes de actuar.
- [ ] Verificar si el plan/settings permiten habilitar Leaked Password Protection y habilitarlo sólo con autorización.
- [ ] Revalidar login válido, credenciales inválidas y anti-enumeración después del ajuste.
- [ ] Volver a ejecutar/revisar Security Advisor y registrar el resultado.
- [ ] Verificar en Realtime Dashboard que **Allow public access** esté OFF.
- [ ] No modificar RLS, índices, SQL o schema como parte de este checklist.

### CORS

- [ ] Identificar los dominios production definitivos del cliente público y PWA logística.
- [ ] Configurar únicamente esos origins exactos en `CORS_ALLOWED_ORIGINS`, separados por coma.
- [ ] No usar `*`, regex amplia, substring ni reflection automática.
- [ ] Validar origin permitido, origin rechazado, preflight `OPTIONS/PATCH` y request backend-to-backend sin `Origin`.

### Secrets y smoke tests

- [ ] Mantener `SUPABASE_SECRET_KEY` únicamente en variables server-side de la API; nunca exponerla a frontend ni prefijos públicos.
- [ ] No documentar, imprimir ni capturar valores reales de secretos.
- [ ] Ejecutar deploy controlado sólo tras autorización humana.
- [ ] Tras deploy, probar `/health`, `/health/ready`, CORS, Auth, rutas privadas, request IDs, rate limiting y errores sanitizados.
- [ ] Confirmar que `/health` sigue vivo aunque Supabase falle y que `/health/ready` devuelve `not_ready` sanitizado cuando corresponde.
- [ ] Documentar resultados, incidencias y rollback antes de declarar producción lista.

## Cierre de esta ejecución

- Operación remota ejecutada: NO.
- Deploy/db push: NO.
- Dependencias nuevas o actualizadas: NO.
- `git add`, commit o push: NO.
