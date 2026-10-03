import { readFile } from 'node:fs/promises';
import type {
  CollectionValidationContext,
  CollectionValidationDecision,
  CollectionValidator,
} from '../../../shared/collection';
import {
  flattenGoogleAdsSearchStream,
} from './search-stream-response';
import {
  normalizeGoogleAdsChangeHistoryRows,
} from './google-ads-change-history-adapter';

const SOURCE_ID =
  'google-ads-change-history';

const DATASET_TYPE =
  'CHANGE_HISTORY';

const REQUIRED_ROW_FIELDS = [
  'change_date_time',
  'user_email',
  'client_type',
  'change_resource_type',
  'change_resource_name',
  'resource_change_operation',
] as const;

export interface GoogleAdsChangeHistoryValidationResult {
  status: 'ACCEPTED' | 'NO_DATA';
}

const validateRow = (
  row: unknown,
): void => {
  if (
    typeof row !== 'object'
    || row === null
    || Array.isArray(row)
  ) {
    throw new Error(
      'Google Ads Change History row must be an object.',
    );
  }

  const value =
    row as Record<string, unknown>;

  for (const field of REQUIRED_ROW_FIELDS) {
    if (
      typeof value[field] !== 'string'
    ) {
      throw new Error(
        `Google Ads Change History row field ${field} is required.`,
      );
    }
  }
};

export const validateGoogleAdsChangeHistoryEvidence = (
  input: unknown,
): GoogleAdsChangeHistoryValidationResult => {
  if (
    typeof input !== 'object'
    || input === null
    || Array.isArray(input)
  ) {
    throw new Error(
      'Google Ads Change History evidence must be an object.',
    );
  }

  const evidence =
    input as Record<string, unknown>;

  if (
    evidence.source_id !== SOURCE_ID
    || evidence.dataset_type !== DATASET_TYPE
  ) {
    throw new Error(
      'Google Ads Change History ownership is invalid.',
    );
  }

  if (
    typeof evidence.raw_artifact !== 'object'
    || evidence.raw_artifact === null
  ) {
    throw new Error(
      'Google Ads Change History raw artifact is required.',
    );
  }

  if (!Array.isArray(evidence.rows)) {
    throw new Error(
      'Google Ads Change History rows are required.',
    );
  }

  const rows =
    evidence.rows;

  if (rows.length === 0) {
    return {
      status: 'NO_DATA',
    };
  }

  for (const row of rows) {
    validateRow(row);
  }

  return {
    status: 'ACCEPTED',
  };
};


const failure = (
  message: string,
): CollectionValidationDecision => ({
  validation_status: 'INVALID_SCHEMA',
  checks_total: 1,
  checks_passed: 0,
  checks_warning: 0,
  checks_failed: 1,
  findings: [{
    check_id: 'GOOGLE_ADS_CHANGE_HISTORY_RESPONSE',
    severity: 'ERROR',
    passed: false,
    message,
    expected:
      'Canonical Google Ads Change History evidence matching source contract',
    actual:
      'Artifact did not satisfy Google Ads Change History contract',
  }],
});

export class GoogleAdsChangeHistoryValidator
implements CollectionValidator {
  async validate(
    context: CollectionValidationContext,
  ): Promise<CollectionValidationDecision> {
    if (
      context.job.source_id !== SOURCE_ID
      || context.artifact.source_id !== SOURCE_ID
      || context.job.run_id !== context.run.run_id
      || context.artifact.run_id !== context.run.run_id
    ) {
      return failure(
        'Google Ads Change History evidence ownership is invalid.',
      );
    }

    try {
      const body =
        JSON.parse(
          await readFile(
            context.absolute_path,
            'utf8',
          ),
        ) as unknown;

      const rows =
        normalizeGoogleAdsChangeHistoryRows(
          flattenGoogleAdsSearchStream(body),
        );

      const result =
        validateGoogleAdsChangeHistoryEvidence({
          source_id: SOURCE_ID,
          dataset_type: DATASET_TYPE,
          raw_artifact: body,
          rows,
        });

      return {
        validation_status:
          result.status === 'NO_DATA'
            ? 'NO_DATA'
            : 'VALID',
        checks_total: 1,
        checks_passed: 1,
        checks_warning: 0,
        checks_failed: 0,
        findings: [],
      };
    } catch (error) {
      return failure(
        error instanceof Error
          ? error.message
          : 'Google Ads Change History validation failed.',
      );
    }
  }
}
