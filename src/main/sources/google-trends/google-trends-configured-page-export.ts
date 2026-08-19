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

export class GoogleTrendsConfiguredPageExportError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'GoogleTrendsConfiguredPageExportError';
  }
}

export interface ExportConfiguredGoogleTrendsPageInput {
  page: ManagedBrowserPage;
  queries: readonly string[];
  requested_date_start: string;
  requested_date_end: string;
  ui_action_timeout_ms?: number;
  download_timeout_ms?: number;

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

    input.on_stage?.(
      'QUERY_GROUP',
    );

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

    input.on_stage?.(
      'GEOGRAPHY',
    );

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

    input.on_stage?.(
      'DATE_RANGE',
    );

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
