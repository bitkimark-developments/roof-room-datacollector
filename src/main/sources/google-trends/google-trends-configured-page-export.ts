import {
  createHash,
} from 'node:crypto';

import type {
  CapturedBrowserDownload,
} from '../../browser/browser-download-capture';
import type {
  ManagedBrowserPage,
} from '../../browser/browser-manager';

import {
  applyGoogleTrendsCustomDateRange,
} from './google-trends-custom-date-range';
import {
  applyGoogleTrendsTurkeyGeography,
} from './google-trends-geography-ui';
import {
  downloadGoogleTrendsInterestOverTime,
} from './google-trends-interest-over-time-download';
import {
  applyGoogleTrendsSearchTermQueryGroup,
} from './google-trends-query-group-ui';
import {
  verifyGoogleTrendsFixedFilters,
} from './google-trends-fixed-filter-verifier';

const CSV_MEDIA_TYPE =
  'text/csv';

export const GOOGLE_TRENDS_CONFIGURED_PAGE_STAGES = [
  'QUERY_GROUP',
  'GEOGRAPHY',
  'DATE_RANGE',
  'FIXED_FILTERS',
  'DOWNLOAD',
] as const;

export type GoogleTrendsConfiguredPageStage =
  (typeof GOOGLE_TRENDS_CONFIGURED_PAGE_STAGES)[number];

export const GOOGLE_TRENDS_PRE_DOWNLOAD_STAGES = [
  'QUERY_GROUP',
  'GEOGRAPHY',
  'DATE_RANGE',
  'FIXED_FILTERS',
] as const satisfies readonly GoogleTrendsConfiguredPageStage[];

export type GoogleTrendsPreDownloadStage =
  (typeof GOOGLE_TRENDS_PRE_DOWNLOAD_STAGES)[number];

export class GoogleTrendsConfiguredPageExportError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'GoogleTrendsConfiguredPageExportError';
  }
}

export interface GoogleTrendsConfiguredPageStageInput {
  page: ManagedBrowserPage;
  queries: readonly string[];
  requested_date_start: string;
  requested_date_end: string;
  ui_action_timeout_ms?: number;

  /**
   * Optional bounded diagnostic hook.
   *
   * Emits only a fixed stage identifier before each provider UI step.
   * It must never receive page text, selectors, cookies, URLs, or
   * authentication/session material.
   */
  on_stage?: (
    stage: GoogleTrendsConfiguredPageStage,
  ) => void;
}

export interface ApplyGoogleTrendsConfiguredPageThroughStageInput
  extends GoogleTrendsConfiguredPageStageInput
{
  through_stage:
    GoogleTrendsPreDownloadStage;

  /**
   * Emits only after the named module resolves successfully.
   * A failed module is never reported as completed.
   */
  on_stage_completed?: (
    stage: GoogleTrendsPreDownloadStage,
  ) => void;
}

export interface ApplyGoogleTrendsConfiguredPageThroughStageResult {
  completed_stages:
    readonly GoogleTrendsPreDownloadStage[];
}

export interface ExportConfiguredGoogleTrendsPageInput
  extends GoogleTrendsConfiguredPageStageInput
{
  download_timeout_ms?: number;
}

export interface ExportPreconfiguredGoogleTrendsPageInput {
  page: ManagedBrowserPage;
  ui_action_timeout_ms?: number;
  download_timeout_ms?: number;
  on_stage?: (
    stage:
      | 'FIXED_FILTERS'
      | 'DOWNLOAD',
  ) => void;
}

export interface GoogleTrendsConfiguredPageExportResult {
  media_type: typeof CSV_MEDIA_TYPE;
  bytes: Uint8Array;
  provider_filename: string;
  byte_size: number;
  sha256: string;
}

export interface GoogleTrendsConfiguredPageExportDependencies {
  apply_query_group:
    typeof applyGoogleTrendsSearchTermQueryGroup;
  apply_turkey_geography:
    typeof applyGoogleTrendsTurkeyGeography;
  apply_custom_date_range:
    typeof applyGoogleTrendsCustomDateRange;
  verify_fixed_filters:
    typeof verifyGoogleTrendsFixedFilters;
  download_interest_over_time:
    typeof downloadGoogleTrendsInterestOverTime;
}

const DEFAULT_DEPENDENCIES:
  GoogleTrendsConfiguredPageExportDependencies = {
    apply_query_group:
      applyGoogleTrendsSearchTermQueryGroup,
    apply_turkey_geography:
      applyGoogleTrendsTurkeyGeography,
    apply_custom_date_range:
      applyGoogleTrendsCustomDateRange,
    verify_fixed_filters:
      verifyGoogleTrendsFixedFilters,
    download_interest_over_time:
      downloadGoogleTrendsInterestOverTime,
  };

const sha256 = (
  bytes: Uint8Array,
): string =>
  createHash(
    'sha256',
  )
    .update(bytes)
    .digest('hex');

const assertCapturedDownloadIntegrity = (
  persisted:
    CapturedBrowserDownload,
): void => {
  if (
    persisted.bytes.byteLength !==
    persisted.byte_size
  ) {
    throw new GoogleTrendsConfiguredPageExportError(
      `Captured provider download byte-size mismatch: metadata=${persisted.byte_size}, bytes=${persisted.bytes.byteLength}.`,
    );
  }

  const capturedSha256 =
    sha256(
      persisted.bytes,
    );

  if (
    capturedSha256 !==
    persisted.sha256
  ) {
    throw new GoogleTrendsConfiguredPageExportError(
      'Captured provider download SHA-256 mismatch.',
    );
  }
};

const assertPreDownloadStage = (
  stage: GoogleTrendsPreDownloadStage,
): void => {
  if (
    !GOOGLE_TRENDS_PRE_DOWNLOAD_STAGES.includes(
      stage,
    )
  ) {
    throw new GoogleTrendsConfiguredPageExportError(
      `Unsupported Google Trends pre-download stage: ${String(stage)}.`,
    );
  }
};

/**
 * Executes the configured Google Trends modules only through the
 * requested pre-download acceptance gate.
 *
 * This is the common production path for both staged live evidence and
 * the complete export chain. Earlier successful modules are prerequisites
 * for later modules, but only the target module and its prerequisites run;
 * download is never triggered by this function.
 */
export const applyGoogleTrendsConfiguredPageThroughStage =
  async (
    input:
      ApplyGoogleTrendsConfiguredPageThroughStageInput,
    dependencies:
      GoogleTrendsConfiguredPageExportDependencies =
        DEFAULT_DEPENDENCIES,
  ): Promise<ApplyGoogleTrendsConfiguredPageThroughStageResult> => {
    assertPreDownloadStage(
      input.through_stage,
    );

    const uiTimeout =
      input.ui_action_timeout_ms;

    const completedStages:
      GoogleTrendsPreDownloadStage[] = [];

    for (const stage of
      GOOGLE_TRENDS_PRE_DOWNLOAD_STAGES) {
      input.on_stage?.(
        stage,
      );

      if (stage === 'QUERY_GROUP') {
        await dependencies.apply_query_group({
          page:
            input.page,
          queries:
            input.queries,
          ...(uiTimeout === undefined
            ? {}
            : {
                ui_action_timeout_ms:
                  uiTimeout,
              }),
        });
      } else if (stage === 'GEOGRAPHY') {
        await dependencies.apply_turkey_geography({
          page:
            input.page,
          ...(uiTimeout === undefined
            ? {}
            : {
                ui_action_timeout_ms:
                  uiTimeout,
              }),
        });
      } else if (stage === 'DATE_RANGE') {
        await dependencies.apply_custom_date_range({
          page:
            input.page,
          requested_date_start:
            input.requested_date_start,
          requested_date_end:
            input.requested_date_end,
          ...(uiTimeout === undefined
            ? {}
            : {
                ui_action_timeout_ms:
                  uiTimeout,
              }),
        });
      } else {
        await dependencies.verify_fixed_filters({
          page:
            input.page,
          ...(uiTimeout === undefined
            ? {}
            : {
                ui_read_timeout_ms:
                  uiTimeout,
              }),
        });
      }

      completedStages.push(
        stage,
      );

      input.on_stage_completed?.(
        stage,
      );

      if (
        stage === input.through_stage
      ) {
        return {
          completed_stages:
            completedStages,
        };
      }
    }

    throw new GoogleTrendsConfiguredPageExportError(
      `Google Trends pre-download stage was not reached: ${input.through_stage}.`,
    );
  };

/**
 * Executes the already-discovered classic Google Trends UI workflow on
 * an already-open Explore page:
 *
 * ordered Search Term query group
 * → Türkiye
 * → exact custom date range
 * → verify All categories + Web Search
 * → scoped Interest over time CSV download
 *
 * The provider download is captured as byte evidence without first
 * writing a user-visible Downloads copy. Its size and SHA-256 evidence
 * are checked before the bytes are returned to the shared
 * CollectionOrchestrator, which owns canonical run-scoped persistence.
 *
 * This service deliberately does not navigate, refresh, retry, perform
 * authentication, or decide run/job state.
 */
export const exportConfiguredGoogleTrendsPage =
  async (
    input:
      ExportConfiguredGoogleTrendsPageInput,
    dependencies:
      GoogleTrendsConfiguredPageExportDependencies =
        DEFAULT_DEPENDENCIES,
  ): Promise<GoogleTrendsConfiguredPageExportResult> => {
    const uiTimeout =
      input.ui_action_timeout_ms;

    await applyGoogleTrendsConfiguredPageThroughStage({
      page:
        input.page,
      queries:
        input.queries,
      requested_date_start:
        input.requested_date_start,
      requested_date_end:
        input.requested_date_end,
      through_stage:
        'FIXED_FILTERS',
      ...(input.on_stage === undefined
        ? {}
        : {
            on_stage:
              input.on_stage,
          }),
      ...(uiTimeout === undefined
        ? {}
        : {
            ui_action_timeout_ms:
              uiTimeout,
          }),
    }, dependencies);

    input.on_stage?.(
      'DOWNLOAD',
    );

    const capturedDownload =
      await dependencies
        .download_interest_over_time({
          page:
            input.page,
          ...(input.download_timeout_ms ===
          undefined
            ? {}
            : {
                download_timeout_ms:
                  input.download_timeout_ms,
              }),
          ...(uiTimeout === undefined
            ? {}
            : {
                ui_action_timeout_ms:
                  uiTimeout,
              }),
        });

    assertCapturedDownloadIntegrity(
      capturedDownload,
    );

    return {
      media_type:
        CSV_MEDIA_TYPE,
      bytes:
        new Uint8Array(
          capturedDownload.bytes,
        ),
      provider_filename:
        capturedDownload.suggested_filename,
      byte_size:
        capturedDownload.byte_size,
      sha256:
        capturedDownload.sha256,
    };
  };

/**
 * Exports an Explore page whose ordered queries, geography, and exact date
 * range were already configured and verified by the single navigation URL.
 *
 * The remaining production waterfall is deliberately small:
 *
 * verify All categories + Web Search
 * → select the strongest ready Interest over time download strategy
 * → capture and integrity-check exact provider bytes
 *
 * It never retypes queries, mutates geography/date, navigates, refreshes, or
 * retries. The older UI-mutation composition remains available for bounded
 * diagnostics and compatibility evidence, but is not the runtime default.
 */
export const exportPreconfiguredGoogleTrendsPage =
  async (
    input:
      ExportPreconfiguredGoogleTrendsPageInput,
    dependencies:
      GoogleTrendsConfiguredPageExportDependencies =
        DEFAULT_DEPENDENCIES,
  ): Promise<GoogleTrendsConfiguredPageExportResult> => {
    const uiTimeout =
      input.ui_action_timeout_ms;

    input.on_stage?.(
      'FIXED_FILTERS',
    );

    await dependencies.verify_fixed_filters({
      page:
        input.page,
      ...(uiTimeout === undefined
        ? {}
        : {
            ui_read_timeout_ms:
              uiTimeout,
          }),
    });

    input.on_stage?.(
      'DOWNLOAD',
    );

    const capturedDownload =
      await dependencies
        .download_interest_over_time({
          page:
            input.page,
          ...(input.download_timeout_ms ===
          undefined
            ? {}
            : {
                download_timeout_ms:
                  input.download_timeout_ms,
              }),
          ...(uiTimeout === undefined
            ? {}
            : {
                ui_action_timeout_ms:
                  uiTimeout,
              }),
        });

    assertCapturedDownloadIntegrity(
      capturedDownload,
    );

    return {
      media_type:
        CSV_MEDIA_TYPE,
      bytes:
        new Uint8Array(
          capturedDownload.bytes,
        ),
      provider_filename:
        capturedDownload.suggested_filename,
      byte_size:
        capturedDownload.byte_size,
      sha256:
        capturedDownload.sha256,
    };
  };
