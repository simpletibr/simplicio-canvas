# Execution contract — GPT Luna Medium

Read `docs/PRODUCT_SPEC.md` and `planning/backlog.json` before changing code.

1. Work on exactly one task with `status: ready` whose dependencies are `done`.
2. Set it to `in_progress`; do not change another task in the same run.
3. Write or update tests first and capture RED for the intended reason.
4. Implement the smallest complete vertical slice; never read or modify the original `../simplicio-loop`.
5. Run the task's `verify` commands plus `npm test`, `npm run build`, and browser proof for UI work.
6. Put evidence paths/commands into `evidence`, set `status: done`, then commit with the task id.
7. If blocked, set `status: blocked` and record the exact error and attempted recovery. Never invent completion.

Architecture rules: domain code cannot import UI code (React, React Flow); scanners produce the canonical graph schema; renderers consume it; filesystem access stays local-first; generated code always requires preview, validation, and explicit apply.

## Definition of Done

No issue or task closes without all seven of: implementation, unit tests, integration tests, system tests, regression tests, a passing performance benchmark, and 85%+ line coverage (`npm run test:coverage`, scope defined in `vite.config.mjs`'s `test.coverage` block). Evidence for each must be recorded before setting `status: done`.

Note: `.github/workflows/ci.yml` currently runs `npm test`, `npm run test:compatibility`, both benchmarks, build, and PWA/readiness verification, but does not run `npm run test:coverage` or enforce the 85% gate in CI — this is a known gap, not yet closed.
