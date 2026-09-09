import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import writeXlsxFile, {
  type SheetData,
} from 'write-excel-file/node';

import type {
  ArtifactRecord,
} from '../../shared/artifact';
import type {
  ApplicationDirectories,
} from '../../shared/bootstrap-status';
import type {
  JobRecord,
  QueryGroupRunConfigurationSnapshot,
  RequestedCollectionConfiguration,
  RunRecord,
} from '../../shared/run-job';
import type {
  ValidationFinding,
} from '../../shared/validation-detail';
import type {
  ValidationSummaryRecord,
} from '../../shared/validation-summary';

import {
  parseGoogleTrendsInterestOverTimeCsv,
} from '../sources/google-trends/google-trends-interest-over-time-parser';
import {
  getDatabasePath,
  initializeDatabase,
} from '../storage/database';
import {
  StateRepository,
} from '../storage/state-repository';
import {
  StorageManager,
} from '../storage/storage-manager';

const GOOGLE_TRENDS_SOURCE_ID =
  'google-trends';
const CSV_MEDIA_TYPE =
  'text/csv; charset=utf-8';

type ExportCell =
  | string
  | number
  | boolean
  | null;

type ExportRow =
  Record<string, ExportCell>;

interface NormalizedExportData {
  run_metadata:
    ExportRow[];
  query_universe:
    ExportRow[];
  google_trends_rows:
    ExportRow[];
  validation_log:
    ExportRow[];
  error_log:
    ExportRow[];
}

export interface GoogleTrendsExportResult {
  run_id: string;
  export_directory: string;
  workbook_path: string;
  csv_paths: string[];
  normalized_row_count:
    number;
}

export interface GenerateGoogleTrendsExportInput {
  directories:
    ApplicationDirectories;
  run_id: string;
  now?: () => Date;
}

const CSV_DEFINITIONS = [
  {
    filename:
      'RUN_METADATA.csv',
    key:
      'run_metadata',
  },
  {
    filename:
      'QUERY_UNIVERSE.csv',
    key:
      'query_universe',
  },
  {
    filename:
      'GT_24M_RAW.csv',
    key:
      'google_trends_rows',
  },
  {
    filename:
      'VALIDATION_LOG.csv',
    key:
      'validation_log',
  },
  {
    filename:
      'ERROR_LOG.csv',
    key:
      'error_log',
  },
] as const;

const WORKBOOK_SHEETS = [
  {
    name:
      'RUN_METADATA',
    key:
      'run_metadata',
  },
  {
    name:
      'QUERY_UNIVERSE',
    key:
      'query_universe',
  },
  {
    name:
      'GT_24M_RAW',
    key:
      'google_trends_rows',
  },
  {
    name:
      'VALIDATION_LOG',
    key:
      'validation_log',
  },
  {
    name:
      'ERROR_LOG',
    key:
      'error_log',
  },
] as const;

const csvValue = (
  value: ExportCell,
): string => {
  if (value === null) {
    return '';
  }

  const serialized =
    String(value);

  if (
    serialized.includes(',') ||
    serialized.includes('"') ||
    serialized.includes('\n') ||
    serialized.includes('\r')
  ) {
    return `"${serialized.replace(/"/gu, '""')}"`;
  }

  return serialized;
};

const serializeCsv = (
  rows: readonly ExportRow[],
): Uint8Array => {
  if (rows.length === 0) {
    return Buffer.from(
      '',
      'utf8',
    );
  }

  const columns =
    Object.keys(
      rows[0],
    );
  const lines = [
    columns.map(csvValue).join(','),
    ...rows.map(
      (row) =>
        columns
          .map(
            (column) =>
              csvValue(
                row[column] ??
                  null,
              ),
          )
          .join(','),
    ),
  ];

  return Buffer.from(
    `${lines.join('\n')}\n`,
    'utf8',
  );
};

const assertInside = (
  parent: string,
  candidate: string,
): void => {
  const relative =
    path.relative(
      parent,
      candidate,
    );

  if (
    relative === '' ||
    (
      !relative.startsWith(
        `..${path.sep}`,
      ) &&
      relative !== '..' &&
      !path.isAbsolute(
        relative,
      )
    )
  ) {
    return;
  }

  throw new Error(
    'Export input path escaped the persisted run directory.',
  );
};

const resolveRunFile = (
  runDirectory: string,
  relativePath: string,
): string => {
  if (
    relativePath.length === 0 ||
    path.isAbsolute(
      relativePath,
    )
  ) {
    throw new Error(
      'Persisted run-relative path is invalid.',
    );
  }

  const absolutePath =
    path.resolve(
      runDirectory,
      ...relativePath.split('/'),
    );

  assertInside(
    runDirectory,
    absolutePath,
  );

  return absolutePath;
};

const requireExportableRun = (
  repository:
    StateRepository,
  runId: string,
): {
  run: RunRecord;
  jobs: JobRecord[];
} => {
  const run =
    repository.getRun(
      runId,
    );

  if (run === null) {
    throw new Error(
      `Unknown export run: ${runId}`,
    );
  }

  if (
    run.run_status !==
      'COMPLETED' &&
    run.run_status !==
      'COMPLETED_WITH_WARNINGS'
  ) {
    throw new Error(
      `Run ${runId} is not exportable from ${run.run_status}.`,
    );
  }

  const jobs =
    repository.listJobs(
      runId,
    );

  if (
    jobs.length === 0 ||
    jobs.some(
      (job) =>
        job.execution_status !==
          'COMPLETED' ||
        job.accepted_artifact_id ===
          null,
    )
  ) {
    throw new Error(
      `Run ${runId} does not contain a complete accepted job set.`,
    );
  }

  return {
    run,
    jobs,
  };
};

const requireAcceptedArtifact = (
  repository:
    StateRepository,
  job: JobRecord,
): ArtifactRecord => {
  const artifact =
    job.accepted_artifact_id ===
      null
      ? null
      : repository.getArtifact(
          job.accepted_artifact_id,
        );

  if (
    artifact === null ||
    artifact.run_id !==
      job.run_id ||
    artifact.job_id !==
      job.job_id ||
    artifact.source_id !==
      GOOGLE_TRENDS_SOURCE_ID ||
    (
      artifact.artifact_state !==
        'ACCEPTED' &&
      artifact.artifact_state !==
        'ACCEPTED_WITH_WARNING'
    )
  ) {
    throw new Error(
      `Job ${job.job_id} has no valid accepted Google Trends raw artifact.`,
    );
  }

  return artifact;
};

const requireValidation = (
  repository:
    StateRepository,
  job: JobRecord,
  artifact: ArtifactRecord,
): ValidationSummaryRecord => {
  const validation =
    repository
      .listValidationSummaries(
        job.job_id,
      )
      .find(
        (candidate) =>
          candidate.artifact_id ===
          artifact.artifact_id,
      );

  if (
    validation === undefined ||
    validation.validation_json_path ===
      null ||
    validation.validation_status !==
      job.validation_status
  ) {
    throw new Error(
      `Accepted artifact ${artifact.artifact_id} has no linked validation evidence.`,
    );
  }

  return validation;
};

const readValidationFindings =
  async (
    runDirectory: string,
    validation:
      ValidationSummaryRecord,
  ): Promise<ValidationFinding[]> => {
    const validationPath =
      resolveRunFile(
        runDirectory,
        validation.validation_json_path as string,
      );
    const document =
      JSON.parse(
        await readFile(
          validationPath,
          'utf8',
        ),
      ) as unknown;

    if (
      typeof document !==
        'object' ||
      document === null ||
      !('findings' in document) ||
      !Array.isArray(
        document.findings,
      )
    ) {
      throw new Error(
        `Validation detail is invalid: ${validation.validation_id}`,
      );
    }

    return document.findings as ValidationFinding[];
  };

const stringifyJsonCell = (
  value: unknown,
): string =>
  JSON.stringify(
    value,
  );

const normalizeEnum = (
  value: string,
): string =>
  value
    .trim()
    .replace(/[ -]+/gu, '_')
    .toUpperCase();

const createExportData =
  async (
    repository:
      StateRepository,
    runDirectory: string,
    run: RunRecord,
    jobs: readonly JobRecord[],
  ): Promise<NormalizedExportData> => {
    const requested =
      run.requested_configuration;
    const snapshot =
      run.configuration_snapshot;

    if (
      requested === null ||
      snapshot.source_id !==
        GOOGLE_TRENDS_SOURCE_ID ||
      !Array.isArray(
        snapshot.selected_query_groups,
      )
    ) {
      throw new Error(
        `Run ${run.run_id} does not contain a Google Trends configuration snapshot.`,
      );
    }

    const googleTrendsSnapshot =
      snapshot as QueryGroupRunConfigurationSnapshot;
    const googleTrendsRequested =
      requested as RequestedCollectionConfiguration;
    const queryUniverse:
      ExportRow[] = [];
    const trendsRows:
      ExportRow[] = [];
    const validationLog:
      ExportRow[] = [];
    const errorLog:
      ExportRow[] = [];

    for (const group of
      googleTrendsSnapshot
        .selected_query_groups) {
      group.queries.forEach(
        (query, index) => {
          queryUniverse.push({
            query_group_id:
              group.query_group_id,
            query_group_name:
              group.query_group_name,
            query_order:
              index + 1,
            query,
            source_id:
              googleTrendsSnapshot
                .source_id,
            active:
              true,
          });
        },
      );
    }

    for (const job of jobs) {
      const artifact =
        requireAcceptedArtifact(
          repository,
          job,
        );
      const validation =
        requireValidation(
          repository,
          job,
          artifact,
        );
      const rawPath =
        resolveRunFile(
          runDirectory,
          artifact.relative_path,
        );
      const parsed =
        parseGoogleTrendsInterestOverTimeCsv(
          await readFile(
            rawPath,
          ),
        );
      const periods =
        parsed.rows.map(
          (row) =>
            row.period_start,
        );
      const actualDateStart =
        periods.reduce(
          (left, right) =>
            left < right
              ? left
              : right,
        );
      const actualDateEnd =
        periods.reduce(
          (left, right) =>
            left > right
              ? left
              : right,
        );

      for (const row of
        parsed.rows) {
        for (const value of
          row.values) {
          trendsRows.push({
            run_id:
              run.run_id,
            job_id:
              job.job_id,
            query_group_id:
              job.query_group_id,
            source_id:
              job.source_id,
            source_mode:
              googleTrendsRequested
                .source_mode,
            dataset_type:
              normalizeEnum(
                googleTrendsRequested
                  .dataset_type,
              ),
            country_code:
              googleTrendsRequested
                .country_code,
            search_type:
              normalizeEnum(
                googleTrendsRequested
                  .search_type,
              ),
            selection_type:
              normalizeEnum(
                googleTrendsRequested
                  .selection_type,
              ),
            requested_date_start:
              googleTrendsRequested
                .requested_date_start,
            requested_date_end:
              googleTrendsRequested
                .requested_date_end,
            actual_date_start:
              actualDateStart,
            actual_date_end:
              actualDateEnd,
            period_start:
              row.period_start,
            period_end:
              null,
            query:
              value.query,
            relative_interest:
              value.relative_interest,
            validation_status:
              validation.validation_status,
            raw_artifact_id:
              artifact.artifact_id,
          });
        }
      }

      const findings =
        await readValidationFindings(
          runDirectory,
          validation,
        );

      for (const finding of
        findings) {
        validationLog.push({
          run_id:
            run.run_id,
          job_id:
            job.job_id,
          query_group_id:
            job.query_group_id,
          artifact_id:
            artifact.artifact_id,
          validation_status:
            validation.validation_status,
          check_id:
            finding.check_id,
          severity:
            finding.severity,
          passed:
            finding.passed,
          message:
            finding.message,
          expected:
            stringifyJsonCell(
              finding.expected,
            ),
          actual:
            stringifyJsonCell(
              finding.actual,
            ),
          validated_at:
            validation.validated_at,
        });
      }

      for (const attempt of
        repository.listAttempts(
          job.job_id,
        )) {
        if (
          attempt.error_code ===
          null
        ) {
          continue;
        }

        errorLog.push({
          run_id:
            run.run_id,
          job_id:
            job.job_id,
          attempt_number:
            attempt.attempt_number,
          source_id:
            job.source_id,
          error_code:
            attempt.error_code,
          error_scope:
            null,
          retryable:
            null,
          message:
            null,
          occurred_at:
            attempt.completed_at,
        });
      }
    }

    return {
      run_metadata: [
        {
          run_id:
            run.run_id,
          run_status:
            run.run_status,
          created_at:
            run.created_at,
          started_at:
            run.started_at,
          completed_at:
            run.completed_at,
          application_version:
            run.application_version,
          source_id:
            googleTrendsSnapshot
              .source_id,
          source_mode:
            googleTrendsRequested
              .source_mode,
          country_code:
            googleTrendsRequested
              .country_code,
          category_name:
            googleTrendsRequested
              .category_name,
          search_type:
            normalizeEnum(
              googleTrendsRequested
                .search_type,
            ),
          selection_type:
            normalizeEnum(
              googleTrendsRequested
                .selection_type,
            ),
          dataset_type:
            normalizeEnum(
              googleTrendsRequested
                .dataset_type,
            ),
          requested_date_start:
            googleTrendsRequested
              .requested_date_start,
          requested_date_end:
            googleTrendsRequested
              .requested_date_end,
          query_group_count:
            jobs.length,
        },
      ],
      query_universe:
        queryUniverse,
      google_trends_rows:
        trendsRows,
      validation_log:
        validationLog,
      error_log:
        errorLog,
    };
  };

const tableSheet = (
  name: string,
  rows: readonly ExportRow[],
) => {
  if (rows.length === 0) {
    return {
      sheet:
        name,
      data: [
        [
          {
            value:
              'No records',
            fontStyle:
              'italic' as const,
            textColor:
              '#667085',
          },
        ],
      ] satisfies SheetData,
      columns: [
        {
          width:
            24,
        },
      ],
    };
  }

  const columns =
    Object.keys(
      rows[0],
    );
  const data:
    SheetData = [
      columns.map(
        (column) => ({
          value:
            column,
          type:
            String,
          fontWeight:
            'bold',
          textColor:
            '#FFFFFF',
          backgroundColor:
            '#173F32',
          wrap:
            true,
        }),
      ),
      ...rows.map(
        (row) =>
          columns.map(
            (column) =>
              row[column] ??
              null,
          ),
      ),
    ];

  return {
    sheet:
      name,
    data,
    columns:
      columns.map(
        (column) => ({
          width:
            Math.min(
              42,
              Math.max(
                12,
                column.length +
                  2,
              ),
            ),
        }),
      ),
    stickyRowsCount:
      1,
  };
};

const createWorkbook =
  async (
    data:
      NormalizedExportData,
  ): Promise<Uint8Array> => {
    const readmeData:
      SheetData = [
        [
          {
            value:
              'Product',
            fontWeight:
              'bold',
            textColor:
              '#173F32',
          },
          'RoofRoom Data Collector',
        ],
        [
          {
            value:
              'Source semantics',
            fontWeight:
              'bold',
            textColor:
              '#173F32',
          },
          'Google Trends values are relative interest (0–100), never estimated search volume.',
        ],
        [
          {
            value:
              'Comparison context',
            fontWeight:
              'bold',
            textColor:
              '#173F32',
          },
          'Each query_group_id is independently normalized and must not be treated as globally comparable.',
        ],
        [
          {
            value:
              'Missing values',
            fontWeight:
              'bold',
            textColor:
              '#173F32',
          },
          'Blank numeric cells mean missing/unavailable; they do not mean zero.',
        ],
        [
          {
            value:
              'Raw evidence',
            fontWeight:
              'bold',
            textColor:
              '#173F32',
          },
          'raw_artifact_id links every normalized row to an immutable provider CSV in the same run directory.',
        ],
      ];
    const sheets = [
      {
        sheet:
          'README',
        data:
          readmeData,
        columns: [
          {
            width:
              28,
          },
          {
            width:
              95,
          },
        ],
      },
      ...WORKBOOK_SHEETS.map(
        (definition) =>
          tableSheet(
            definition.name,
            data[
              definition.key
            ],
          ),
      ),
    ];
    const output =
      await writeXlsxFile(
        sheets,
        {
          fontFamily:
            'Arial',
          fontSize:
            10,
        },
      ).toBuffer();

    return new Uint8Array(
      output,
    );
  };

export const generateGoogleTrendsExport =
  async (
    input:
      GenerateGoogleTrendsExportInput,
  ): Promise<GoogleTrendsExportResult> => {
    const bootstrap =
      initializeDatabase(
        input.directories,
      );

    if (
      bootstrap.status !==
      'READY'
    ) {
      throw new Error(
        `Export database initialization failed: ${bootstrap.error}`,
      );
    }

    const repository =
      new StateRepository(
        getDatabasePath(
          input.directories,
        ),
      );

    try {
      const {
        run,
        jobs,
      } =
        requireExportableRun(
          repository,
          input.run_id,
        );
      const storage =
        await new StorageManager(
          input.directories,
        ).ensureRunSourceDirectories(
          input.run_id,
          GOOGLE_TRENDS_SOURCE_ID,
        );
      const date =
        (input.now ??
          (() => new Date()))()
          .toISOString()
          .slice(0, 10);
      const basename =
        `ROOFROOM_SEARCH_DEMAND_RAW_${date}`;
      const exportDirectory =
        path.resolve(
          storage.exports,
          basename,
        );

      assertInside(
        storage.exports,
        exportDirectory,
      );
      await mkdir(
        exportDirectory,
        {
          recursive:
            false,
        },
      );

      const data =
        await createExportData(
          repository,
          storage.run,
          run,
          jobs,
        );
      const csvPaths:
        string[] = [];

      for (const definition of
        CSV_DEFINITIONS) {
        const outputPath =
          path.resolve(
            exportDirectory,
            definition.filename,
          );

        assertInside(
          exportDirectory,
          outputPath,
        );
        await writeFile(
          outputPath,
          serializeCsv(
            data[
              definition.key
            ],
          ),
          {
            flag:
              'wx',
          },
        );
        csvPaths.push(
          outputPath,
        );
      }

      const readmePath =
        path.resolve(
          exportDirectory,
          'README.txt',
        );
      await writeFile(
        readmePath,
        [
          'RoofRoom Data Collector',
          '',
          'Google Trends values are relative interest (0–100), not search volume.',
          'Comparison groups are independently normalized.',
          'Blank numeric cells mean missing/unavailable, not zero.',
          'Canonical raw provider evidence remains in the same run directory.',
          '',
        ].join('\n'),
        {
          encoding:
            'utf8',
          flag:
            'wx',
        },
      );

      const workbookPath =
        path.resolve(
          storage.exports,
          `${basename}.xlsx`,
        );
      assertInside(
        storage.exports,
        workbookPath,
      );
      await writeFile(
        workbookPath,
        await createWorkbook(
          data,
        ),
        {
          flag:
            'wx',
        },
      );

      return {
        run_id:
          run.run_id,
        export_directory:
          exportDirectory,
        workbook_path:
          workbookPath,
        csv_paths:
          csvPaths,
        normalized_row_count:
          data.google_trends_rows
            .length,
      };
    } finally {
      repository.close();
    }
  };

export const GOOGLE_TRENDS_EXPORT_MEDIA_TYPES = {
  csv:
    CSV_MEDIA_TYPE,
  xlsx:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;
