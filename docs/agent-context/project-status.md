# KUCHI'S — Project Status for Agents

Use this file only when the task needs roadmap or certification context.

## Backend

Logistics backend V1 is complete and production-certified. The canonical Production API is:

`https://kuchis-logistic-api.vercel.app`

Do not redesign or re-audit the backend unless the current task explicitly requires a backend change or contract verification.

## Frontend Logistics roadmap

Completed and certified:

1. Foundation + Auth + Home + Design System — DONE
2. Mesas + Service Sessions — DONE
3. Comandar — DONE
4. Pedidos + Cocina + Bebidas — DONE
5. Estado de mesas + corrections/transfers/cancellations — DONE (Production smoke certified)
6. Checkout/Cobro — DONE (Production smoke certified)
7. Actualizar carta — DONE (Production smoke certified)
8. Turnos/Gastos — DONE (Production smoke certified)
9. Cierre/cuadre — DONE (Production smoke certified)
10. Historial — DONE (Production smoke certified)
11. Usuarios — DONE (Production smoke certified)
12. Realtime hardening — DONE / PASS CERTIFICADO
13. PWA/mobile/tablet — DONE / PASS CERTIFICADO
14. Frontend Production Readiness — DONE / PASS CERTIFICADO

**Frontend Logistics roadmap complete — Objectives 1–14 DONE / PASS CERTIFICADO.**

The shared protected shell now provides a human-smoke-verified in-app Back control for installed/fullscreen PWA use: it is hidden on `/home`, uses marked same-app history when available, falls back safely to `/home` on direct entry, and remains suppressed on the terminal paid Checkout screen.

## Certified Objective 4 behavior worth preserving

- Kitchen and Drinks queues are REST-authoritative.
- No backend polling or Realtime is used for preparation queues.
- Preparation item transitions are PENDING → PREPARING → READY → DELIVERED.
- Ambiguous writes are not automatically retried.
- Age urgency uses `order.sentAt`:
  - under 10 min: normal/green
  - 10 to under 15 min: warning/yellow
  - 15 to under 20 min: urgent/orange
  - 20+ min: critical/red
- Age display refreshes with one local 60-second clock; it does not generate API traffic.

## Public client note

`apps/client` loads the public catalog through `NEXT_PUBLIC_API_URL` using `/api/categories` and `/api/products`; it is not a direct anonymous Supabase client. The canonical API above serves those routes as well.
