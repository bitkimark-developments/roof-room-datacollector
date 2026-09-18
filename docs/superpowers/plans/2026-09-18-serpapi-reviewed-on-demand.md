# SerpApi Reviewed On-Demand Implementation Plan

**Goal:** Complete the existing SerpApi source as a reviewed, request-bound Release 1.0 vertical that spends quota only for an explicit batch and preserves one independently retryable Job per query.

**Existing verified foundation:** Workspace-scoped credentials, guarded live execution, Turkey/Turkish/Desktop Google request construction, raw JSON preservation, first-ten organic and provider-labeled PAA parsing, validation, readiness, and quota/provider stop behavior already pass the release gate. No live SerpApi request has run in the repository checkpoint history.

**Architecture:** The desktop accepts explicit `query-id | query` rows. Review materializes the fixed provider scope and one local snapshot date into strict Job contexts. Core persists those contexts unchanged and creates one Job per row. The source validates task/source/mode/dataset/query identity before calling the client, and the client performs exactly one first-page request. No query discovery, continuous scheduling, automatic full-keyword refresh, or analytical classification is added.

**Spec:** `PROJECT_SPEC.md` section 4.7; `DATA_CONTRACTS.md` sections 15–17; `VALIDATION_SPEC.md` section 13; `TEST_STRATEGY.md` SerpApi coverage; Work Group 10 in `ROOFROOM_CODEX_DO_LIST.md`.

## Task 1: Lock the strict request contract

- Add a source-owned helper for task, source, acquisition mode, dataset, Job key, query, country, language, device, engine, organic limit, and ISO snapshot date.
- Reject unknown/mismatched identity, unsafe Job keys, blank queries, invalid dates, and unsupported scope before provider access.
- Reuse the helper in source collection, validation, and Job planning so contract checks cannot drift.
- Run the focused test RED before implementation.

## Task 2: Bind Review → Job → request

- Add explicit named-query parsing to the desktop task UI with no default query universe.
- Resolve the snapshot date from the Review clock and materialize every fixed field into the reviewed artifact.
- Start only from the exact reviewed artifact; create one Job per explicit query ID and reject duplicates.
- Prove repository close/reopen preserves identical Job context and sequential calls do not leak query state.

## Task 3: Verify collection and failure boundaries

- Inject a deterministic requester through production composition for a Core-level binding test.
- Assert provider URLs contain the reviewed query and fixed first-page scope while credentials never enter persisted configuration.
- Assert invalid context performs zero requests, raw bytes are preserved, provider/no-data outcomes remain distinct, and quota failure causes no automatic retry.
- Assert normalized output contains no intent, commercial-fit, page-type, or action recommendations.

## Task 4: Complete desktop Review visibility

- Display the exact reviewed query IDs/text and fixed request scope before Start.
- Keep Review disabled until readiness is `READY` and at least one valid unique query row exists.
- Update deterministic UI smoke coverage for input, Review, and exact reviewed Start behavior.

## Task 5: Verify and checkpoint

- Make the guarded live command use its execution-day snapshot date while retaining explicit confirmation, one query, one page, and no-retry behavior.
- Run focused source/Core/UI/live-command-guard tests, TypeScript, lint, diff checks, and the full release gate without consuming quota.
- Inspect configured Workspace readiness without exposing secrets. Run at most one guarded live query only if the intended connection is already configured and this acceptance is explicitly justified by the standing request; otherwise record the precise blocker.
- Review the diff locally for quota expansion, secret persistence, automatic query growth, analytical output, and contract drift.
- Commit the technical checkpoint, update `PROJECT_HANDOFF.md`, commit the documentation checkpoint, fast-forward local `main`, and rerun the release gate on merged `main`.
