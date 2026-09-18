import {
  readFile,
} from 'node:fs/promises';
import type {
  CollectionValidationContext,
  CollectionValidationDecision,
  CollectionValidator,
} from '../../../shared/collection';
import {
  GOOGLE_KEYWORD_PLANNER_CSV_SOURCE_ID,
} from '../../../shared/google-api';
import {
  parseKeywordPlannerManualCsv,
} from './keyword-planner-csv-parser';
import {
  createKeywordPlannerCsvJobContext,
} from './keyword-planner-csv-request';

export class KeywordPlannerManualCsvValidator
implements CollectionValidator {
  async validate(
    context: CollectionValidationContext,
  ): Promise<CollectionValidationDecision> {
    try {
      if (
        context.job.source_id
          !== GOOGLE_KEYWORD_PLANNER_CSV_SOURCE_ID
        || context.artifact.source_id
          !== GOOGLE_KEYWORD_PLANNER_CSV_SOURCE_ID
      ) {
        throw new Error(
          'Keyword Planner manual CSV source identity is invalid.',
        );
      }

      createKeywordPlannerCsvJobContext(
        context.source_context,
      );

      const parsed =
        parseKeywordPlannerManualCsv(
          new Uint8Array(
            await readFile(
              context.absolute_path,
            ),
          ),
        );

      return {
        validation_status:
          parsed.rows.length > 0
            ? 'VALID'
            : 'NO_DATA',
        checks_total:
          5,
        checks_passed:
          5,
        checks_warning:
          0,
        checks_failed:
          0,
        findings:
          [],
      };
    } catch (error) {
      return {
        validation_status:
          'INVALID_SCHEMA',
        checks_total:
          1,
        checks_passed:
          0,
        checks_warning:
          0,
        checks_failed:
          1,
        findings: [{
          check_id:
            'KEYWORD_PLANNER_CSV_SCHEMA',
          severity:
            'ERROR',
          passed:
            false,
          message:
            error instanceof Error
              ? error.message
              : 'Invalid Keyword Planner manual CSV.',
          expected:
            'Observed UTF-16LE tab-delimited Keyword Stats export with FILE_IMPORT provenance',
          actual:
            'Unsupported or malformed import evidence',
        }],
      };
    }
  }
}

