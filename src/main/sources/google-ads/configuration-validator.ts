import { readFile } from 'node:fs/promises';
import type {
  CollectionValidationContext,
  CollectionValidationDecision,
  CollectionValidator,
  ValidatedDatasetMetadata,
} from '../../../shared/collection';
import {
  GOOGLE_ADS_CONFIGURATION_SOURCE_ID,
  type GoogleAdsConfigurationNormalizedRow,
} from '../../../shared/google-ads-configuration';
import {
  normalizeGoogleAdsConfigurationRows,
} from './configuration-normalizer';
import {
  requireGoogleAdsConfigurationJobContext,
} from './configuration-request';
import {
  flattenGoogleAdsSearchStream,
} from './search-stream-response';

type FailureStatus =
  | 'INVALID_SCHEMA'
  | 'ERROR_NOT_DATA'
  | 'QUERY_MISMATCH';

const failure = (
  status: FailureStatus,
  message: string,
): CollectionValidationDecision => ({
  validation_status: status,
  checks_total: 1,
  checks_passed: 0,
  checks_warning: 0,
  checks_failed: 1,
  findings: [{
    check_id: 'GOOGLE_ADS_CONFIGURATION_RESPONSE',
    severity: 'ERROR',
    passed: false,
    message,
    expected:
      'Canonical Google Ads configuration SearchStream evidence matching the immutable Job',
    actual:
      'Artifact did not satisfy the Google Ads configuration contract',
  }],
});

const validatedMetadata = (): ValidatedDatasetMetadata => ({
  actual_date_start: null,
  actual_date_end: null,
  country_name: null,
});

export class GoogleAdsConfigurationValidator
implements CollectionValidator {
  async validate(
    context: CollectionValidationContext,
  ): Promise<CollectionValidationDecision> {
    if (
      context.job.source_id
        !== GOOGLE_ADS_CONFIGURATION_SOURCE_ID
      || context.artifact.source_id
        !== GOOGLE_ADS_CONFIGURATION_SOURCE_ID
      || context.job.run_id !== context.run.run_id
      || context.attempt.job_id !== context.job.job_id
      || context.artifact.run_id !== context.run.run_id
      || context.artifact.job_id !== context.job.job_id
      || context.artifact.attempt_number
        !== context.attempt.attempt_number
    ) {
      return failure(
        'INVALID_SCHEMA',
        'Google Ads configuration evidence ownership is invalid.',
      );
    }

    let jobContext;

    try {
      jobContext =
        requireGoogleAdsConfigurationJobContext(
          context.source_context,
        );

      if (
        context.job.job_key
        !== jobContext.dataset_type
      ) {
        throw new Error(
          'Google Ads configuration Job key does not match the dataset.',
        );
      }
    } catch (error) {
      return failure(
        'QUERY_MISMATCH',
        error instanceof Error
          ? error.message
          : 'Google Ads configuration Job context is invalid.',
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(
        new TextDecoder().decode(
          await readFile(context.absolute_path),
        ),
      ) as unknown;
    } catch (error) {
      return failure(
        'ERROR_NOT_DATA',
        error instanceof Error
          ? error.message
          : 'Google Ads configuration artifact is unreadable.',
      );
    }

    let rows: Record<string, unknown>[];

    try {
      rows = flattenGoogleAdsSearchStream(body);
    } catch (error) {
      return failure(
        'INVALID_SCHEMA',
        error instanceof Error
          ? error.message
          : 'Google Ads configuration SearchStream envelope is invalid.',
      );
    }

    let normalizedRows:
      GoogleAdsConfigurationNormalizedRow[];

    try {
      normalizedRows =
        normalizeGoogleAdsConfigurationRows(
          jobContext.dataset_type,
          rows,
        );
    } catch (error) {
      return failure(
        'QUERY_MISMATCH',
        error instanceof Error
          ? error.message
          : 'Google Ads configuration row semantics are invalid.',
      );
    }

    if (
      jobContext.dataset_type
        === 'CUSTOMER_CONVERSION_TRACKING_SETTINGS'
    ) {
      if (normalizedRows.length !== 1) {
        return failure(
          'QUERY_MISMATCH',
          'Google Ads customer conversion tracking settings must contain exactly one normalized row.',
        );
      }

      return {
        validation_status: 'VALID',
        checks_total: 5,
        checks_passed: 5,
        checks_warning: 0,
        checks_failed: 0,
        findings: [],
        validated_metadata: validatedMetadata(),
      };
    }

    if (normalizedRows.length === 0) {
      return {
        validation_status: 'NO_DATA',
        checks_total: 5,
        checks_passed: 5,
        checks_warning: 0,
        checks_failed: 0,
        findings: [],
        validated_metadata: validatedMetadata(),
      };
    }

    return {
      validation_status: 'VALID',
      checks_total: 5,
      checks_passed: 5,
      checks_warning: 0,
      checks_failed: 0,
      findings: [],
      validated_metadata: validatedMetadata(),
    };
  }
}
