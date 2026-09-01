# Objetivo 13 — Production Readiness, Parte A de 2

Fecha: 2026-09-01. Alcance: arquitectura y configuración local; sin deploy ni cambios remotos.

1. **Rama:** `feat/logistics-backend-foundation`.
2. **HEAD inicial:** `fc659c21eb913e4e313da2b57e044380a66fb6b7` (`fc659c2 docs: close dependency security audit`).
3. **Worktree inicial:** limpio; `git diff --check` PASS.
4. **Archivos revisados:** `apps/api/src/config/env.ts`, `apps/api/src/config/cors.ts`, `apps/api/src/middlewares/rate-limit.middleware.ts`, `apps/api/src/middlewares/request-context.middleware.ts`, `apps/api/src/logging/logger.ts`, `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/.env.example`, tests de hardening y búsqueda focalizada de configuración Vercel. No existe `vercel.json`, `maxDuration` ni otro archivo Vercel rastreado aplicable a la API.
5. **Archivos modificados:** `apps/api/.env.example`, `apps/api/src/app.ts`, `apps/api/src/config/env.ts`, `apps/api/src/middlewares/rate-limit.middleware.ts`; nuevos `apps/api/src/config/deployment.ts`, `apps/api/src/middlewares/client-ip.ts`, `apps/api/src/tests/production-readiness.test.ts` y este handoff.
6. **Comportamiento IP anterior:** global limiter y login IP limiter usaban el key generator implícito de `express-rate-limit`, basado en `req.ip`. Con `TRUST_PROXY=false`, una Function detrás de Vercel podía agrupar por la conexión del proxy/serverless en lugar del cliente final. El username limiter no dependía de IP.
7. **Comportamiento IP final:** `resolveClientIp()` centraliza la identidad. En Vercel toma una única IP validada de `x-forwarded-for`; fuera de Vercel usa `req.ip`, después `socket.remoteAddress`, y finalmente la constante segura `unknown-client`. Las claves pasan por `ipKeyGenerator(ip, 56)` de `express-rate-limit` para mantener agrupación segura de IPv6.
8. **Detección Vercel:** `resolveDeploymentContext()` considera Vercel únicamente cuando la variable de sistema `VERCEL` vale `1`. `createApp` permite inyectar el contexto para tests sin mutar `process.env`. No se creó una variable manual nueva.
9. **Trust model de `x-forwarded-for`:** sólo se consulta cuando `isVercel=true`. El valor debe ser un único string que, después de `trim`, sea una dirección IPv4 o IPv6 completa reconocida por `node:net.isIP`. Listas con coma, arrays, puertos, texto o valores vacíos se rechazan. Nunca se usa la cadena raw completa como key ni se registra el header.
10. **Fallback fuera de Vercel:** se ignora completamente `x-forwarded-for`; permanece la identidad segura de Express/socket. Un cliente directo local no puede alterar su key enviando el header.
11. **`TRUST_PROXY` final:** sigue aceptando exclusivamente `false | loopback`, con default `false`. No se habilitó `true`, no se asumió uno o más hops y no fue necesario cambiar la configuración Express en Vercel.
12. **Global rate limiter:** conserva ventana, máximo, handler, códigos y exclusión de `OPTIONS`; sólo cambia su `keyGenerator` para usar la identidad central.
13. **Login IP limiter:** conserva ventana, máximo, `skipSuccessfulRequests` y respuesta `AUTH_RATE_LIMITED`; sólo cambia su `keyGenerator` a la identidad central.
14. **Login username limiter:** sin cambios. Sigue usando username con `trim().toLowerCase()`, fallback `invalid-input` y SHA-256; no incorpora IP ni password.
15. **Limitación in-memory/serverless:** el store por defecto de `express-rate-limit` es memoria por instancia. En Vercel distintas instancias no comparten contadores y un reinicio pierde estado. Es defensa best-effort por instancia, no un rate limit global distribuido.
16. **Protección distribuida pendiente:** Parte B debe comprobar y decidir Vercel Firewall/WAF/rate limiting si está disponible para el proyecto, o dejar una arquitectura distribuida futura. No se añadió Redis, Upstash, DB, migration ni dependencia.
17. **Contrato de environment production:** configurar `NODE_ENV=production`, `CORS_ALLOWED_ORIGINS` con origins HTTPS/HTTP exactos autorizados, `SUPABASE_URL` HTTPS y `SUPABASE_SECRET_KEY` secreto. Mantener explícitos `SUPABASE_REQUEST_TIMEOUT_MS=8000`, `READINESS_TIMEOUT_MS=2000`, `JSON_BODY_LIMIT=100kb`, `RATE_LIMIT_WINDOW_MS=60000`, `RATE_LIMIT_MAX=600`, `LOGIN_IP_WINDOW_MS=900000`, `LOGIN_IP_MAX=30`, `LOGIN_USERNAME_WINDOW_MS=900000`, `LOGIN_USERNAME_MAX=10` y `TRUST_PROXY=false`, salvo decisión de operación dentro de los rangos validados. Vercel aporta `VERCEL=1`; no debe definirse manualmente en local. `PORT` no es configuración manual crítica de Vercel. Nunca registrar valores secretos.
18. **CORS production:** `CORS_ALLOWED_ORIGINS` sigue siendo la única fuente. Missing o `*` falla al startup; se aceptan sólo origins completos exactos, separados por coma, sin path/query/hash y sin reflection, regex o substring. Se permiten múltiples origins para PWA logística y cliente público cuando existan dominios definitivos.
19. **Timeout hierarchy:** defaults finales `READINESS_TIMEOUT_MS=2000 < SUPABASE_REQUEST_TIMEOUT_MS=8000`. `parseEnv` ahora rechaza startup si readiness es igual o mayor que el timeout upstream, además de conservar los rangos existentes.
20. **Vercel `maxDuration` encontrado:** ninguno. No existe configuración rastreada que pueda asociarse con seguridad al entrypoint de la API; no se creó un valor arbitrario.
21. **Requisito final de `maxDuration`:** Parte B debe confirmar en el proyecto/plan real que la duración de la Function es estrictamente mayor que `SUPABASE_REQUEST_TIMEOUT_MS` y deja margen operativo para abortar, capturar, sanitizar y enviar la respuesta antes del corte de plataforma. Con el default actual debe superar 8000 ms más dicho margen; el valor concreto se definirá sólo al confirmar el entrypoint y límites del proyecto real.
22. **Startup Vercel:** Express continúa exportándose directamente como default desde `app.ts` y `index.ts`; no se creó otro servidor HTTP.
23. **`app.listen` local:** `index.ts` sigue llamándolo sólo cuando `process.env.VERCEL` no existe. No se cambió el arranque local.
24. **Conclusión shutdown:** no existe pool PostgreSQL propio, worker, background loop ni socket persistente propio que cerrar. No corresponde añadir graceful shutdown complejo para una Vercel Function en Parte A.
25. **Logging/observability:** se mantiene JSON estructurado con request ID, método, pathname sin query, status, duración y clasificación segura de error. No se agregó plataforma externa. Tests confirman que no aparecen el header raw, secrets, Authorization, JWT, password, body o error Supabase raw. Parte B debe validar Runtime Logs reales.
26. **Supabase Auth Leaked Password Protection:** WARN conocido, actualmente DISABLED. Parte B debe revisar disponibilidad/plan, habilitarlo desde Dashboard si procede y comprobar Auth/login, sin cambiar la política de contraseñas de la aplicación como efecto lateral.
27. **Unused indexes:** los INFO conocidos permanecen sin cambios. No existe tráfico productivo representativo para justificar eliminarlos.
28. **Dependencias nuevas:** NO. No cambiaron `package.json` ni lockfiles.
29. **Tests nuevos:** `production-readiness.test.ts`, 17/17 PASS aislado. Cubre resolución local/Vercel, validación y fallback de header, keys, ambos limiters por IP, username limiter, trust proxy, CORS, logs y jerarquía de timeouts.
30. **Unit total:** 177/177 PASS en 22 suites. Readiness/timeouts permanece 20/20 dentro del total.
31. **Hardening:** 25/25 PASS, sin reducción de cobertura.
32. **Typecheck:** PASS.
33. **Compile:** PASS.
34. **`git diff --check`:** PASS final; los archivos nuevos también fueron revisados directamente por whitespace.
35. **SQL:** NO. Sin migrations, queries, RPC, triggers, RLS ni Realtime SQL.
36. **Remoto:** NO. Sin acceso o cambios Supabase/Vercel, `db push` o deploy.
37. **Frontend:** NO. Sin cambios en `apps/client`, `apps/logistics` ni `packages/shared/database.types.ts`.
38. **Riesgos aceptados:** rate limit por instancia no distribuido; confianza en `x-forwarded-for` condicionada estrictamente a `VERCEL=1` y pendiente de smoke test real; un header ausente/malformado agrupa de forma conservadora por proxy/socket; `maxDuration` real sin verificar; Leaked Password Protection pendiente; Runtime Logs y WAF pendientes.
39. **Blockers:** ninguno para cerrar la arquitectura local. Las verificaciones de proyecto/plan, headers reales, envs, WAF, Dashboard Supabase y deploy requieren acceso remoto y pertenecen a Parte B.

## INSTRUCCIONES EXACTAS PARA PARTE B

Parte B deberá:

- Leer este handoff completo y revisar el diff de Parte A.
- Ejecutar regresión integral local: typecheck, unitarias, compile, hardening, E2E, concurrency, Realtime y CHECKOUT_CHANGED.
- Confirmar E2E 1/1.
- Confirmar concurrency 9/9, sin retries automáticos nuevos.
- Confirmar Realtime 1/1 con exactamente 33 broadcasts.
- Confirmar CHECKOUT_CHANGED 14/14.
- Revisar/configurar el proyecto Vercel real cuando exista acceso.
- Configurar las variables production descritas, sin exponer secretos y sin tratar `PORT` o `VERCEL` como valores manuales ordinarios.
- Confirmar que `maxDuration` real es mayor que el timeout upstream de 8000 ms más margen suficiente para responder de forma sanitizada.
- Comprobar la client IP real en Vercel sin devolverla públicamente ni registrar el `x-forwarded-for` raw.
- Validar global limiter y login IP limiter con clientes reales diferentes, y confirmar que el username limiter conserva su semántica.
- Decidir/comprobar una capa distribuida Vercel Firewall/WAF/rate limiting; no presentar MemoryStore como protección global.
- Verificar si Supabase Auth Leaked Password Protection está disponible en el plan, habilitarlo en Dashboard si procede y comprobar que Auth/login sigue funcionando.
- Volver a comprobar Supabase Security Advisor después de cualquier ajuste remoto autorizado.
- Verificar en Realtime Dashboard que **Allow public access** esté OFF.
- Realizar un deploy controlado sólo con autorización humana.
- Ejecutar smoke tests de liveness, readiness, CORS, Auth, endpoints privados, request IDs, rate limiting y respuestas sanitizadas en production.
- Revisar Vercel Runtime Logs confirmando estructura y ausencia de secretos/header IP raw.
- Crear el reporte final de Production Readiness.

Parte A no ejecutó ninguna de estas acciones remotas. No hubo `git add`, commit ni push.
