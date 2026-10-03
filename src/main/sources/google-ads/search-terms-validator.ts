import { readFile } from 'node:fs/promises';
import type {
  CollectionValidationContext,
  CollectionValidationDecision,
  CollectionValidator,
} from '../../../shared/collection';
import {
  GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID,
} from '../../../shared/google-api';
import {
  normalizeSearchTerms,
} from './search-terms-adapter';

const failure = (
  message: string,
): CollectionValidationDecision => ({
  validation_status: 'INVALID_SCHEMA',
  checks_total: 1,
  checks_passed: 0,
  checks_warning: 0,
  checks_failed: 1,
  findings: [{
    check_id: 'GOOGLE_ADS_SEARCH_TERMS_RESPONSE',
    severity: 'ERROR',
    passed: false,
    message,
    expected: 'Canonical Google Ads Search Terms artifact matching source contract',
    actual: 'Artifact did not satisfy Google Ads Search Terms contract',
  }],
});

export class GoogleAdsSearchTermsValidator
implements CollectionValidator {
  async validate(
    context: CollectionValidationContext,
  ): Promise<CollectionValidationDecision> {
    if (
      context.job.source_id !== GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID
      || context.artifact.source_id !== GOOGLE_ADS_SEARCH_TERMS_SOURCE_ID
      || context.job.run_id !== context.run.run_id
      || context.artifact.run_id !== context.run.run_id
    ) {
      return failure(
        'Google Ads Search Terms evidence ownership is invalid.',
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

      const rows = normalizeSearchTerms(body);

      return {
        validation_status:
          rows.length > 0
            ? 'VALID'
            : 'NO_DATA',
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
          : 'Google Ads Search Terms validation failed.',
      );
    }
  }
}
