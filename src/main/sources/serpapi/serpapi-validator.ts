import { readFile } from 'node:fs/promises';
import type {
  CollectionValidationContext,
  CollectionValidationDecision,
  CollectionValidator,
} from '../../../shared/collection';
import {
  SERPAPI_SOURCE_ID,
} from '../../../shared/serpapi';
import { parseSerpApiResponse, SerpApiParseError } from './serpapi-parser';
import { requireSerpApiJobContext } from './serpapi-request';

const failure = (
  status: 'ERROR_NOT_DATA' | 'INVALID_SCHEMA' | 'QUERY_MISMATCH',
  message: string,
): CollectionValidationDecision => ({
  validation_status: status,
  checks_total: 1,
  checks_passed: 0,
  checks_warning: 0,
  checks_failed: 1,
  findings: [{
    check_id: 'SERPAPI_RESPONSE',
    severity: 'ERROR',
    passed: false,
    message,
    expected: 'Successful SerpApi Google JSON response',
    actual: 'Provider response did not satisfy the source contract',
  }],
});

export class SerpApiValidator implements CollectionValidator {
  async validate(
    context: CollectionValidationContext,
  ): Promise<CollectionValidationDecision> {
    if (
      context.job.source_id !== SERPAPI_SOURCE_ID ||
      context.artifact.source_id !== SERPAPI_SOURCE_ID ||
      context.job.run_id !== context.run.run_id ||
      context.attempt.job_id !== context.job.job_id ||
      context.artifact.run_id !== context.run.run_id ||
      context.artifact.job_id !== context.job.job_id ||
      context.artifact.attempt_number !== context.attempt.attempt_number
    ) {
      return failure('INVALID_SCHEMA', 'SerpApi validator received another source.');
    }
    try {
      let expected;
      try {
        expected = requireSerpApiJobContext(
          context.source_context,
          context.job.job_key,
        );
      } catch (error) {
        throw new SerpApiParseError(
          'INVALID_SCHEMA',
          error instanceof Error ? error.message : 'SerpApi source_context is invalid.',
        );
      }
      const body = JSON.parse(
        new TextDecoder().decode(await readFile(context.absolute_path)),
      ) as unknown;
      const parsed = parseSerpApiResponse(body, expected);
      return {
        validation_status: parsed.organic_count === 0 ? 'NO_DATA' : 'VALID',
        checks_total: 6,
        checks_passed: 6,
        checks_warning: 0,
        checks_failed: 0,
        findings: [],
      };
    } catch (error) {
      if (error instanceof SerpApiParseError) {
        return failure(
          error.code === 'QUERY_MISMATCH' ? 'QUERY_MISMATCH' :
            error.code === 'CONTEXT_MISMATCH' ? 'QUERY_MISMATCH' :
            error.code === 'ERROR_NOT_DATA' ? 'ERROR_NOT_DATA' : 'INVALID_SCHEMA',
          error.message,
        );
      }
      return failure(
        'ERROR_NOT_DATA',
        error instanceof Error ? error.message : 'SerpApi artifact is unreadable.',
      );
    }
  }
}
