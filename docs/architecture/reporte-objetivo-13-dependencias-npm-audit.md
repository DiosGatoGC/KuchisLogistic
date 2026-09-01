# Objetivo 13 — Dependencias + NPM Security Audit

Fecha de ejecución: 2026-09-01.

1. **Rama:** `feat/logistics-backend-foundation`.
2. **HEAD inicial:** `25ab0dab8fede79a64dfcfabfcb5d5c92a5b12f7` (`25ab0da docs: close readiness and timeout validation`). El worktree inicial estaba limpio y `git diff --check` pasó.
3. **`npm audit --json` en root:** PASS, 0 vulnerabilidades (`info=0`, `low=0`, `moderate=0`, `high=0`, `critical=0`; 15 dependencias totales reportadas por npm).
4. **`npm outdated --json` en root:** sólo `supabase` CLI instalado en `2.115.0`, `wanted/latest=2.116.0`. El exit code 1 es el comportamiento normal de `npm outdated` cuando encuentra paquetes desactualizados. No existe advisory que justifique actualizarlo.
5. **`npm audit --json` en `apps/api`:** PASS, 0 vulnerabilidades en 128 dependencias totales reportadas (`prod=87`, `dev=42`, `optional=27`).
6. **`npm audit --omit=dev --json` en `apps/api`:** PASS, 0 vulnerabilidades runtime (`info=0`, `low=0`, `moderate=0`, `high=0`, `critical=0`).
7. **`npm outdated --json` en `apps/api`:** `@supabase/supabase-js` 2.112.3 → 2.112.4; `@types/node` 26.2.0 → 26.4.0; `tsx` 4.23.12 → 4.23.13; `zod` 4.4.3 → 4.5.4; TypeScript queda en `wanted=5.9.3` aunque `latest=7.0.2`. Ninguna diferencia está asociada a un advisory de este audit.
8. **Advisories por severidad:** info 0, low 0, moderate 0, high 0, critical 0; total 0 tanto en root como en API.
9. **Advisories runtime:** ninguno.
10. **Advisories dev-only:** ninguno.
11. **Clasificación individual:** no aplica; npm no reportó paquetes afectados, CVE/GHSA, dependency paths ni fixes disponibles.
12. **Explotabilidad/relevancia para KUCHI'S:** no hay vulnerabilidades npm conocidas reportadas que clasificar como explotables en la superficie runtime o de desarrollo actual.
13. **Cambios aplicados:** NO. Se aplicó el escenario A: no se modificaron manifests, lockfiles ni dependencias.
14. **Justificación:** actualizar sólo por frescura produciría churn sin beneficio de seguridad demostrado. No se ejecutó `npm audit fix`, `npm audit fix --force`, dry-run ni actualización focalizada porque el audit no propuso ningún fix.
15. **Diff de `package.json`:** vacío para root y `apps/api`.
16. **Diff de `package-lock.json`:** vacío para root y `apps/api`.
17. **`@supabase/supabase-js` final:** 2.112.3 instalada; rango declarado `^2.112.3`. No se movió al patch 2.112.4.
18. **Supabase CLI final:** 2.115.0 instalada; rango declarado `^2.115.0`. No se movió a 2.116.0.
19. **TypeScript final:** 5.9.3 exacto. No se realizó el major 7.x.
20. **Dependencias finales:** API runtime: `@kuchis/shared` local, `@supabase/supabase-js ^2.112.3`, `cors ^2.8.6`, `dotenv ^17.4.2`, `express ^5.2.1`, `express-rate-limit 8.7.0`, `helmet 8.3.0`, `zod ^4.4.3`. API dev: `@types/cors ^2.8.19`, `@types/express ^5.0.6`, `@types/node ^26.2.0`, `tsx ^4.23.12`, `typescript 5.9.3`. Root dev: `supabase ^2.115.0`.
21. **Typecheck:** PASS (`npm run typecheck`).
22. **Unitarias:** PASS, 160/160 en 21 suites (`npm test`). La primera ejecución quedó bloqueada ambientalmente en los archivos HTTP por restricciones de sockets del sandbox; la ejecución idéntica fuera del aislamiento pasó completa, sin cambios de código.
23. **Readiness/timeouts:** PASS, 20/20 dentro de las 160 pruebas unitarias.
24. **Compile:** PASS (`npm run compile`).
25. **Hardening:** PASS, 25/25 (`npm run test:hardening`).
26. **E2E:** no correspondió ejecutarlo en este checkpoint porque no cambió ninguna dependencia, `package.json` ni lockfile. Último baseline cerrado: 1/1 PASS.
27. **Concurrency:** no correspondió ejecutarlo. Último baseline cerrado: 9/9 PASS.
28. **Realtime:** no correspondió ejecutarlo. Último baseline cerrado: 1/1 PASS con exactamente 33 broadcasts.
29. **CHECKOUT_CHANGED:** no correspondió ejecutarlo. Último baseline cerrado: 14/14 PASS.
30. **`git diff --check`:** PASS final; el reporte nuevo también fue revisado por whitespace al final de línea.
31. **SQL/remoto/frontend:** NO. No hubo cambios en migrations, SQL, RPC, RLS, Realtime SQL, `database.types.ts`, `apps/client`, `apps/logistics`, `.env`, Supabase remoto ni Vercel; tampoco `db push` o deploy.
32. **Riesgo residual:** `npm audit` representa la base de advisories disponible en el registro al momento de la ejecución y no demuestra ausencia absoluta de vulnerabilidades futuras o no catalogadas. Permanecen fuera de este checkpoint el WARN conocido de Supabase Auth Leaked Password Protection y los INFO de índices sin uso; se mantienen para Production Readiness sin cambios remotos. Las versiones frescas listadas por `npm outdated` no constituyen por sí mismas vulnerabilidades.
33. **Conclusión:** **PASS**. Root, API completa y API runtime tienen cero vulnerabilidades reportadas; no existe justificación de seguridad para cambiar dependencias.

## Alcance final

- Dependencias modificadas: NO.
- Nuevas dependencias: NO.
- Código productivo o tests modificados: NO.
- Único archivo creado: `docs/architecture/reporte-objetivo-13-dependencias-npm-audit.md`.
- Commit/push: NO.
