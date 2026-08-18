import {
  access,
  copyFile,
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

export const loadQueryConfig = async (
  configPath: string,
): Promise<QueryConfig> => {
  const source = await readFile(configPath, 'utf8');

  const document = parseDocument(source, {
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

  const rawConfig = document.toJS({
    maxAliasCount: 0,
  }) as unknown;

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
  const externalConfigPath = path.join(
    directories.config,
    'query-groups.yaml',
  );

  if (!(await fileExists(externalConfigPath))) {
    const defaultConfigPath = path.join(
      packagedConfigRoot,
      'config',
      'query-groups.yaml',
    );

    await copyFile(defaultConfigPath, externalConfigPath);
  }

  return externalConfigPath;
};
