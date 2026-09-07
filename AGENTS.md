# KUCHI'S — Repository Agent Rules

These are the minimal persistent rules for coding agents in this repository. They are intentionally short. Do not treat this file as a request to preload the whole repository.

## Context budget

- Start from the user/task prompt and the nearest relevant code. Do not scan the whole repository by default.
- Do not preload `docs/architecture/`; those reports are evidence/history and should be opened only when the task explicitly needs them.
- Load only the relevant file under `docs/agent-context/`:
  - `project-status.md` for roadmap/current certification state.
  - `frontend-logistics.md` for `apps/logistics` UI conventions and certified behavior.
  - `backend-map.md` for API contract/source locations and backend invariants.
  - `production-safety.md` for Vercel/Supabase/Production work or smoke tests.
- Prefer the current code, schemas and tests as canonical truth. Context docs are maps and stable invariants, not substitutes for source code.
- Do not re-audit already certified objectives unless the current task changes their shared dependencies or explicitly asks for regression analysis.

## Repository boundaries

- `apps/api`: canonical HTTP backend.
- `apps/logistics`: internal KUCHI'S operations frontend.
- `apps/client`: public digital menu/customer frontend.
- `packages/shared`: shared generated/database types and shared contracts.
- `supabase`: migrations/database source of truth.
- Keep changes inside the task's app/module unless a cross-boundary change is genuinely required.

## Engineering invariants

- The backend is authoritative for operational state and mutations.
- Never automatically retry an ambiguous write. Reconcile authoritative state first.
- Authorization is capability-driven; do not replace capability checks with UI-only hiding or role-name guesses.
- Preserve certified behavior unless the task explicitly changes its contract.
- Reuse existing patterns before introducing abstractions, dependencies or broad refactors.
- Never place secrets, service-role keys, passwords or tokens in source, reports, prompts or committed env files.

## Validation budget

- Run the smallest relevant test suite first.
- For `apps/logistics`, use the feature test(s) affected plus `lint`, `typecheck` and `build` when the change is objective-level or touches shared frontend code.
- For `apps/api`, run focused tests first; broaden to `test`, `typecheck` or integration suites only when scope/risk requires it.
- Broaden regression coverage when shared contracts, auth, routing, common components or generated types change.
- Report exact commands and results. Do not rerun expensive suites without a reason.
- Do not commit generated artifacts such as TypeScript build info.

## Git and Production stop rules

- Do not commit, push, open/merge PRs or deploy unless the user/task explicitly requests that operation.
- Production/Supabase audits are read-only by default.
- For controlled Production smoke mutations, use official backend endpoints rather than direct SQL, and clean up created state afterward.
- Do not leave temporary localhost CORS allowances enabled after a smoke test.
- Stop when the requested objective/task is complete; do not begin the next roadmap objective automatically.
