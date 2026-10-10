# RoofRoom Data Collector — Desktop UI Redesign

Date: 2026-09-14
Status: Approved design

## Goal

Replace the Google-Trends-centric renderer with a source-neutral desktop
operations interface while preserving the existing production Core,
controller, runtime, persistence, validation, provenance and credential
boundaries.

RoofRoom remains:

Collect → Preserve → Validate → Document → Export

The renderer must not make marketing, SEO, advertising, merchandising or
commercial decisions.

## 1. Information Architecture

The application shell uses persistent left navigation:

- HOME
- TASKS
- RUNS
- PRESETS
- WORKSPACE

A top context bar shows:

- active Workspace
- application/system status
- global warnings when relevant

Google Trends receives no special global navigation or visual priority.

## 2. Primary UI Object: Task

The primary UI object is a runnable dataset/task, not a provider/source.

Release 1.0 task catalog:

1. Google Trends — Interest Over Time
2. GSC — Current 90 Days
3. GSC — Long 16 Months
4. Google Ads — Search Terms
5. Keyword Planner — Historical Metrics
6. İkas — Products Import
7. Bitkimark — Sitemap/XML
8. SerpApi — SERP Snapshot

Multiple tasks may map to the same provider/source. In particular, both GSC
tasks use the existing Google Search Console source implementation.

All Release 1.0 tasks remain visible even when unavailable or incomplete.

Supported presentation states include:

- READY
- CONFIGURATION REQUIRED
- CONNECTION REQUIRED
- FILE REQUIRED
- MANUAL ACTION REQUIRED
- NOT YET AVAILABLE

## 3. HOME

HOME is the operations overview.

It contains:

- active Workspace context
- Preset Run area
- persisted active or unfinished Run work for the active Workspace
- a clear entry point to TASKS for individual-task Quick Runs
- recent completed work where available

HOME does not duplicate the Task Catalog. It must distinguish active/unfinished
work from completed, failed, and cancelled Runs using persisted Run state, not
the mere presence of a Run in history. Run state requests and delayed responses
must remain scoped to the current Workspace. Show an explicit empty state when
the Workspace has no active/unfinished Runs or no Saved Presets.

Individual task flow remains available from TASKS:

TASKS Catalog → Task Detail → Review Quick Run → Start Run

HOME Saved Preset flow remains:

Select Saved Preset → Review Run → Explicit Start Run → Run Detail

## 4. TASKS and Task Detail

TASKS is the complete task catalog.

Selecting a task opens a dedicated Task Detail page.

Task Detail is one scrolling page composed of section cards rather than tabs.

Sections include:

- task header/status
- Readiness
- Default Configuration
- Input / Connection
- Recent Runs
- Review Quick Run action

Task-specific editors are contained inside this common structure.

Examples:

- Google Trends: query groups, geography, search mode, selection type and relative date policy
- GSC: task-specific relative date policy and property/dataset context
- İkas: Products XLSX input selection
- Sitemap: sitemap configuration
- SerpApi: query/snapshot configuration

Task defaults are Workspace-scoped.

Standalone Quick Runs use Task Default configuration.

## 5. Presets

PRESETS contains a preset list.

Selecting a preset opens a dedicated Preset Detail/Edit page.

Preset Detail contains:

- preset name
- optional description
- included tasks
- preset-specific task configuration
- clearly identified overrides
- Save
- Duplicate
- Delete
- Review Run

A new preset may derive initial values from current task defaults, but stores
its own reusable configuration snapshot.

Changing Task Defaults later must never silently mutate an existing preset.

## 6. Review Is Mandatory

Every real provider collection must follow:

Configure → Review → Start Run → Progress → Result

This applies to:

- Quick Run
- Preset Run

Review performs no provider call.

Review displays enough resolved information to understand exactly what will
run, including where relevant:

- Workspace
- origin
- included tasks
- resolved absolute dates
- relative date policy
- reference date
- query/group/job counts
- country
- language
- device/search context
- readiness
- selected manual files
- quota/manual-action warnings

Provider execution begins only after explicit Start Run.

Relative date policies live in reusable configuration.

Review resolves them against the run reference date.

Start Run persists the resolved absolute configuration into the Run snapshot.

No silent date drift is allowed between review and execution.

## 7. RUNS

RUNS is a table/list containing Quick Runs and Preset Runs.

A Run row opens a dedicated Run Detail page.

Run Detail displays:

- Run ID
- origin
- Workspace
- start/end information
- Run execution state
- task/job states
- validation states
- artifacts
- retry eligibility
- export operations

Execution success and validation success are separate concepts.

COMPLETED must not imply VALID.

Run Progress is derived from persisted Core run/job state. The renderer does
not invent progress state.

Manual action, authentication, quota/rate-limit and input failures are shown
explicitly. The renderer must not introduce hidden provider retry/evasion.

## 8. WORKSPACE

WORKSPACE owns shared infrastructure only.

It may display/manage:

- Workspace metadata
- provider connection/readiness state
- application-owned data directories
- raw evidence location
- export location
- safe connection operations
- Open Data Folder

Task-specific configuration does not live here.

Examples that must remain in Task Detail rather than WORKSPACE:

- Google Trends query groups
- GSC date policy
- İkas Products XLSX

Credentials and secrets must never cross into the renderer.

The renderer only receives safe readiness/connection state.

## 9. File Inputs

İkas Products XLSX uses an Electron main-process native file picker.

The renderer must not manufacture arbitrary file paths.

The exact selected file must be visible during Review and traceable to the Run.

Raw input preservation and validation remain Core responsibilities.

## 10. Visual System

Style: Modern Operations Dashboard.

Foundation:

- deep navy
- near black
- white / off-white

Semantic accents:

- purple: primary action / selected state / product accent
- turquoise: READY / connected / positive system state
- orange: warning / attention / file-required / manual-action states
- limited red: critical failures only

Color must carry meaning rather than assigning arbitrary colors per provider.

Controlled navy→purple or purple→turquoise gradients may be used for small
brand accents. Large decorative gaming-style gradients are avoided.

Technical IDs remain available where operationally useful but human-readable
names take visual priority.

Desktop is the primary target. Approximately 1100×900 must be comfortable.
Layouts may collapse from multi-column to single-column at narrower widths.

## 11. Component Direction

Source-neutral shared components:

- AppShell
- Sidebar
- ContextBar
- TaskCard
- StatusBadge
- ReadinessPanel
- ConfigurationPanel
- ConnectionPanel
- RecentRunsTable
- RunStatusSummary
- ValidationBadge
- EmptyState
- ConfirmAction

Primary pages:

- HomePage
- TasksPage
- TaskDetailPage
- RunsPage
- RunDetailPage
- PresetsPage
- PresetDetailPage
- WorkspacePage
- RunReviewPage

Task-specific components attach inside Task Detail rather than owning the
application shell.

## 12. Backend Boundary

The UI redesign must preserve the working backend architecture:

renderer
→ preload
→ trusted IPC
→ DesktopMultiSourceController
→ production runtime
→ Core orchestrator

Do not rewrite working Core functionality merely to redesign the renderer.

Extend renderer-safe product APIs only when the UI requires a capability not
already exposed.

Existing source IDs remain provider/source identities. Task identity is a
separate product concept.

## 13. Migration Strategy

Implement as working vertical slices.

First slice:

- source-neutral AppShell
- left Sidebar
- ContextBar
- HOME
- TASKS catalog
- eight Release 1.0 task cards
- new visual palette
- remove global legacy Google Trends MVP renderer surface

Subsequent slices:

- Task Detail and Task Defaults
- native İkas file input
- Preset Detail/Edit
- Review + relative-date resolution
- Runs / Progress / Result / Run Detail
- Workspace connections/local data
- final visual polish

The legacy Google Trends global dashboard is removed from the product shell.
Required GT capabilities move into its Task Detail rather than being discarded.

## 14. Test Strategy

Development cadence:

Implement → targeted deterministic test → real UI/live run when appropriate
→ checkpoint full gate + Git commit

Normal automated tests must not call live providers.

Renderer behavior is covered by deterministic Playwright smoke/integration
tests.

Controller/IPC behavior remains covered by targeted integration tests.

Live provider tests are explicit, minimal, quota-aware and separate.

Do not run the full release gate after every small UI change.

## 15. First-Slice Acceptance Criteria

The first redesign slice is accepted when:

- HOME / TASKS / RUNS / PRESETS / WORKSPACE navigation is visible
- active Workspace is visible in the context bar
- HOME shows all eight Release 1.0 task cards
- TASKS shows all eight Release 1.0 task cards
- preset context remains visible and existing preset data is not lost
- global "GOOGLE TRENDS MVP" presentation is absent
- global "Google Trends · Interest Over Time" branding is absent
- Google Trends is visually equivalent to the other tasks
- new navy/black/white/purple/turquoise/orange system is applied
- no real provider is called by the deterministic smoke test
- targeted renderer smoke test passes
- TypeScript typecheck passes
