import type {
  CollectionValidationContext,
  SourceCollectionContext,
} from '../../../shared/collection';
import type {
  QueryGroup,
} from '../../../shared/query-config';
import type {
  JobRecord,
  QueryGroupRunConfigurationSnapshot,
  RequestedCollectionConfiguration,
  RunRecord,
} from '../../../shared/run-job';

export class GoogleTrendsSourceContextError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name = 'GoogleTrendsSourceContextError';
  }
}

export type GoogleTrendsCollectionContext =
  SourceCollectionContext & {
    requested_configuration:
      RequestedCollectionConfiguration;
    query_group: QueryGroup;
  };

export type GoogleTrendsValidationContext =
  CollectionValidationContext & {
    run: RunRecord & {
      requested_configuration:
        RequestedCollectionConfiguration;
      configuration_snapshot:
        QueryGroupRunConfigurationSnapshot;
    };
    query_group: QueryGroup;
  };

const requireQueryGroup = (
  sourceContext: JobRecord['source_context'] | undefined,
  jobKey: string,
  persistedQueryGroupId: string | null,
): QueryGroup => {
  if (sourceContext === undefined) {
    throw new GoogleTrendsSourceContextError(
      'Google Trends source_context must be an object.',
    );
  }

  const rawGroup = sourceContext.query_group;

  if (
    typeof rawGroup !== 'object' ||
    rawGroup === null ||
    Array.isArray(rawGroup)
  ) {
    throw new GoogleTrendsSourceContextError(
      'Google Trends source_context.query_group must be an object.',
    );
  }

  const queryGroupId = rawGroup.query_group_id;
  const queryGroupName = rawGroup.query_group_name;
  const queries = rawGroup.queries;

  if (
    typeof queryGroupId !== 'string' ||
    queryGroupId.length === 0 ||
    typeof queryGroupName !== 'string' ||
    queryGroupName.length === 0 ||
    !Array.isArray(queries) ||
    queries.length === 0 ||
    !queries.every(
      (query) =>
        typeof query === 'string' &&
        query.length > 0,
    )
  ) {
    throw new GoogleTrendsSourceContextError(
      'Google Trends source_context.query_group is invalid.',
    );
  }

  if (
    persistedQueryGroupId === null ||
    queryGroupId !== persistedQueryGroupId ||
    queryGroupId !== jobKey
  ) {
    throw new GoogleTrendsSourceContextError(
      'Google Trends source context must match job_key and query_group_id.',
    );
  }

  return {
    query_group_id: queryGroupId,
    query_group_name: queryGroupName,
    queries: [...(queries as string[])],
  };
};

const requireRunContext = (
  run: RunRecord,
): GoogleTrendsValidationContext['run'] => {
  const snapshot = run.configuration_snapshot;

  if (
    run.requested_configuration === null ||
    snapshot.source_id !== 'google-trends' ||
    !Array.isArray(snapshot.selected_query_groups)
  ) {
    throw new GoogleTrendsSourceContextError(
      'Google Trends requires a valid query-group run snapshot.',
    );
  }

  return {
    ...run,
    requested_configuration:
      run.requested_configuration,
    configuration_snapshot:
      snapshot as QueryGroupRunConfigurationSnapshot,
  };
};

export const adaptGoogleTrendsCollectionContext = (
  context: SourceCollectionContext,
): GoogleTrendsCollectionContext => {
  if (
    context.source_id !== 'google-trends' ||
    context.requested_configuration === null
  ) {
    throw new GoogleTrendsSourceContextError(
      'Google Trends collection context is inconsistent.',
    );
  }

  return {
    ...context,
    requested_configuration:
      context.requested_configuration,
    query_group: requireQueryGroup(
      context.source_context,
      context.job_key,
      context.query_group_id,
    ),
  };
};

export const adaptGoogleTrendsValidationContext = (
  context: CollectionValidationContext,
): GoogleTrendsValidationContext => ({
  ...context,
  run: requireRunContext(context.run),
  query_group: requireQueryGroup(
    context.job.source_context,
    context.job.job_key,
    context.job.query_group_id,
  ),
});

export const requireGoogleTrendsQueryGroup = (
  job: JobRecord,
): QueryGroup =>
  requireQueryGroup(
    job.source_context,
    job.job_key,
    job.query_group_id,
  );
