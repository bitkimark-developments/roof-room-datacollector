import {
  readFile,
} from 'node:fs/promises';

import type {
  CollectionValidationContext,
  CollectionValidationDecision,
  CollectionValidator,
} from '../../../shared/collection';

import {
  validateGoogleTrendsInterestOverTimeCsv,
} from './google-trends-interest-over-time-validator';
import {
  adaptGoogleTrendsValidationContext,
  GoogleTrendsSourceContextError,
  type GoogleTrendsValidationContext,
} from './google-trends-source-context';

const GOOGLE_TRENDS_SOURCE_ID =
  'google-trends';

const GOOGLE_TRENDS_SOURCE_MODE =
  'GOOGLE_TRENDS_UI';

const GOOGLE_TRENDS_DATASET_TYPE =
  'INTEREST_OVER_TIME';

const GOOGLE_TRENDS_MVP_COUNTRY_CODE =
  'TR';

const GOOGLE_TRENDS_MVP_COUNTRY_NAME =
  'Turkey';

const GOOGLE_TRENDS_MVP_CATEGORY_NAME =
  'All Categories';

const GOOGLE_TRENDS_MVP_SEARCH_TYPE =
  'Web Search';

const GOOGLE_TRENDS_MVP_SELECTION_TYPE =
  'Search Term';

/**
 * Provider labels observed in the exact M3 Google Trends UI CSV fixture.
 *
 * These are intentionally separate from RoofRoom's canonical requested
 * configuration strings. We do not infer arbitrary country/category labels.
 */
const OBSERVED_PROVIDER_GEOGRAPHY_LABEL =
  'Türkiye';

const OBSERVED_PROVIDER_CATEGORY_LABEL =
  'All categories';

export class GoogleTrendsValidationContextError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      'GoogleTrendsValidationContextError';
  }
}

const requireEqual = (
  actual: string,
  expected: string,
  fieldName: string,
): void => {
  if (actual !== expected) {
    throw new GoogleTrendsValidationContextError(
      `Unsupported Google Trends validation context: ${fieldName} must equal "${expected}", found "${actual}".`,
    );
  }
};

const assertContextConsistency = (
  context: GoogleTrendsValidationContext,
): void => {
  if (
    context.job.run_id !==
      context.run.run_id ||
    context.attempt.job_id !==
      context.job.job_id ||
    context.artifact.run_id !==
      context.run.run_id ||
    context.artifact.job_id !==
      context.job.job_id ||
    context.artifact.attempt_number !==
      context.attempt.attempt_number
  ) {
    throw new GoogleTrendsValidationContextError(
      'Google Trends validation context is internally inconsistent.',
    );
  }

  if (
    context.query_group
      .query_group_id !==
    context.job.query_group_id
  ) {
    throw new GoogleTrendsValidationContextError(
      'Google Trends validation query group does not match the job.',
    );
  }

  if (
    context.run
      .configuration_snapshot
      .source_id !==
      GOOGLE_TRENDS_SOURCE_ID
  ) {
    throw new GoogleTrendsValidationContextError(
      'Google Trends run snapshot source_id is inconsistent with the validator.',
    );
  }

  if (
    context.job.source_id !==
      GOOGLE_TRENDS_SOURCE_ID ||
    context.artifact.source_id !==
      GOOGLE_TRENDS_SOURCE_ID
  ) {
    throw new GoogleTrendsValidationContextError(
      'Google Trends validator received an artifact/job for another source.',
    );
  }
};

const assertSupportedMvpConfiguration = (
  context: GoogleTrendsValidationContext,
): void => {
  const requested =
    context.run
      .requested_configuration;

  requireEqual(
    requested.source_mode,
    GOOGLE_TRENDS_SOURCE_MODE,
    'source_mode',
  );

  requireEqual(
    requested.dataset_type,
    GOOGLE_TRENDS_DATASET_TYPE,
    'dataset_type',
  );

  requireEqual(
    requested.country_code,
    GOOGLE_TRENDS_MVP_COUNTRY_CODE,
    'country_code',
  );

  requireEqual(
    requested.category_name,
    GOOGLE_TRENDS_MVP_CATEGORY_NAME,
    'category_name',
  );

  requireEqual(
    requested.search_type,
    GOOGLE_TRENDS_MVP_SEARCH_TYPE,
    'search_type',
  );

  requireEqual(
    requested.selection_type,
    GOOGLE_TRENDS_MVP_SELECTION_TYPE,
    'selection_type',
  );
};

export class GoogleTrendsCollectionValidator
  implements CollectionValidator
{
  async validate(
    rawContext: CollectionValidationContext,
  ): Promise<CollectionValidationDecision> {
    let context: GoogleTrendsValidationContext;

    try {
      context =
        adaptGoogleTrendsValidationContext(
          rawContext,
        );
    } catch (error: unknown) {
      if (
        error instanceof
          GoogleTrendsSourceContextError
      ) {
        throw new GoogleTrendsValidationContextError(
          `Google Trends validation query group context is invalid: ${error.message}`,
        );
      }

      throw error;
    }

    assertContextConsistency(
      context,
    );

    assertSupportedMvpConfiguration(
      context,
    );

    const bytes =
      await readFile(
        context.absolute_path,
      );

    const validation =
      validateGoogleTrendsInterestOverTimeCsv({
        bytes,
        expected_queries:
          context.query_group.queries,
        requested_date_start:
          context.run
            .requested_configuration
            .requested_date_start,
        requested_date_end:
          context.run
            .requested_configuration
            .requested_date_end,
        expected_category_label:
          OBSERVED_PROVIDER_CATEGORY_LABEL,
        expected_geography_label:
          OBSERVED_PROVIDER_GEOGRAPHY_LABEL,
      });

    if (
      validation.validated_metadata ===
      undefined
    ) {
      return validation;
    }

    const geographyVerified =
      validation.findings.some(
        (finding) =>
          finding.check_id ===
            'GT_GEOGRAPHY' &&
          finding.passed,
      );

    return {
      ...validation,
      validated_metadata: {
        ...validation.validated_metadata,
        country_name:
          geographyVerified
            ? GOOGLE_TRENDS_MVP_COUNTRY_NAME
            : null,
      },
    };
  }
}
