import { readFile } from 'node:fs/promises';
import type {
  CollectionValidationContext,
  CollectionValidationDecision,
  CollectionValidator,
} from '../../../shared/collection';
import {
  GOOGLE_KEYWORD_PLANNER_SOURCE_ID,
} from '../../../shared/google-api';
import {
  normalizeKeywordPlanner,
} from './keyword-planner-adapter';
import {
  createKeywordPlannerJobContext,
} from './keyword-planner-request';

const failure = (
  message: string,
): CollectionValidationDecision => ({
  validation_status: 'INVALID_SCHEMA',
  checks_total: 1,
  checks_passed: 0,
  checks_warning: 0,
  checks_failed: 1,
  findings: [{
    check_id: 'GOOGLE_KEYWORD_PLANNER_RESPONSE',
    severity: 'ERROR',
    passed: false,
    message,
    expected: 'Canonical Google Keyword Planner API response matching source contract',
    actual: 'Artifact did not satisfy Google Keyword Planner API contract',
  }],
});

export class KeywordPlannerValidator
implements CollectionValidator {
  async validate(
    context: CollectionValidationContext,
  ): Promise<CollectionValidationDecision> {
    if (
      context.job.source_id !== GOOGLE_KEYWORD_PLANNER_SOURCE_ID
      || context.artifact.source_id !== GOOGLE_KEYWORD_PLANNER_SOURCE_ID
      || context.job.run_id !== context.run.run_id
      || context.artifact.run_id !== context.run.run_id
    ) {
      return failure(
        'Google Keyword Planner evidence ownership is invalid.',
      );
    }

    try {
      const jobContext = createKeywordPlannerJobContext(context.job.source_context);

      const body =
        JSON.parse(
          await readFile(
            context.absolute_path,
            'utf8',
          ),
        ) as unknown;

      const rows =
        normalizeKeywordPlanner(
          body,
          jobContext.group_id,
          jobContext.keywords,
        );

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
          : 'Google Keyword Planner validation failed.',
      );
    }
  }
}
