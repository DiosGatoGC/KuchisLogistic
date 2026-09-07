# KUCHI'S Logistics — Frontend Context

Use this file only for work in `apps/logistics` or when a shared frontend change could affect it.

## Product/UI conventions

- Operational UI is landscape-first.
- Preserve the cream/orange KUCHI'S visual system, Fredoka/Nunito Sans, and the existing shell/components before inventing new patterns.
- Desktop/tablet use the standard operational shell.
- Landscape phones use the existing compact shell behavior.
- Authenticated portrait-phone access uses the existing LandscapeGate.
- Do not add product images to Comandar or Preparation operational screens unless the objective explicitly changes that decision.
- Preparation cards are textual and do not show prices.

## Physical service-point geometry

Preserve the current physical table layout unless the task explicitly changes it:

- top: `6 5 4 3 2 1`
- bottom-left: `7`
- lower center/right: `B4 B3 B2 B1`
- takeout: `LL1 ... LL7`

Do not replace this geometry with an arbitrary responsive sorting/grid that changes physical meaning.

## Data/mutation behavior

- Use the existing API client/auth/session patterns.
- Backend responses are authoritative after writes.
- Never automatically retry a mutation whose outcome is ambiguous.
- Prevent double-submit while an item/action mutation is in flight.
- Capabilities determine whether operations are available. A user with view capability but no manage/operate capability should get a real read-only UI, not a broken control.
- Prefer explicit authoritative refetch/reconciliation after a mutation when existing feature patterns do so.
- Do not introduce polling or Realtime merely to solve an objective unless that objective explicitly calls for it.

## Existing feature areas

Current implemented feature modules include:

- auth/session and protected shell
- `features/tables`
- `features/ordering`
- `features/preparation`

Before building a new feature, inspect the nearest existing feature module and reuse its conventions for model/view/API boundaries, loading/error states and tests.

## Testing

Existing focused scripts in `apps/logistics/package.json`:

- `npm run test:tables`
- `npm run test:ordering`
- `npm run test:preparation`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

Run only affected feature tests by default. Broaden when shared layout/auth/API/model code changes.
