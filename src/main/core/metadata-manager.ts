import type {
  ArtifactRecord,
} from '../../shared/artifact';
import type {
  AttemptRecord,
} from '../../shared/attempt';
import type {
  DatasetMetadataDocument,
} from '../../shared/metadata';
import type {
  QueryGroup,
} from '../../shared/query-config';
import type {
  JsonObject,
  JobRecord,
  RunRecord,
  ValidationStatus,
} from '../../shared/run-job';

export interface DatasetMetadataSource {
  source_id: string;
  source_name: string;
  source_mode: string;
}

export interface CreateDatasetMetadataInput {
  run: RunRecord;
  job: JobRecord;
  attempt: AttemptRecord;
  raw_artifact: ArtifactRecord;
  source: DatasetMetadataSource;
  source_context: JsonObject;
  acquisition_metadata?: JsonObject;
  validation_status: Exclude<
    ValidationStatus,
    'NOT_RUN'
  >;
  actual_date_start?: string | null;
  actual_date_end?: string | null;
  country_name?: string | null;
}

export class MetadataManager {
  createDatasetMetadata(
    input: CreateDatasetMetadataInput,
  ): DatasetMetadataDocument {
    const {
      run,
      job,
      attempt,
      raw_artifact: rawArtifact,
      source,
    } = input;

    if (
      job.run_id !== run.run_id ||
      attempt.job_id !== job.job_id ||
      rawArtifact.run_id !== run.run_id ||
      rawArtifact.job_id !== job.job_id ||
      rawArtifact.attempt_number !==
        attempt.attempt_number
    ) {
      throw new Error(
        'Dataset metadata context is not internally consistent.',
      );
    }

    if (
      source.source_id !== job.source_id ||
      rawArtifact.source_id !==
        job.source_id
    ) {
      throw new Error(
        'Dataset metadata source context does not match the job.',
      );
    }

    const actualDateStart =
      this.requireNullableDate(
        input.actual_date_start,
        'actual_date_start',
      );

    const actualDateEnd =
      this.requireNullableDate(
        input.actual_date_end,
        'actual_date_end',
      );

    if (
      actualDateStart !== null &&
      actualDateEnd !== null &&
      actualDateStart > actualDateEnd
    ) {
      throw new Error(
        'Dataset metadata actual_date_start must not be after actual_date_end.',
      );
    }

    const countryName =
      this.requireNullableName(
        input.country_name,
        'country_name',
      );

    if (job.query_group_id === null) {
      return {
        schema_version: 2,
        run_id: run.run_id,
        job_id: job.job_id,
        attempt_id: attempt.attempt_id,
        attempt_number:
          attempt.attempt_number,
        source_id: source.source_id,
        source_name: source.source_name,
        source_mode: source.source_mode,
        job_key: job.job_key,
        query_group_id: null,
        source_context: {
          ...input.source_context,
        },
        ...(input.acquisition_metadata === undefined
          ? {}
          : {
              acquisition_metadata: {
                ...input.acquisition_metadata,
              },
            }),
        retrieved_at: rawArtifact.created_at,
        application_version:
          run.application_version,
        raw_artifact_id:
          rawArtifact.artifact_id,
        raw_relative_path:
          rawArtifact.relative_path,
        validation_status:
          input.validation_status,
      };
    }

    const queryGroup =
      this.requireQueryGroup(
        input.source_context,
        job,
      );
    const requested =
      run.requested_configuration;

    if (requested === null) {
      throw new Error(
        'Query-group dataset metadata requires requested configuration.',
      );
    }

    return {
      schema_version: 1,
      run_id: run.run_id,
      job_id: job.job_id,
      attempt_number:
        attempt.attempt_number,

      source_id: source.source_id,
      source_name: source.source_name,
      source_mode: source.source_mode,

      dataset_type:
        requested.dataset_type,

      query_group_id:
        queryGroup.query_group_id,
      query_group_name:
        queryGroup.query_group_name,
      queries: [...queryGroup.queries],

      country_code:
        requested.country_code,
      country_name:
        countryName,
      language_code:
        requested.language_code,

      category_id:
        requested.category_id,
      category_name:
        requested.category_name,
      search_type:
        requested.search_type,
      selection_type:
        requested.selection_type,

      requested_date_start:
        requested.requested_date_start,
      requested_date_end:
        requested.requested_date_end,
      actual_date_start:
        actualDateStart,
      actual_date_end:
        actualDateEnd,

      retrieved_at: rawArtifact.created_at,
      application_version:
        run.application_version,

      raw_artifact_id:
        rawArtifact.artifact_id,
      raw_relative_path:
        rawArtifact.relative_path,

      validation_status:
        input.validation_status,
    };
  }

  private requireQueryGroup(
    sourceContext: JsonObject,
    job: JobRecord,
  ): QueryGroup {
    const rawGroup =
      sourceContext.query_group;

    if (
      typeof rawGroup !== 'object' ||
      rawGroup === null ||
      Array.isArray(rawGroup)
    ) {
      throw new Error(
        'Dataset metadata source_context.query_group must be an object.',
      );
    }

    const queryGroupId =
      rawGroup.query_group_id;
    const queryGroupName =
      rawGroup.query_group_name;
    const queries = rawGroup.queries;

    if (
      typeof queryGroupId !== 'string' ||
      typeof queryGroupName !== 'string' ||
      !Array.isArray(queries) ||
      !queries.every(
        (query) =>
          typeof query === 'string',
      ) ||
      queryGroupId !== job.query_group_id
    ) {
      throw new Error(
        'Dataset metadata query-group context does not match the job.',
      );
    }

    return {
      query_group_id: queryGroupId,
      query_group_name: queryGroupName,
      queries: [...queries],
    };
  }

  private requireNullableDate(
    value:
      string | null | undefined,
    fieldName: string,
  ): string | null {
    if (
      value === undefined ||
      value === null
    ) {
      return null;
    }

    const match =
      /^(\d{4})-(\d{2})-(\d{2})$/u.exec(
        value,
      );

    if (match === null) {
      throw new Error(
        `Dataset metadata ${fieldName} must be an ISO calendar date or null.`,
      );
    }

    const candidate =
      new Date(
        Date.UTC(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
        ),
      );

    if (
      candidate
        .toISOString()
        .slice(0, 10) !== value
    ) {
      throw new Error(
        `Dataset metadata ${fieldName} must be an ISO calendar date or null.`,
      );
    }

    return value;
  }

  private requireNullableName(
    value:
      string | null | undefined,
    fieldName: string,
  ): string | null {
    if (
      value === undefined ||
      value === null
    ) {
      return null;
    }

    const trimmed =
      value.trim();

    if (trimmed.length === 0) {
      throw new Error(
        `Dataset metadata ${fieldName} must be non-empty or null.`,
      );
    }

    return trimmed;
  }
}
