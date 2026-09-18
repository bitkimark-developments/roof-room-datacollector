import type {
  CollectingDataSourceModule,
  SourceCollectionContext,
  SourceCollectionResult,
} from '../../../shared/collection';
import {
  GOOGLE_KEYWORD_PLANNER_CSV_SOURCE_ID,
} from '../../../shared/google-api';
import type {
  SourceCapabilities,
  SourceReadinessResult,
} from '../../../shared/source';
import {
  readFileImportEvidence,
} from '../file-import/file-import-evidence';
import {
  keywordPlannerCsvContextFromCollection,
} from './keyword-planner-csv-request';

export class KeywordPlannerManualCsvSource
implements CollectingDataSourceModule {
  readonly id =
    GOOGLE_KEYWORD_PLANNER_CSV_SOURCE_ID;
  readonly name =
    'Google Keyword Planner Manual CSV';
  readonly sourceMode =
    'FILE_IMPORT';
  readonly datasetTypes = [
    'KEYWORD_HISTORICAL_METRICS',
  ];

  getCapabilities(): SourceCapabilities {
    return {
      requires_browser:
        false,
      requires_oauth:
        false,
      may_require_manual_login:
        false,
      supports_custom_date_range:
        false,
      supports_direct_export:
        false,
      supports_api:
        false,
      supports_resume:
        true,
      max_concurrency:
        1,
    };
  }

  async checkReadiness(): Promise<SourceReadinessResult> {
    return {
      source_id:
        this.id,
      readiness_status:
        'READY',
      checked_at:
        new Date().toISOString(),
      message:
        null,
    };
  }

  async collect(
    context: SourceCollectionContext,
  ): Promise<SourceCollectionResult> {
    let jobContext;

    try {
      jobContext =
        keywordPlannerCsvContextFromCollection(
          context,
        );
    } catch {
      return {
        result_type:
          'FAILED',
        error_code:
          'SOURCE_CONFIGURATION_INVALID',
        message:
          'Keyword Planner manual CSV requires a valid reviewed FILE_IMPORT path.',
      };
    }

    try {
      const evidence =
        await readFileImportEvidence(
          jobContext.file_path,
        );

      return {
        result_type:
          'ARTIFACT_PRODUCED',
        preferred_filename:
          'keyword-planner-manual.csv',
        media_type:
          'text/tab-separated-values; charset=utf-16le',
        bytes:
          evidence.bytes,
      };
    } catch (error) {
      return {
        result_type:
          'FAILED',
        error_code:
          'FILE_READ_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to read Keyword Planner manual CSV.',
      };
    }
  }
}

