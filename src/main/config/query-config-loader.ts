import {
  access,
  copyFile,
  readdir,
  readFile,
} from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';

import type { ApplicationDirectories } from '../../shared/bootstrap-status';
import type {
  QueryConfig,
  QueryGroup,
} from '../../shared/query-config';

const GOOGLE_TRENDS_SOURCE_ID = 'google-trends';
const GOOGLE_TRENDS_GROUP_ID_PATTERN = /^GT[0-9]{2}$/;
const SUPPORTED_CONFIG_VERSION = 1;
const SUPPORTED_CONFIG_FILENAMES = [
  'query-groups.yaml',
  'query-groups.yml',
  'query-groups.json',
  'query-groups.csv',
] as const;
const CSV_COLUMNS = [
  'version',
  'source',
  'group_id',
  'group_name',
  'query_order',
  'query',
] as const;

type UnknownRecord = Record<string, unknown>;

export class QueryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryConfigError';
  }
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value);

const assertExactKeys = (
  value: UnknownRecord,
  allowedKeys: readonly string[],
  context: string,
): void => {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).filter(
    (key) => !allowed.has(key),
  );

  if (unexpected.length > 0) {
    throw new QueryConfigError(
      `${context} contains unsupported field(s): ${unexpected.join(', ')}`,
    );
  }
};

const requireNonEmptyString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new QueryConfigError(
      `${fieldName} must be a non-empty string.`,
    );
  }

  if (value !== value.trim()) {
    throw new QueryConfigError(
      `${fieldName} must not contain leading or trailing whitespace.`,
    );
  }

  return value;
};

const normalizeGroup = (
  rawGroup: unknown,
  groupIndex: number,
  sourceId: string,
): QueryGroup => {
  const context = `groups[${groupIndex}]`;

  if (!isRecord(rawGroup)) {
    throw new QueryConfigError(`${context} must be an object.`);
  }

  assertExactKeys(
    rawGroup,
    ['id', 'name', 'queries'],
    context,
  );

  const queryGroupId = requireNonEmptyString(
    rawGroup.id,
    `${context}.id`,
  );
  const queryGroupName = requireNonEmptyString(
    rawGroup.name,
    `${context}.name`,
  );

  if (
    sourceId === GOOGLE_TRENDS_SOURCE_ID &&
    !GOOGLE_TRENDS_GROUP_ID_PATTERN.test(queryGroupId)
  ) {
    throw new QueryConfigError(
      `${context}.id must match ^GT[0-9]{2}$ for google-trends.`,
    );
  }

  if (!Array.isArray(rawGroup.queries)) {
    throw new QueryConfigError(
      `${context}.queries must be an ordered array.`,
    );
  }

  if (rawGroup.queries.length === 0) {
    throw new QueryConfigError(
      `${context}.queries must contain at least one query.`,
    );
  }

  const queries = rawGroup.queries.map((query, queryIndex) =>
    requireNonEmptyString(
      query,
      `${context}.queries[${queryIndex}]`,
    ),
  );

  const uniqueQueries = new Set(queries);

  if (uniqueQueries.size !== queries.length) {
    throw new QueryConfigError(
      `${context}.queries contains a duplicate query.`,
    );
  }

  return {
    query_group_id: queryGroupId,
    query_group_name: queryGroupName,
    queries,
  };
};

export const normalizeQueryConfig = (
  rawConfig: unknown,
): QueryConfig => {
  if (!isRecord(rawConfig)) {
    throw new QueryConfigError(
      'Query configuration root must be an object.',
    );
  }

  assertExactKeys(
    rawConfig,
    ['version', 'source', 'groups'],
    'configuration',
  );

  if (
    typeof rawConfig.version !== 'number' ||
    !Number.isInteger(rawConfig.version) ||
    rawConfig.version !== SUPPORTED_CONFIG_VERSION
  ) {
    throw new QueryConfigError(
      `configuration.version must equal ${SUPPORTED_CONFIG_VERSION}.`,
    );
  }

  const sourceId = requireNonEmptyString(
    rawConfig.source,
    'configuration.source',
  );

  if (sourceId !== GOOGLE_TRENDS_SOURCE_ID) {
    throw new QueryConfigError(
      `configuration.source must be "${GOOGLE_TRENDS_SOURCE_ID}" in the Google Trends MVP.`,
    );
  }

  if (!Array.isArray(rawConfig.groups)) {
    throw new QueryConfigError(
      'configuration.groups must be an ordered array.',
    );
  }

  if (rawConfig.groups.length === 0) {
    throw new QueryConfigError(
      'configuration.groups must contain at least one group.',
    );
  }

  const groups = rawConfig.groups.map((group, groupIndex) =>
    normalizeGroup(group, groupIndex, sourceId),
  );

  const seenGroupIds = new Set<string>();

  for (const group of groups) {
    if (seenGroupIds.has(group.query_group_id)) {
      throw new QueryConfigError(
        `Duplicate query_group_id: ${group.query_group_id}`,
      );
    }

    seenGroupIds.add(group.query_group_id);
  }

  return {
    config_version: rawConfig.version,
    source_id: sourceId,
    groups,
  };
};

const parseCsvRows = (
  source: string,
): string[][] => {
  const text =
    source
      .replace(/^\uFEFF/u, '')
      .replace(/\r\n/gu, '\n')
      .replace(/\r/gu, '\n');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted =
    false;
  let quoteClosed =
    false;

  const pushField = (): void => {
    row.push(field);
    field = '';
    quoteClosed =
      false;
  };

  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    const character =
      text[index];

    if (quoted) {
      if (character === '"') {
        if (
          text[index + 1] ===
          '"'
        ) {
          field += '"';
          index += 1;
        } else {
          quoted =
            false;
          quoteClosed =
            true;
        }
      } else {
        field += character;
      }

      continue;
    }

    if (quoteClosed) {
      if (character === ',') {
        pushField();
      } else if (
        character === '\n'
      ) {
        pushRow();
      } else {
        throw new QueryConfigError(
          `CSV parse error at character ${index}: expected comma or row terminator after a quoted field.`,
        );
      }

      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new QueryConfigError(
          `CSV parse error at character ${index}: quote inside an unquoted field.`,
        );
      }

      quoted =
        true;
    } else if (
      character === ','
    ) {
      pushField();
    } else if (
      character === '\n'
    ) {
      pushRow();
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new QueryConfigError(
      'CSV parse error: file ended inside a quoted field.',
    );
  }

  if (
    field.length > 0 ||
    row.length > 0 ||
    quoteClosed
  ) {
    pushRow();
  }

  return rows.filter(
    (candidate) =>
      candidate.some(
        (cell) =>
          cell.length > 0,
      ),
  );
};

const parseCsvConfig = (
  source: string,
): unknown => {
  const rows =
    parseCsvRows(
      source,
    );

  if (rows.length < 2) {
    throw new QueryConfigError(
      'CSV configuration must contain a header and at least one query row.',
    );
  }

  const header =
    rows[0];

  if (
    header.length !==
      CSV_COLUMNS.length ||
    !header.every(
      (column, index) =>
        column ===
        CSV_COLUMNS[index],
    )
  ) {
    throw new QueryConfigError(
      `CSV header must equal: ${CSV_COLUMNS.join(',')}`,
    );
  }

  interface CsvGroup {
    id: string;
    name: string;
    queries: Map<number, string>;
  }

  const groups =
    new Map<string, CsvGroup>();
  let version:
    number | null = null;
  let sourceId:
    string | null = null;

  for (
    let rowIndex = 1;
    rowIndex < rows.length;
    rowIndex += 1
  ) {
    const cells =
      rows[rowIndex];
    const context =
      `CSV row ${rowIndex + 1}`;

    if (
      cells.length !==
      CSV_COLUMNS.length
    ) {
      throw new QueryConfigError(
        `${context} must contain exactly ${CSV_COLUMNS.length} columns.`,
      );
    }

    const rowVersion =
      Number(cells[0]);

    if (
      !Number.isSafeInteger(
        rowVersion,
      )
    ) {
      throw new QueryConfigError(
        `${context}.version must be an integer.`,
      );
    }

    const rowSource =
      requireNonEmptyString(
        cells[1],
        `${context}.source`,
      );
    const groupId =
      requireNonEmptyString(
        cells[2],
        `${context}.group_id`,
      );
    const groupName =
      requireNonEmptyString(
        cells[3],
        `${context}.group_name`,
      );
    const queryOrder =
      Number(cells[4]);
    const query =
      requireNonEmptyString(
        cells[5],
        `${context}.query`,
      );

    if (
      !Number.isSafeInteger(
        queryOrder,
      ) ||
      queryOrder < 1
    ) {
      throw new QueryConfigError(
        `${context}.query_order must be a positive integer.`,
      );
    }

    if (
      version !== null &&
      version !== rowVersion
    ) {
      throw new QueryConfigError(
        `${context}.version does not match earlier rows.`,
      );
    }

    if (
      sourceId !== null &&
      sourceId !== rowSource
    ) {
      throw new QueryConfigError(
        `${context}.source does not match earlier rows.`,
      );
    }

    version =
      rowVersion;
    sourceId =
      rowSource;

    const existing =
      groups.get(
        groupId,
      );

    if (
      existing !== undefined &&
      existing.name !== groupName
    ) {
      throw new QueryConfigError(
        `${context}.group_name conflicts with earlier rows for ${groupId}.`,
      );
    }

    const group =
      existing ?? {
        id: groupId,
        name: groupName,
        queries:
          new Map<number, string>(),
      };

    if (
      group.queries.has(
        queryOrder,
      )
    ) {
      throw new QueryConfigError(
        `${context}.query_order duplicates ${queryOrder} for ${groupId}.`,
      );
    }

    group.queries.set(
      queryOrder,
      query,
    );
    groups.set(
      groupId,
      group,
    );
  }

  return {
    version,
    source:
      sourceId,
    groups:
      [...groups.values()].map(
        (group) => {
          const ordered =
            [...group.queries.entries()]
              .sort(
                (left, right) =>
                  left[0] -
                  right[0],
              );

          ordered.forEach(
            ([order], index) => {
              if (
                order !==
                index + 1
              ) {
                throw new QueryConfigError(
                  `CSV query_order for ${group.id} must be contiguous from 1.`,
                );
              }
            },
          );

          return {
            id: group.id,
            name: group.name,
            queries:
              ordered.map(
                ([, query]) =>
                  query,
              ),
          };
        },
      ),
  };
};

const parseYamlConfig = (
  source: string,
): unknown => {
  const document =
    parseDocument(source, {
      prettyErrors: true,
      strict: true,
      uniqueKeys: true,
      version: '1.2',
    });

  if (document.errors.length > 0) {
    throw new QueryConfigError(
      `YAML parse error: ${document.errors[0].message}`,
    );
  }

  if (document.warnings.length > 0) {
    throw new QueryConfigError(
      `YAML warning rejected: ${document.warnings[0].message}`,
    );
  }

  return document.toJS({
    maxAliasCount: 0,
  }) as unknown;
};

export const loadQueryConfig = async (
  configPath: string,
): Promise<QueryConfig> => {
  const source = await readFile(configPath, 'utf8');
  const extension =
    path.extname(
      configPath,
    ).toLowerCase();
  let rawConfig:
    unknown;

  if (
    extension === '.yaml' ||
    extension === '.yml'
  ) {
    rawConfig =
      parseYamlConfig(
        source,
      );
  } else if (
    extension === '.json'
  ) {
    try {
      rawConfig =
        JSON.parse(
          source,
        ) as unknown;
    } catch (error: unknown) {
      throw new QueryConfigError(
        `JSON parse error: ${
          error instanceof Error
            ? error.message
            : 'invalid JSON'
        }`,
      );
    }
  } else if (
    extension === '.csv'
  ) {
    rawConfig =
      parseCsvConfig(
        source,
      );
  } else {
    throw new QueryConfigError(
      `Unsupported query configuration extension: ${extension || '(none)'}`,
    );
  }

  return normalizeQueryConfig(rawConfig);
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const ensureExternalQueryConfig = async (
  directories: ApplicationDirectories,
  packagedConfigRoot: string,
): Promise<string> => {
  const configuredFiles =
    (await readdir(
      directories.config,
    )).filter(
      (filename) =>
        (
          SUPPORTED_CONFIG_FILENAMES as readonly string[]
        ).includes(
          filename,
        ),
    );

  if (configuredFiles.length > 1) {
    throw new QueryConfigError(
      `Multiple query configuration files found: ${configuredFiles.join(', ')}`,
    );
  }

  if (configuredFiles.length === 1) {
    return path.join(
      directories.config,
      configuredFiles[0],
    );
  }

  const externalConfigPath =
    path.join(
      directories.config,
      'query-groups.yaml',
    );
  const defaultConfigPath =
    path.join(
      packagedConfigRoot,
      'config',
      'query-groups.yaml',
    );

  if (
    !(await fileExists(
      externalConfigPath,
    ))
  ) {
    await copyFile(
      defaultConfigPath,
      externalConfigPath,
    );
  }

  return externalConfigPath;
};
