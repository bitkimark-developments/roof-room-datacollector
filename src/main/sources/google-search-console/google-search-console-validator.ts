import { readFile } from 'node:fs/promises';
import type {
  CollectionValidationContext,
  CollectionValidationDecision,
  CollectionValidator,
} from '../../../shared/collection';
import {
  GSC_QUERY_PAGE_SOURCE_ID,
  GSC_QUERY_SOURCE_ID,
} from '../../../shared/google-api';
import {
  normalizeGscQueryRows,
  normalizeGscRows,
} from './query-page-adapter';

const failure = (
  message: string,
): CollectionValidationDecision => ({
  validation_status: 'INVALID_SCHEMA',
  checks_total: 1,
  checks_passed: 0,
  checks_warning: 0,
  checks_failed: 1,
  findings: [{
    check_id: 'GOOGLE_SEARCH_CONSOLE_RESPONSE',
    severity: 'ERROR',
    passed: false,
    message,
    expected: 'Canonical Google Search Console response matching source contract',
    actual: 'Artifact did not satisfy Google Search Console contract',
  }],
});

export class GoogleSearchConsoleValidator
implements CollectionValidator {
  constructor(
    private readonly sourceId: string,
  ) {}

  async validate(
    context: CollectionValidationContext,
  ): Promise<CollectionValidationDecision> {
    if (
      context.job.source_id !== this.sourceId
      || context.artifact.source_id !== this.sourceId
      || (
        this.sourceId !== GSC_QUERY_PAGE_SOURCE_ID
        && this.sourceId !== GSC_QUERY_SOURCE_ID
      )
    ) {
      return failure(
        'Google Search Console evidence ownership is invalid.',
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

      if (!Array.isArray(body)) {
        throw new Error(
          'GSC artifact must contain the raw pages array.',
        );
      }

      let count = 0;

      for (const page of body) {
        count +=
          this.sourceId === GSC_QUERY_SOURCE_ID
            ? normalizeGscQueryRows(page).length
            : normalizeGscRows(page).length;
      }

      return {
        validation_status:
          count > 0
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
          : 'Google Search Console validation failed.',
      );
    }
  }
}
