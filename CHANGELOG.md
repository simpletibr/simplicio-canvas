# Changelog

## Unreleased — 2D flow viewer

- Rebuild Canvas as a simple 2D, LangFlow-style flow viewer on React Flow (`@xyflow/react`) with dagre layout: pan, zoom, fit,
  minimap, collapsible folder groups and a side panel with docstring, signature, callers, callees and source.
- Static views from a GitHub link (local bridge: shallow clone + `simplicio-mapper`): architecture and one flow per entry point
  (console scripts, click/typer/argparse commands, MCP tools, `main`, any function), depth-limited and expandable. Export
  Mermaid for any view.
- Replay: `simplicio.trace/v1` (JSONL) format, parser and player; importer for the JSON printed by `simplicio-loop turbo`
  (provider mode and host mode); LLM call details (model, tokens, cost, latency, prompt/response preview). Load a file or drop it on the page.
- Simulation: type a request and watch where it would go and why, with a plain-language explanation for every step, for the
  `simplicio-loop` flow (single, fan-out, same file, queue, provider mode) or for the call graph of any project entry point.
  Nothing runs; unknowns are marked.
- Local-first hardening: the bridge no longer forwards Mapper's raw output or reads symlinks; production builds carry a CSP;
  a test keeps the bridge the only network call.
- Interface in Portuguese and English (was 15 locales for the old UI).
- Removed: the Three.js workspace, the IDE-shell UI, `three`/`@types/three`, the domain modules only that UI used
  (with their tests), and the unused HostGator PHP import endpoint (`api/github-import.php`, `.htaccess`).
- Python `async def` functions, which Mapper 0.26 does not index, are read from the source so MCP tools written that way are listed as entry points.
- Docs: `docs/trace-format.md`, `docs/simulation.md`, new README and product spec.

## 2.13.0 — 2026-07-11

- Promote compatibility and distribution to verified readiness after the five-stack evidence and signed VSIX receipt.
- Keep unsupported .NET-at-budget behavior explicit in the scorecard and matrix.

## 2.12.0 — 2026-07-11

- Configure protected Minisign fallback credentials for signed extension releases.
- Publish and verify a detached VSIX signature and public key alongside the release.
- Keep Cosign keyless signing preferred, with fail-closed fallback behavior.

## 2.11.0 — 2026-07-11

- Close the real-repository compatibility issue with an explicit unsupported-at-budget .NET boundary.
- Publish verified five-stack Mapper evidence and nightly sanitized regression linkage.

## 2.10.0 — 2026-07-11

- Add sanitized nightly regression issue linkage for scheduled compatibility failures.
- Make the .NET large-repository timeout an explicit partial/unsupported-at-budget capability.
- Add verified matrix evidence for five public repositories without committing source.

## 2.9.0 — 2026-07-11

- Record five verified real Mapper compatibility captures and one explicit .NET budget limitation.
- Add sanitized evidence for deterministic scans, diagnostics, memory estimates and renderer screenshots.
- Keep the public compatibility matrix at five verified stacks plus one partial capability.

## 2.8.0 — 2026-07-11

- Add signed-extension release workflow with Cosign/Minisign fail-closed verification.
- Add runtime asset and cold-start budget enforcement.
- Record sanitized multi-stack Mapper evidence with privacy and determinism assertions.

## 2.7.0 — 2026-07-11

- Harden popup closure across pointer overlays and keep the command palette above onboarding.
- Add PWA host-capability, integrity, opt-in activation and rollback contracts.
- Extend Mapper compatibility evidence with deterministic repeats, timeout profiles and memory measurements.
- Add readiness gates that keep compatibility and distribution claims honest until their external evidence is complete.

## 2.6.0 — 2026-07-11

- Add release artifact signature/checksum verification contracts and publisher receipts.
- Add release-readiness scorecard for all seven maturity lanes.
- Add ephemeral local Mapper evidence collection with metadata-only output.

## 2.5.0 — 2026-07-11

- Add concrete host process streaming with abort/exit receipts.
- Add pointer gesture edge connection previews and editor save/reparse refresh.
- Add desktop artifact checksum/SBOM verification and onboarding timing integration.

## 2.4.0 — 2026-07-11

- Add local first-insight timing to the onboarding tour.
- Add metadata-only external compatibility scanning with offline/online modes.
- Add lazy Monaco-compatible editor loading and popup close controls.

## 2.3.1 — 2026-07-11

- Add visible `×` close controls to onboarding and command palette pop-ups.

## 2.3.0 — 2026-07-11

- Add deterministic `verify:release` gate covering tests, web build, extension build and PWA verification.
- Add reproducible safe edge reconnection proposals.
- Add graph timeline replay and validated VSIX packaging workflow.

## 2.2.1 — 2026-07-11

- Fix global `Escape` handling so onboarding, dialogs, command palette, help and inspector popups close reliably.

## 2.2.0 — 2026-07-11

- Add installable offline-first PWA manifest and versioned service worker cache.
- Add trusted Explorer filesystem CRUD with explicit delete confirmation and undo receipts.
- Add multi-repository landscape, onboarding recovery states and host packaging validation.

## 2.1.0 — 2026-07-11

- Add replayable graph revision transitions and safe edge-reversal previews.
- Add multi-repository landscape fixture with typed cross-repository edges.
- Add resumable onboarding/recovery usability states.
- Add VS Code/Cursor host manifest and lifecycle validation scaffold.

## 2.0.0 — 2026-07-11

- Add real InstancedMesh performance benchmarking and nightly compatibility/render CI.
- Add persistent, conflict-aware workspace preferences and shortcut settings.
- Add architecture policy baselines and explicit SARIF suppression behavior.
- Add safe edge-reversal preview proposals with cycle and duplicate validation.

## 1.9.0 — 2026-07-11

- Add compatibility-matrix CI metadata for Python, TypeScript, .NET, Java and polyglot repositories.
- Add incremental editor diagnostics, search, reparse and dirty-close protection.
- Add visible workspace cache recovery actions (restore, discard and inspect).
- Add deterministic graph revision diff export.

## 1.8.0 — 2026-07-11

- Add deterministic 5,000-node renderer benchmark and clustering/LOD evidence.
- Add opt-in static/runtime trace correlation with confidence and unexpected-edge reporting.
- Add guarded host process streaming and lazy editor-host lifecycle contracts.
- Add transformation RED/GREEN verification gate and `eval:transformation` command.

## 1.7.0 — 2026-07-11

- Add local first-run onboarding with skip/reset and persistent progress.
- Add privacy/accessibility verification gates and reduced-motion/focus-visible support.
- Add multi-file editor tabs with dirty state and Canvas focus synchronization.
- Enrich offline dependency intelligence with license, vulnerability and CODEOWNERS metadata.

## 1.6.0 — 2026-07-11

- Add URL-persisted semantic zoom state with history restoration.
- Add guarded Run/Debug lifecycle receipts with bounded output.
- Add versioned atomic workspace cache inspection and explicit repair diagnostics.

## 1.5.0 — 2026-07-11

- Add clickable Mapper flow endpoints with visible source provenance and camera focus.
- Add guarded Source Control receipts with protected-main enforcement.
- Add local opt-in telemetry diagnostics and measurable SLO reports.

## 1.4.0 — 2026-07-11

- Add a real analyzed-file Explorer tree with focus-to-canvas selection.
- Add visible Source Control governance state, protected-main guidance and host-safe Run/Debug receipts.
- Add command palette shortcuts and searchable Canvas/workspace actions.
- Add architecture policy findings, offline dependency intelligence and local SARIF export.
- Add filtered-node focus, minimap navigation and keyboard camera fit.

## 1.3.1 — 2026-07-11

- Harden the hosted demo: import controls, GitHub clone dialog and source editing are disabled and hidden at runtime.

## 1.3.0 — 2026-07-11

- Add a cross-platform, dry-run-first bootstrap receipt for `simplicio-mapper`, `simplicio-loop` and the project skill.
- Detect the canonical `.claude/skills/simplicio-loop/SKILL.md` location without performing silent installs.
- Keep the hosted demo read-only while local builds retain the importer/editor contracts.

## 1.2.0 — 2026-07-11

- Added Mapper Mermaid/JSON flow parsing, 15 selectable locales, privacy snapshot guards and renderer LOD helpers.
- Added opt-in telemetry, redacted runtime traces, architecture policy/SARIF, multi-repository manifests, recovery snapshots, onboarding and offline dependency intelligence contracts.
- Added guarded editor workspace, source control, terminal/run-debug adapters, edge refactor proposals, workspace preferences and host-side extension apply gates.
- Added real Playwright screenshot gallery and expanded validation to 102 tests.

## 1.1.0 — 2026-07-11

- Added versioned graph schema, stable identities, Python/TypeScript scanning, configurable classification and semantic explorer contracts.
- Added typed relations, visual operations, compatibility checks, deterministic change plans, generators and guarded apply/undo contracts.
- Added renderer-neutral Canvas SDK, VS Code/Cursor message contracts, workspace security, watcher, selection sync and AI proposal/audit contracts.
- Added extension build scaffold and 79-test validation gate.

## 1.0.0 — 2026-07-11

Simplicio Canvas is now a usable local-first architecture explorer:

- Import a local project folder and analyze its files, languages, imports and connections.
- Import a public GitHub repository through the local clone/Mapper bridge or browser fallback.
- Open the bundled `wesleysimplicio/simplicio-loop` example on first load.
- Navigate project, layers, flows, files and source through the Three.js canvas.
- Use the VS Code-like Explorer, tabs, terminal panel and Inspector shell.
- Switch the core interface instantly between English, Portuguese, Spanish and Simplified Chinese.
- Use the responsive phone, tablet and desktop layouts.
- Publish a locked read-only showcase at the public URL; the full import/edit workflow remains available only in the local developer build.

Validation: 55 automated tests, interactive production build, read-only demo build, public HTTPS smoke check and HostGator FTP deployment. The hosted URL is a showcase only; local development retains the import workflow.
