import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import writeXlsxFile, { type SheetData } from 'write-excel-file/node';
import type { DataPackage } from '../../shared/data-package';

type ExportCell = string | number | boolean | null;
type ExportRow = Record<string, ExportCell>;

interface KeywordPlannerTables {
  metrics: ExportRow[];
  monthly: ExportRow[];
  request_map: ExportRow[];
  run_metadata: ExportRow[];
}

const asObject = (
  value: unknown,
): Record<string, unknown> | null => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const stringOrNull = (
  value: unknown,
): string | null => (
  typeof value === 'string'
    ? value
    : null
);

const numberOrNull = (
  value: unknown,
): number | null => (
  typeof value === 'number'
  && Number.isFinite(value)
    ? value
    : null
);

const exportCell = (
  value: unknown,
): ExportCell => {
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  return null;
};

const csvValue = (
  value: ExportCell,
): string => {
  if (value === null) return '';

  const serialized = String(value);

  if (
    serialized.includes(',')
    || serialized.includes('"')
    || serialized.includes('\n')
    || serialized.includes('\r')
  ) {
    return `"${serialized.replace(/"/gu, '""')}"`;
  }

  return serialized;
};

const serializeCsv = (
  rows: readonly ExportRow[],
): string => {
  if (rows.length === 0) return '';

  const columns = Object.keys(rows[0]);

  return `${[
    columns.map(csvValue).join(','),
    ...rows.map((row) => (
      columns
        .map((column) => csvValue(row[column] ?? null))
        .join(',')
    )),
  ].join('\n')}\n`;
};

const toSheetData = (
  rows: readonly ExportRow[],
): SheetData => {
  if (rows.length === 0) {
    return [[{ value: 'No rows' }]];
  }

  const columns = Object.keys(rows[0]);

  return [
    columns.map((column) => ({
      value: column,
      fontWeight: 'bold' as const,
    })),
    ...rows.map((row) => (
      columns.map((column) => ({
        value: row[column] ?? undefined,
      }))
    )),
  ];
};

const resolveProviderKeyword = (
  row: Record<string, unknown>,
): string | null => (
  stringOrNull(row.returned_keyword)
  ?? stringOrNull(row.provider_keyword)
  ?? stringOrNull(row.text)
);

const resolveRequestedKeyword = (
  row: Record<string, unknown>,
): string | null => stringOrNull(row.requested_keyword);

const mappingFor = (
  requested: string | null,
  provider: string | null,
  row: Record<string, unknown>,
): string | null => {
  if (requested === null || provider === null) return null;

  if (requested === provider) return 'EXACT';

  const closeVariants =
    Array.isArray(row.close_variants)
      ? row.close_variants.filter(
          (value): value is string =>
            typeof value === 'string',
        )
      : [];

  return closeVariants.includes(requested)
    ? 'CLOSE_VARIANT'
    : null;
};

export const buildKeywordPlannerUserTables = (
  dataPackage: DataPackage,
): KeywordPlannerTables | null => {
  const datasets = dataPackage.datasets.filter((dataset) => (
    dataset.source_id === 'google-keyword-planner'
    && dataset.dataset_type === 'KEYWORD_HISTORICAL_METRICS'
  ));

  if (datasets.length === 0) return null;

  const tables: KeywordPlannerTables = {
    metrics: [],
    monthly: [],
    request_map: [],
    run_metadata: [],
  };

  for (const dataset of datasets) {
    const provenance = asObject(dataset.provenance) ?? {};
    const requestedContext =
      asObject(provenance.requested_context) ?? {};

    const groupId =
      stringOrNull(requestedContext.group_id)
      ?? dataset.job_key;

    const groupName =
      stringOrNull(requestedContext.group_name);

    const requestedKeywords = Array.isArray(
      requestedContext.keywords,
    )
      ? requestedContext.keywords.filter(
          (value): value is string =>
            typeof value === 'string',
        )
      : [];

    for (const rawRow of dataset.rows) {
      const row = asObject(rawRow) ?? {};
      const requestedKeyword =
        resolveRequestedKeyword(row);
      const providerKeyword =
        resolveProviderKeyword(row);

      const matchedRequestedKeywords =
        Array.isArray(
          row.matched_requested_keywords,
        )
          ? row.matched_requested_keywords.filter(
              (value): value is string =>
                typeof value === 'string',
            )
          : (
              requestedKeyword === null
                ? []
                : [requestedKeyword]
            );

      const requestedKeywordLabel =
        matchedRequestedKeywords.length > 0
          ? matchedRequestedKeywords.join(' | ')
          : requestedKeyword;

      const matchedMappings =
        matchedRequestedKeywords.map(
          (keyword) =>
            mappingFor(
              keyword,
              providerKeyword,
              row,
            ),
        );

      const metricsMapping =
        matchedMappings.includes('CLOSE_VARIANT')
          ? 'CLOSE_VARIANT'
          : matchedMappings.includes('EXACT')
            ? 'EXACT'
            : mappingFor(
                requestedKeyword,
                providerKeyword,
                row,
              );

      tables.metrics.push({
        'Group ID': groupId,
        'Requested Keyword(s)': requestedKeywordLabel,
        'Provider Keyword': providerKeyword,
        Mapping: metricsMapping,
        'Avg monthly searches':
          exportCell(row.avg_monthly_searches),
        Competition:
          exportCell(row.competition),
        'Competition index':
          exportCell(row.competition_index),
        'Top of page bid low':
          exportCell(row.top_of_page_bid_low),
        'Top of page bid high':
          exportCell(row.top_of_page_bid_high),
        '3 month change':
          exportCell(row.change_3_month),
        'YoY change':
          exportCell(row.change_yoy),
      });

      const monthlyHistory =
        Array.isArray(row.monthly_history)
          ? row.monthly_history
          : [];

      for (const rawMonth of monthlyHistory) {
        const month = asObject(rawMonth);
        if (month === null) continue;

        tables.monthly.push({
          'Group ID': groupId,
          'Requested Keyword(s)': requestedKeywordLabel,
          'Provider Keyword': providerKeyword,
          Year: numberOrNull(month.year),
          Month: numberOrNull(month.month),
          'Monthly searches':
            exportCell(month.searches),
        });
      }
    }

    for (const keyword of requestedKeywords) {
      const matchedRow = dataset.rows
        .map(asObject)
        .find((row) => {
          if (row === null) return false;

          const matchedRequestedKeywords =
            Array.isArray(
              row.matched_requested_keywords,
            )
              ? row.matched_requested_keywords.filter(
                  (value): value is string =>
                    typeof value === 'string',
                )
              : [];

          return (
            matchedRequestedKeywords.includes(keyword)
            || resolveRequestedKeyword(row) === keyword
          );
        });

      const providerKeyword =
        matchedRow == null
          ? null
          : resolveProviderKeyword(matchedRow);

      tables.request_map.push({
        'Group ID': groupId,
        'Requested Keyword': keyword,
        'Provider Keyword': providerKeyword,
        Mapping: mappingFor(
          keyword,
          providerKeyword,
          matchedRow ?? {},
        ),
      });
    }

    tables.run_metadata.push({
      run_id:
        stringOrNull(provenance.run_id)
        ?? dataPackage.manifest.run_id,
      job_id:
        stringOrNull(provenance.job_id)
        ?? dataset.job_id,
      group_id: groupId,
      group_name: groupName,
      source_id: dataset.source_id,
      source_mode:
        stringOrNull(requestedContext.source_mode),
      requested_date_start:
        stringOrNull(
          requestedContext.requested_date_start,
        ),
      requested_date_end:
        stringOrNull(
          requestedContext.requested_date_end,
        ),
      country_code:
        stringOrNull(requestedContext.country_code),
      language_code:
        stringOrNull(requestedContext.language_code),
      keyword_plan_network:
        stringOrNull(
          requestedContext.keyword_plan_network,
        ),
      acquired_at:
        stringOrNull(provenance.acquired_at),
      validation_status:
        stringOrNull(
          provenance.validation_status,
        ),
      raw_artifact_id:
        stringOrNull(provenance.raw_artifact_id),
      raw_artifact_filename:
        stringOrNull(
          provenance.raw_artifact_filename,
        ),
      raw_artifact_sha256:
        stringOrNull(
          provenance.raw_artifact_sha256,
        ),
    });
  }

  return tables;
};

export const writeKeywordPlannerUserExport = async (
  directory: string,
  dataPackage: DataPackage,
): Promise<void> => {
  const tables =
    buildKeywordPlannerUserTables(dataPackage);

  if (tables === null) return;

  const csvDefinitions = [
    ['keyword-planner_metrics.csv', tables.metrics],
    ['keyword-planner_monthly.csv', tables.monthly],
    [
      'keyword-planner_request-map.csv',
      tables.request_map,
    ],
    [
      'keyword-planner_run-metadata.csv',
      tables.run_metadata,
    ],
  ] as const;

  for (const [filename, rows] of csvDefinitions) {
    await writeFile(
      path.join(directory, filename),
      serializeCsv(rows),
      'utf8',
    );
  }

  const workbookPath = path.join(
    directory,
    `keyword-planner-historical-metrics_${dataPackage.manifest.run_id}.xlsx`,
  );

  await writeXlsxFile([
    {
      data: toSheetData(tables.metrics),
      sheet: 'KWP_METRICS',
    },
    {
      data: toSheetData(tables.monthly),
      sheet: 'KWP_MONTHLY',
    },
    {
      data: toSheetData(tables.request_map),
      sheet: 'KWP_REQUEST_MAP',
    },
    {
      data: toSheetData(tables.run_metadata),
      sheet: 'RUN_METADATA',
    },
  ]).toFile(workbookPath);
};
