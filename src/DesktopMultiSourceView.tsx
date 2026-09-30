import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  DESKTOP_TASK_CATALOG,
  type CollectionDesktopTaskDefinition,
  type DesktopTaskDefinition,
  type DesktopTaskGroup,
} from './desktop-task-catalog';
import type {
  DesktopReview,
  DesktopCredentialManagedSourceId,
  DesktopReadinessRemediation,
  DesktopReadinessStatus,
  DesktopRunDraft,
  DesktopRunState,
  DesktopWorkspaceConnectionView,
  DesktopWorkspaceView,
} from './shared/desktop-multisource';
import type { FreshnessStatus } from './shared/freshness';
import type {
  ReusableCollectionConfiguration,
  SavedCollectionPresetRecord,
} from './shared/collection-configuration';
import {
  BITKIMARK_VERIFIED_SITEMAP_URLS,
} from './shared/bitkimark-sitemap';
import type {
  GoogleProviderConfigurationComponent,
  GoogleProviderConfigurationStatus,
} from './shared/google-provider-configuration';
import type {
  DesktopTaskPackageReview,
  DesktopTaskPackageStartIntent,
  DesktopTaskPackageSummary,
} from './shared/desktop-task-package';

const NAV_ITEMS = [
  'HOME',
  'TASKS',
  'RUNS',
  'PRESETS',
  'WORKSPACE',
] as const;

type View =
  (typeof NAV_ITEMS)[number];

type UiReadiness =
  | DesktopReadinessStatus
  | 'NOT_YET_AVAILABLE';

type WorkspaceConnectionDraft = {
  site_url: string;
  customer_id: string;
  login_customer_id: string;
};

type WorkspaceConnectionAction =
  | 'MANAGE'
  | 'DISCONNECT'
  | 'CONNECT_GOOGLE'
  | 'RECONNECT_GOOGLE'
  | 'PROVISION_SERPAPI';

const EMPTY_WORKSPACE_CONNECTION_DRAFT: WorkspaceConnectionDraft = {
  site_url: '',
  customer_id: '',
  login_customer_id: '',
};

const CONNECTION_ERROR_COPY: Record<string, string> = {
  INVALID_CONNECTION_INTENT: 'Connection details are invalid.',
  CONNECTION_NOT_FOUND: 'The Workspace connection no longer exists.',
  CONNECTION_ALREADY_EXISTS: 'This Workspace connection already exists.',
  CONNECTION_CONFIGURATION_UNAVAILABLE: 'Main-process Google configuration is unavailable.',
  OAUTH_MANUAL_ACTION_REQUIRED: 'Google authorization needs your attention.',
  OAUTH_ACQUISITION_FAILED: 'Google authorization could not be completed.',
  OAUTH_TOKEN_EXCHANGE_REJECTED: 'Google rejected the OAuth token exchange. Verify the OAuth application configuration and authorize again.',
  OAUTH_TOKEN_EXCHANGE_UNAVAILABLE: 'Google token exchange was unavailable. Check network access and try again.',
  OAUTH_REFRESH_TOKEN_UNAVAILABLE: 'Google did not return an offline refresh token. Authorize again and grant the requested access.',
  OAUTH_CLIENT_REJECTED: 'Google rejected the OAuth Client ID or Client Secret. Replace the OAuth application configuration with a matching client pair.',
  OAUTH_AUTHORIZATION_GRANT_REJECTED: 'Google rejected the authorization grant. Start Connect again and complete the newest browser authorization tab.',
  SECRET_INGRESS_CANCELLED: 'SerpApi API-key entry was cancelled.',
  SECRET_INGRESS_FAILED: 'SerpApi API-key entry could not be completed.',
  SECRET_INPUT_INVALID: 'The SerpApi API key is invalid.',
  CREDENTIAL_PERSISTENCE_FAILED: 'The protected credential could not be saved.',
  CONNECTION_PERSISTENCE_FAILED: 'The Workspace connection could not be saved.',
  CONNECTION_REBIND_FAILED: 'The Workspace connection could not be replaced safely.',
  DISCONNECT_CREDENTIAL_DELETE_FAILED: 'Disconnect could not remove the protected credential safely.',
  DISCONNECT_COMPENSATION_FAILED: 'Disconnect could not restore the previous connection safely.',
};

const GROUPS:
  readonly DesktopTaskGroup[] = [
    'GOOGLE',
    'COMMERCE_SITE',
    'SEARCH_INTELLIGENCE',
  ];

const GROUP_LABELS:
  Record<DesktopTaskGroup, string> = {
    GOOGLE:
      'GOOGLE',
    COMMERCE_SITE:
      'COMMERCE / SITE',
    SEARCH_INTELLIGENCE:
      'SEARCH INTELLIGENCE',
  };

function TaskCard({
  task,
  readiness,
  freshness,
  onOpen,
}: {
  task:
    DesktopTaskDefinition;
  readiness:
    UiReadiness;
  freshness:
    FreshnessStatus;
  onOpen:
    () => void;
}) {
  return (
    <button
      type="button"
      className="rr-task-card"
      data-testid="task-card"
      onClick={onOpen}
    >
      <span
        className="rr-task-card-head"
      >
        <span
          className="rr-kicker"
        >
          DATASET TASK
        </span>

        <span
          className={
            `rr-status rr-status-${readiness.toLowerCase()}`
          }
        >
          {readiness.replaceAll(
            '_',
            ' ',
          )}
        </span>

        <span
          className={
            `rr-status rr-status-${freshness.toLowerCase()}`
          }
        >
          {freshness.replaceAll('_', ' ')}
        </span>
      </span>

      <strong>
        {task.task_name}
      </strong>

      <span>
        {task.description}
      </span>

      <small>
        {task.default_summary}
      </small>
    </button>
  );
}

import type {
  JobRecord,
  JsonObject,
  RunRecord,
} from './shared/run-job';

const getReviewedDateSummary = (
  review: DesktopReview,
): {
  referenceDate: string;
  start: string;
  end: string;
} | null => {
  const reviewed =
    review.reviewed_draft;

  if (reviewed === null) {
    return null;
  }

  const sources =
    reviewed
      .resolved_configuration
      .sources;

  if (
    typeof sources !== 'object'
    || sources === null
    || Array.isArray(sources)
  ) {
    return null;
  }

  const source =
    (sources as JsonObject)[
      reviewed.source_id
    ];

  if (
    typeof source !== 'object'
    || source === null
    || Array.isArray(source)
  ) {
    return null;
  }

  const directStart =
    (source as JsonObject)
      .requested_date_start;

  const directEnd =
    (source as JsonObject)
      .requested_date_end;

  if (
    typeof directStart === 'string'
    && typeof directEnd === 'string'
  ) {
    return {
      referenceDate:
        reviewed.reference_date,
      start:
        directStart,
      end:
        directEnd,
    };
  }

  const ranges =
    (source as JsonObject)
      .date_ranges;

  if (
    !Array.isArray(ranges)
    || ranges.length === 0
  ) {
    return null;
  }

  const first =
    ranges[0];

  if (
    typeof first !== 'object'
    || first === null
    || Array.isArray(first)
  ) {
    return null;
  }

  const range =
    first as JsonObject;

  const start =
    range.requested_date_start;

  const end =
    range.requested_date_end;

  if (
    typeof start !== 'string'
    || typeof end !== 'string'
  ) {
    return null;
  }

  return {
    referenceDate:
      reviewed.reference_date,
    start,
    end,
  };
};

const getReviewedGoogleTrendsSummary = (
  review: DesktopReview,
): {
  groupIds: string[];
} | null => {
  const reviewed =
    review.reviewed_draft;

  if (
    reviewed === null
    || reviewed.source_id !== 'google-trends'
  ) {
    return null;
  }

  const configuration =
    reviewed.resolved_configuration;

  const groups =
    configuration.selected_query_groups;

  if (
    !Array.isArray(groups)
    || groups.length === 0
  ) {
    return null;
  }

  const groupIds:
    string[] = [];

  for (const rawGroup of groups) {
    if (
      typeof rawGroup !== 'object'
      || rawGroup === null
      || Array.isArray(rawGroup)
    ) {
      return null;
    }

    const groupId =
      (rawGroup as JsonObject)
        .query_group_id;

    if (
      typeof groupId !== 'string'
      || groupId.length === 0
    ) {
      return null;
    }

    groupIds.push(
      groupId,
    );
  }

  if (
    configuration.country_code !== 'TR'
    || configuration.category_name
      !== 'All Categories'
    || configuration.search_type
      !== 'WEB_SEARCH'
    || configuration.selection_type
      !== 'SEARCH_TERM'
  ) {
    return null;
  }

  return {
    groupIds,
  };
};

interface KeywordPlannerInputGroup
  extends JsonObject {
  group_id: string;
  group_name: string;
  keywords: string[];
}

interface KeywordPlannerGroupDraft {
  row_id: number;
  group_id: string;
  group_name: string;
  keywords: string;
}

const parseKeywordPlannerGroups = (
  drafts: readonly KeywordPlannerGroupDraft[],
): KeywordPlannerInputGroup[] | null => {
  if (drafts.length === 0) {
    return null;
  }

  const groups:
    KeywordPlannerInputGroup[] = [];

  for (const draft of drafts) {
    const groupId = draft.group_id.trim();
    const groupName = draft.group_name.trim();
    const keywordText = draft.keywords.trim();

    const keywords =
      keywordText
        .split(',')
        .map((keyword) => keyword.trim());

    if (
      !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/iu.test(groupId)
      || groupName.length === 0
      || keywords.length === 0
      || keywords.some(
        (keyword) => keyword.length === 0,
      )
    ) {
      return null;
    }

    groups.push({
      group_id:
        groupId,
      group_name:
        groupName,
      keywords,
    });
  }

  if (
    new Set(
      groups.map((group) => group.group_id),
    ).size !== groups.length
  ) {
    return null;
  }

  return groups;
};

const getReviewedKeywordPlannerGroups = (
  review: DesktopReview,
): KeywordPlannerInputGroup[] | null => {
  const reviewed =
    review.reviewed_draft;

  if (
    reviewed === null
    || reviewed.source_id
      !== 'google-keyword-planner'
  ) {
    return null;
  }

  const sources =
    reviewed.resolved_configuration.sources;

  if (
    typeof sources !== 'object'
    || sources === null
    || Array.isArray(sources)
  ) {
    return null;
  }

  const source =
    (sources as JsonObject)[
      'google-keyword-planner'
    ];

  if (
    typeof source !== 'object'
    || source === null
    || Array.isArray(source)
  ) {
    return null;
  }

  const groups =
    (source as JsonObject).groups;

  if (!Array.isArray(groups)) {
    return null;
  }

  return groups.map(
    (group) => {
      if (
        typeof group !== 'object'
        || group === null
        || Array.isArray(group)
      ) {
        throw new Error(
          'Reviewed Keyword Planner group is invalid.',
        );
      }

      const value =
        group as JsonObject;

      if (
        typeof value.group_id !== 'string'
        || typeof value.group_name !== 'string'
        || !Array.isArray(value.keywords)
        || value.keywords.some(
          (keyword) => typeof keyword !== 'string',
        )
      ) {
        throw new Error(
          'Reviewed Keyword Planner group fields are invalid.',
        );
      }

      return {
        group_id:
          value.group_id,
        group_name:
          value.group_name,
        keywords:
          value.keywords as string[],
      };
    },
  );
};

interface BitkimarkSitemapInput extends JsonObject {
  requested_url: string;
  expected_host: string;
  parent_sitemap_url: string | null;
}

const parseBitkimarkSitemapUrls = (
  value: string,
): BitkimarkSitemapInput[] | null => {
  const urls = value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const rootUrl = BITKIMARK_VERIFIED_SITEMAP_URLS[0];
  const allowed = new Set<string>(BITKIMARK_VERIFIED_SITEMAP_URLS);
  if (urls.length === 0 || urls.length > BITKIMARK_VERIFIED_SITEMAP_URLS.length
    || urls[0] !== rootUrl || new Set(urls).size !== urls.length
    || urls.some((url) => !allowed.has(url))) {
    return null;
  }
  return urls.map((url) => ({
    requested_url: url,
    expected_host: 'bitkimark.com',
    parent_sitemap_url: url === rootUrl ? null : rootUrl,
  }));
};

const getReviewedBitkimarkSitemaps = (
  review: DesktopReview,
): BitkimarkSitemapInput[] | null => {
  const reviewed = review.reviewed_draft;
  if (reviewed === null || reviewed.source_id !== 'bitkimark-sitemap') return null;
  const sources = reviewed.resolved_configuration.sources;
  if (typeof sources !== 'object' || sources === null || Array.isArray(sources)) return null;
  const source = (sources as JsonObject)['bitkimark-sitemap'];
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return null;
  const sitemaps = (source as JsonObject).sitemaps;
  if (!Array.isArray(sitemaps)) return null;
  return sitemaps.map((sitemap) => {
    if (typeof sitemap !== 'object' || sitemap === null || Array.isArray(sitemap)) {
      throw new Error('Reviewed Bitkimark sitemap context is invalid.');
    }
    const value = sitemap as JsonObject;
    const parentSitemapUrl = value.parent_sitemap_url;
    if (typeof value.requested_url !== 'string' || value.expected_host !== 'bitkimark.com'
      || (parentSitemapUrl !== null && typeof parentSitemapUrl !== 'string')) {
      throw new Error('Reviewed Bitkimark sitemap fields are invalid.');
    }
    return {
      requested_url: value.requested_url,
      expected_host: value.expected_host,
      parent_sitemap_url: parentSitemapUrl as string | null,
    };
  });
};

interface SerpApiInputQuery extends JsonObject {
  job_key: string;
  query: string;
}

interface SerpApiQueryDraft {
  row_id: number;
  job_key: string;
  query: string;
}

const parseSerpApiQueries = (
  drafts: readonly SerpApiQueryDraft[],
): SerpApiInputQuery[] | null => {
  if (drafts.length === 0) return null;
  const queries: SerpApiInputQuery[] = [];
  for (const draft of drafts) {
    const jobKey = draft.job_key.trim();
    const query = draft.query.trim();
    if (
      !/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/u.test(jobKey)
      || query.length === 0
      || query.length > 512
    ) {
      return null;
    }
    queries.push({ job_key: jobKey, query });
  }
  if (new Set(queries.map((query) => query.job_key)).size !== queries.length) return null;
  return queries;
};

const getReviewedSerpApiQueries = (
  review: DesktopReview,
): SerpApiInputQuery[] | null => {
  const reviewed = review.reviewed_draft;
  if (reviewed === null || reviewed.source_id !== 'serpapi') return null;
  const sources = reviewed.resolved_configuration.sources;
  if (typeof sources !== 'object' || sources === null || Array.isArray(sources)) return null;
  const source = (sources as JsonObject).serpapi;
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return null;
  const rawQueries = (source as JsonObject).queries;
  if (!Array.isArray(rawQueries) || rawQueries.length === 0) return null;
  return rawQueries.map((rawQuery) => {
    if (typeof rawQuery !== 'object' || rawQuery === null || Array.isArray(rawQuery)) {
      throw new Error('Reviewed SerpApi query context is invalid.');
    }
    const value = rawQuery as JsonObject;
    if (
      typeof value.job_key !== 'string'
      || typeof value.query !== 'string'
      || value.task_id !== 'serpapi-serp-snapshot'
      || value.source_id !== 'serpapi'
      || value.source_mode !== 'THIRD_PARTY_API'
      || value.dataset_type !== 'GOOGLE_SERP'
      || value.country_code !== 'TR'
      || value.language_code !== 'tr'
      || value.device !== 'desktop'
      || value.engine !== 'google'
      || value.organic_limit !== 10
      || value.snapshot_date !== reviewed.reference_date
    ) {
      throw new Error('Reviewed SerpApi query fields are invalid.');
    }
    return { job_key: value.job_key, query: value.query };
  });
};

const formatFileSize = (
  bytes: number,
): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatStatus = (
  value: string,
): string => value.replaceAll('_', ' ');

const formatTimestamp = (
  value: string | null,
): string => value === null
  ? 'Not yet'
  : new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));

const getRunTaskIds = (
  run: RunRecord,
): string[] => {
  const snapshot = run.configuration_snapshot as JsonObject;
  const sources = snapshot.sources;

  if (
    typeof sources !== 'object'
    || sources === null
    || Array.isArray(sources)
  ) {
    return [];
  }

  return Object.values(sources).flatMap((source) => {
    if (
      typeof source !== 'object'
      || source === null
      || Array.isArray(source)
    ) {
      return [];
    }

    const taskId = (source as JsonObject).task_id;
    return typeof taskId === 'string' ? [taskId] : [];
  });
};

const getRunDisplayName = (
  run: RunRecord,
): string => {
  const taskNames = getRunTaskIds(run).map((taskId) => (
    DESKTOP_TASK_CATALOG.find((task) => task.task_id === taskId)?.task_name
    ?? taskId
  ));

  if (taskNames.length > 0) {
    return taskNames.join(' · ');
  }

  return run.selected_sources.map((sourceId) => (
    DESKTOP_TASK_CATALOG.find((task) => (
      task.task_kind === 'COLLECTION' && task.source_id === sourceId
    ))?.task_name
    ?? sourceId
  )).join(' · ');
};

const runIncludesTask = (
  run: RunRecord,
  task: CollectionDesktopTaskDefinition,
): boolean => {
  const taskIds = getRunTaskIds(run);
  return taskIds.length > 0
    ? taskIds.includes(task.task_id)
    : run.selected_sources.includes(task.source_id);
};

const getJobDisplayName = (
  job: JobRecord,
): string => {
  const taskId = job.source_context.task_id;
  if (typeof taskId === 'string') {
    return DESKTOP_TASK_CATALOG.find((task) => task.task_id === taskId)?.task_name
      ?? taskId;
  }

  return DESKTOP_TASK_CATALOG.find((task) => (
    task.task_kind === 'COLLECTION' && task.source_id === job.source_id
  ))
    ?.task_name
    ?? job.source_id;
};

const getReusableSources = (
  configuration: ReusableCollectionConfiguration,
): JsonObject => {
  const sources = configuration.sources;
  return typeof sources === 'object'
    && sources !== null
    && !Array.isArray(sources)
    ? sources as JsonObject
    : {};
};

export function DesktopMultiSourceView() {
  const [
    view,
    setView,
  ] =
    useState<View>(
      'HOME',
    );

  const [
    selectedTask,
    setSelectedTask,
  ] =
    useState<
      DesktopTaskDefinition
      | null
    >(null);

  const [
    workspaceView,
    setWorkspaceView,
  ] =
    useState<
      DesktopWorkspaceView
      | null
    >(null);

  const [
    workspaceId,
    setWorkspaceId,
  ] =
    useState('');

  const [
    workspaceConnections,
    setWorkspaceConnections,
  ] =
    useState<
      DesktopWorkspaceConnectionView[]
    >([]);

  const [
    workspaceConnectionDrafts,
    setWorkspaceConnectionDrafts,
  ] = useState<Partial<Record<
    DesktopCredentialManagedSourceId,
    WorkspaceConnectionDraft
  >>>({});

  const [
    pendingWorkspaceConnectionSource,
    setPendingWorkspaceConnectionSource,
  ] = useState<DesktopCredentialManagedSourceId | null>(null);

  const [
    googleProviderConfiguration,
    setGoogleProviderConfiguration,
  ] = useState<GoogleProviderConfigurationStatus | null>(null);

  const [
    pendingGoogleProviderComponent,
    setPendingGoogleProviderComponent,
  ] = useState<GoogleProviderConfigurationComponent | null>(null);

  const [
    presets,
    setPresets,
  ] =
    useState<
      SavedCollectionPresetRecord[]
    >([]);

  const [
    presetId,
    setPresetId,
  ] =
    useState('');

  const [
    draft,
    setDraft,
  ] =
    useState<
      DesktopRunDraft
      | null
    >(null);

  const [
    version,
    setVersion,
  ] =
    useState('');

  const [
    systemReady,
    setSystemReady,
  ] =
    useState<boolean | null>(
      null,
    );

  const [
    selectedIkasFile,
    setSelectedIkasFile,
  ] =
    useState<{
      file_path: string;
      file_name: string;
      file_size_bytes: number;
      file_type: 'XLSX' | 'CSV';
    } | null>(
      null,
    );

  const [
    selectedKeywordPlannerCsvFile,
    setSelectedKeywordPlannerCsvFile,
  ] =
    useState<{
      file_path: string;
      file_name: string;
      file_size_bytes: number;
      file_type: 'XLSX' | 'CSV';
    } | null>(
      null,
    );

  const [
    keywordPlannerGroupDrafts,
    setKeywordPlannerGroupDrafts,
  ] = useState<KeywordPlannerGroupDraft[]>([
    {
      row_id: 1,
      group_id: '',
      group_name: '',
      keywords: '',
    },
  ]);

  const [
    bitkimarkSitemapUrlsInput,
    setBitkimarkSitemapUrlsInput,
  ] = useState(
    BITKIMARK_VERIFIED_SITEMAP_URLS.join('\n'),
  );

  const [
    serpApiQueryDrafts,
    setSerpApiQueryDrafts,
  ] = useState<SerpApiQueryDraft[]>([
    {
      row_id: 1,
      job_key: '',
      query: '',
    },
  ]);

  const [
    quickRunReview,
    setQuickRunReview,
  ] =
    useState<{
      draft: DesktopRunDraft;
      review: DesktopReview;
    } | null>(
      null,
    );

  const [
    taskPackageReview,
    setTaskPackageReview,
  ] = useState<DesktopTaskPackageReview | null>(null);

  const [
    publishedTaskPackage,
    setPublishedTaskPackage,
  ] = useState<DesktopTaskPackageSummary | null>(null);

  const [
    taskPackageCollectionIntent,
    setTaskPackageCollectionIntent,
  ] = useState<DesktopTaskPackageStartIntent | null>(null);

  const [
    taskPackageCollectionRunId,
    setTaskPackageCollectionRunId,
  ] = useState<string | null>(null);

  const [
    activeRunState,
    setActiveRunState,
  ] =
    useState<
      Awaited<
        ReturnType<
          typeof window.roofroom.startDesktopDraft
        >
      > | null
    >(
      null,
    );

  const [
    runHistory,
    setRunHistory,
  ] =
    useState<
      Awaited<
        ReturnType<
          typeof window.roofroom.listDesktopRuns
        >
      >
    >(
      [],
    );

  const [
    taskRecentRunStates,
    setTaskRecentRunStates,
  ] = useState<Record<string, DesktopRunState>>({});

  const [
    exportResult,
    setExportResult,
  ] =
    useState<
      Awaited<
        ReturnType<
          typeof window.roofroom.exportDesktopRun
        >
      > | null
    >(
      null,
    );

  const [
    newPresetName,
    setNewPresetName,
  ] =
    useState('');

  const [
    newPresetTaskIds,
    setNewPresetTaskIds,
  ] = useState<string[]>([]);

  const [
    presetEditorName,
    setPresetEditorName,
  ] = useState('');

  const [
    presetEditorConfiguration,
    setPresetEditorConfiguration,
  ] = useState<ReusableCollectionConfiguration>({ sources: {} });

  const [
    presetEditorDirty,
    setPresetEditorDirty,
  ] = useState(false);

  const [
    presetReview,
    setPresetReview,
  ] = useState<{
    draft: DesktopRunDraft;
    review: DesktopReview;
  } | null>(null);

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState<
      string
      | null
    >(null);

  useEffect(() => {
    if (
      view !== 'RUNS'
      && view !== 'TASKS'
      && view !== 'HOME'
      || workspaceId.length === 0
    ) {
      return;
    }

    let mounted =
      true;

    setRunHistory(
      [],
    );

    void window.roofroom
      .listDesktopRuns(
        workspaceId,
      )
      .then(
        (nextRuns) => {
          if (mounted === true) {
            setRunHistory(
              nextRuns,
            );
          }
        },
      )
      .catch(
        (error) => {
          if (mounted === true) {
            setMessage(
              error instanceof Error
                ? error.message
                : 'Run History yüklenemedi.',
            );
          }
        },
      );

    return () => {
      mounted =
        false;
    };
  }, [
    view,
    workspaceId,
  ]);

  useEffect(() => {
    if (
      selectedTask === null
      || selectedTask.task_kind !== 'COLLECTION'
      || runHistory.length === 0
    ) {
      setTaskRecentRunStates({});
      return;
    }

    let mounted = true;
    const matchingRuns = runHistory
      .filter((run) => runIncludesTask(run, selectedTask))
      .slice(0, 5);

    void Promise.all(
      matchingRuns.map(async (run) => {
        try {
          return await window.roofroom.getDesktopRunState(run.run_id);
        } catch {
          return null;
        }
      }),
    ).then((states) => {
      if (!mounted) return;
      setTaskRecentRunStates(Object.fromEntries(
        states
          .filter((state): state is DesktopRunState => state !== null)
          .map((state) => [state.run.run_id, state]),
      ));
    });

    return () => {
      mounted = false;
    };
  }, [
    runHistory,
    selectedTask,
  ]);

  useEffect(() => {
    if (activeRunState === null) {
      return;
    }

    const runStatus =
      activeRunState.run.run_status;

    const heartbeatMs =
      runStatus === 'PENDING'
      || runStatus === 'RUNNING'
        ? 2000
        : runStatus === 'MANUAL_ACTION_REQUIRED'
          ? 5000
          : null;

    if (heartbeatMs === null) {
      return;
    }

    const runId =
      activeRunState.run.run_id;

    const timeoutId =
      window.setTimeout(
        () => {
          void window.roofroom
            .getDesktopRunState(
              runId,
            )
            .then(
              (nextState) => {
                setActiveRunState(
                  nextState,
                );
              },
            )
            .catch(
              (error) => {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : 'Run state yenilenemedi.',
                );
              },
            );
        },
        heartbeatMs,
      );

    return () => {
      window.clearTimeout(
        timeoutId,
      );
    };
  }, [
    activeRunState,
  ]);

  useEffect(() => {
    let mounted =
      true;

    Promise.all([
      window.roofroom
        .getDesktopWorkspaces(),
      window.roofroom
        .getApplicationInfo(),
      window.roofroom
        .getBootstrapStatus(),
    ])
      .then(
        ([
          next,
          info,
          bootstrap,
        ]) => {
          if (!mounted) {
            return;
          }

          setWorkspaceView(
            next,
          );

          setWorkspaceId(
            next
              .selected_workspace_id
            ?? next
              .workspaces[0]
              ?.workspace_id
            ?? '',
          );

          setVersion(
            info.version,
          );


          setSystemReady(
            bootstrap.query_config.status === 'READY'
            && bootstrap.source_registry.status === 'READY'
            && bootstrap.database.status === 'READY',
          );
        },
      )
      .catch(
        (error) => {
          if (!mounted) {
            return;
          }

          setSystemReady(
            false,
          );

          setMessage(
            error
              instanceof Error
              ? error.message
              : 'Workspace bilgisi okunamadı.',
          );
        },
      );

    return () => {
      mounted =
        false;
    };
  }, []);

  useEffect(() => {
    let mounted =
      true;

    if (!workspaceId) {
      setWorkspaceConnections([]);
      setWorkspaceConnectionDrafts({});

      return () => {
        mounted =
          false;
      };
    }

    setWorkspaceConnectionDrafts({});

    window.roofroom
      .getDesktopWorkspaceConnections(
        workspaceId,
      )
      .then(
        (next) => {
          if (mounted) {
            setWorkspaceConnections(
              next,
            );
          }
        },
      )
      .catch(
        (error) => {
          if (!mounted) {
            return;
          }

          setWorkspaceConnections(
            [],
          );

          setMessage(
            error instanceof Error
              ? error.message
              : 'Workspace bağlantı durumu okunamadı.',
          );
        },
      );

    return () => {
      mounted =
        false;
    };
  }, [
    workspaceId,
  ]);

  useEffect(() => {
    let mounted = true;
    window.roofroom.getGoogleProviderConfigurationStatus()
      .then((status) => {
        if (mounted) setGoogleProviderConfiguration(status);
      })
      .catch(() => {
        if (mounted) {
          setGoogleProviderConfiguration(null);
          setMessage('Google provider configuration status could not be read.');
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const selectedPreset = presets.find((preset) => (
      preset.preset_id === presetId
      && preset.workspace_id === workspaceId
    ));

    if (selectedPreset === undefined) {
      setPresetEditorName('');
      setPresetEditorConfiguration({ sources: {} });
      setPresetEditorDirty(false);
      setPresetReview(null);
      return;
    }

    setPresetEditorName(selectedPreset.preset_name);
    setPresetEditorConfiguration(
      structuredClone(selectedPreset.reusable_configuration),
    );
    setPresetEditorDirty(false);
    setPresetReview(null);
  }, [
    presetId,
    presets,
    workspaceId,
  ]);

  useEffect(() => {
    let mounted =
      true;

    if (!workspaceId) {
      setPresets([]);
      setPresetId('');
      setDraft(null);

      return () => {
        mounted =
          false;
      };
    }

    window.roofroom
      .getDesktopPresets(
        workspaceId,
      )
      .then(
        (next) => {
          if (!mounted) {
            return;
          }

          setPresets(
            next,
          );

          setPresetId(
            (current) =>
              next.some(
                (preset) =>
                  preset
                    .preset_id
                  === current,
              )
                ? current
                : next[0]
                  ?.preset_id
                  ?? '',
          );
        },
      )
      .catch(
        (error) => {
          if (!mounted) {
            return;
          }

          setMessage(
            error
              instanceof Error
              ? error.message
              : 'Preset listesi okunamadı.',
          );
        },
      );

    window.roofroom
      .createDesktopDraft({
        workspace_id:
          workspaceId,
        origin: {
          kind:
            'BLANK',
        },
      })
      .then(
        (next) => {
          if (mounted) {
            setDraft(
              next,
            );
          }
        },
      )
      .catch(
        () => {
          if (mounted) {
            setDraft(
              null,
            );
          }
        },
      );

    return () => {
      mounted =
        false;
    };
  }, [
    workspaceId,
  ]);

  const readinessBySource =
    useMemo(
      () =>
        new Map(
          (
            draft
              ?.source_cards
            ?? []
          ).map(
            (card) => [
              card.source_id,
              card
                .readiness_status,
            ],
          ),
        ),
      [
        draft,
      ],
    );

  const readinessReasonBySource =
    useMemo(
      () =>
        new Map(
          (draft?.source_cards ?? []).map((card) => [
            card.source_id,
            card.readiness_reason,
          ]),
        ),
      [draft],
    );

  const readinessRemediationBySource =
    useMemo(
      () =>
        new Map(
          (draft?.source_cards ?? []).map((card) => [
            card.source_id,
            card.readiness_remediation ?? null,
          ]),
        ),
      [draft],
    );

  const freshnessBySource =
    useMemo(
      () =>
        new Map(
          (draft?.source_cards ?? []).map((card) => [
            card.source_id,
            card.freshness_status,
          ]),
        ),
      [draft],
    );

  const renderTaskCatalog =
    () => (
      <div
        className="rr-task-groups"
      >
        {GROUPS.map(
          (group) => {
            const tasks =
              DESKTOP_TASK_CATALOG
                .filter(
                  (task) =>
                    task.group
                    === group,
                );

            return (
              <section
                className="rr-task-group"
                key={group}
              >
                <div
                  className="rr-section-head"
                >
                  <strong>
                    {
                      GROUP_LABELS[
                        group
                      ]
                    }
                  </strong>

                  <span>
                    {tasks.length}
                    {' '}
                    tasks
                  </span>
                </div>

                <div
                  className="rr-task-grid"
                >
                  {tasks.map(
                    (task) => (
                      <TaskCard
                        key={
                          task
                            .task_id
                        }
                        task={
                          task
                        }
                        readiness={
                          task.task_kind === 'TASK_PACKAGE'
                            ? 'READY'
                            : readinessBySource.get(task.source_id)
                              ?? 'NOT_YET_AVAILABLE'
                        }
                        freshness={
                          task.task_kind === 'TASK_PACKAGE'
                            ? 'ON_DEMAND'
                            : freshnessBySource.get(task.source_id)
                              ?? 'UNKNOWN'
                        }
                        onOpen={
                          () => {
                            setQuickRunReview(
                              null,
                            );
                            setTaskPackageReview(null);
                            setPublishedTaskPackage(null);

                            setSelectedTask(
                              task,
                            );

                            setView(
                              'TASKS',
                            );
                          }
                        }
                      />
                    ),
                  )}
                </div>
              </section>
            );
          },
        )}
      </div>
    );

  const selectIkasProductsFile =
    async () => {
      setMessage(
        null,
      );

      try {
        const result =
          await window
            .roofroom
            .selectDesktopInputFile({
              input_kind:
                'IKAS_PRODUCTS_XLSX',
            });

        if (
          result.canceled
          || result.file_path
            === null
          || result.file_name
            === null
          || result.file_size_bytes
            === null
          || result.file_type
            === null
        ) {
          return;
        }

        setSelectedIkasFile({
          file_path:
            result.file_path,
          file_name:
            result.file_name,
          file_size_bytes:
            result.file_size_bytes,
          file_type:
            result.file_type,
        });
      } catch (error) {
        setMessage(
          error
            instanceof Error
            ? error.message
            : 'Products XLSX seçilemedi.',
        );
      }
    };

  const selectKeywordPlannerCsvFile =
    async () => {
      setMessage(
        null,
      );

      try {
        const result =
          await window
            .roofroom
            .selectDesktopInputFile({
              input_kind:
                'KEYWORD_PLANNER_CSV',
            });

        if (
          result.canceled
          || result.file_path === null
          || result.file_name === null
          || result.file_size_bytes === null
          || result.file_type === null
        ) {
          return;
        }

        setSelectedKeywordPlannerCsvFile({
          file_path:
            result.file_path,
          file_name:
            result.file_name,
          file_size_bytes:
            result.file_size_bytes,
          file_type:
            result.file_type,
        });
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Keyword Stats CSV could not be selected.',
        );
      }
    };

  const updateKeywordPlannerGroupDraft = (
    rowId: number,
    field: 'group_id' | 'group_name' | 'keywords',
    value: string,
  ) => {
    setKeywordPlannerGroupDrafts((current) => current.map((row) => (
      row.row_id === rowId
        ? { ...row, [field]: value }
        : row
    )));
  };

  const addKeywordPlannerGroupDraft = () => {
    setKeywordPlannerGroupDrafts((current) => [
      ...current,
      {
        row_id: Math.max(0, ...current.map((row) => row.row_id)) + 1,
        group_id: '',
        group_name: '',
        keywords: '',
      },
    ]);
  };

  const removeKeywordPlannerGroupDraft = (
    rowId: number,
  ) => {
    setKeywordPlannerGroupDrafts((current) => current.filter(
      (row) => row.row_id !== rowId,
    ));
  };

  const updateSerpApiQueryDraft = (
    rowId: number,
    field: 'job_key' | 'query',
    value: string,
  ) => {
    setSerpApiQueryDrafts((current) => current.map((row) => (
      row.row_id === rowId
        ? { ...row, [field]: value }
        : row
    )));
  };

  const addSerpApiQueryDraft = () => {
    setSerpApiQueryDrafts((current) => [
      ...current,
      {
        row_id: Math.max(0, ...current.map((row) => row.row_id)) + 1,
        job_key: '',
        query: '',
      },
    ]);
  };

  const removeSerpApiQueryDraft = (
    rowId: number,
  ) => {
    setSerpApiQueryDrafts((current) => current.filter(
      (row) => row.row_id !== rowId,
    ));
  };

  const setBitkimarkSitemapSelected = (
    url: string,
    selected: boolean,
  ) => {
    const rootUrl = BITKIMARK_VERIFIED_SITEMAP_URLS[0];
    const current = new Set(
      bitkimarkSitemapUrlsInput
        .split(/\r?\n/u)
        .filter((entry) => entry.length > 0),
    );

    if (selected) {
      current.add(url);
    } else if (url !== rootUrl) {
      current.delete(url);
    }

    setBitkimarkSitemapUrlsInput(
      BITKIMARK_VERIFIED_SITEMAP_URLS
        .filter((entry) => entry === rootUrl || current.has(entry))
        .join('\n'),
    );
  };

  const followReadinessRemediation = async (
    remediation: DesktopReadinessRemediation,
  ) => {
    if (selectedTask === null || selectedTask.task_kind !== 'COLLECTION') return;

    if (remediation.kind === 'CONNECT_SOURCE') {
      setSelectedTask(null);
      setView('WORKSPACE');
      return;
    }

    if (remediation.kind === 'SELECT_FILE') {
      if (selectedTask.source_id === 'ikas-products') {
        await selectIkasProductsFile();
      } else if (selectedTask.source_id === 'google-keyword-planner-csv') {
        await selectKeywordPlannerCsvFile();
      }
      return;
    }

    if (remediation.kind === 'MANUAL_ACTION') {
      setSelectedTask(null);
      setView('RUNS');
      return;
    }

    await window.roofroom.openConfigFolder();
  };

  const buildCurrentTaskSourceConfiguration = (
    task: CollectionDesktopTaskDefinition,
  ): JsonObject | null => {
    if (
      (
        task.source_id === 'google-search-console-query-page'
        || task.source_id === 'google-trends'
        || task.source_id === 'google-ads-search-terms'
      )
      && task.date_policy !== undefined
    ) {
      return {
        included: true,
        task_id: task.task_id,
        date_policy: task.date_policy,
      };
    }

    if (task.source_id === 'ikas-products' && selectedIkasFile !== null) {
      return {
        included: true,
        task_id: task.task_id,
        file_path: selectedIkasFile.file_path,
      };
    }

    if (
      task.source_id === 'google-keyword-planner-csv'
      && selectedKeywordPlannerCsvFile !== null
    ) {
      return {
        included: true,
        task_id: task.task_id,
        file_path: selectedKeywordPlannerCsvFile.file_path,
      };
    }

    if (task.source_id === 'google-keyword-planner') {
      const groups = parseKeywordPlannerGroups(keywordPlannerGroupDrafts);
      return groups === null
        ? null
        : { included: true, task_id: task.task_id, groups };
    }

    if (task.source_id === 'bitkimark-sitemap') {
      const sitemaps = parseBitkimarkSitemapUrls(bitkimarkSitemapUrlsInput);
      return sitemaps === null
        ? null
        : { included: true, task_id: task.task_id, sitemaps };
    }

    if (task.source_id === 'serpapi') {
      const queries = parseSerpApiQueries(serpApiQueryDrafts);
      return queries === null
        ? null
        : { included: true, task_id: task.task_id, queries };
    }

    return null;
  };

  const reviewSelectedTaskQuickRun =
    async () => {
      if (
        selectedTask === null
        || selectedTask.task_kind !== 'COLLECTION'
        || !workspaceId
      ) {
        return;
      }

      if (
        selectedTask.source_id === 'ikas-products'
        && selectedIkasFile === null
      ) {
        setMessage(
          'Select a current Products XLSX before Review.',
        );
        return;
      }

      if (
        selectedTask.source_id
          === 'google-keyword-planner-csv'
        && selectedKeywordPlannerCsvFile === null
      ) {
        setMessage(
          'Select a Keyword Stats CSV before Review.',
        );
        return;
      }

      const keywordPlannerGroups =
        selectedTask.source_id
          === 'google-keyword-planner'
          ? parseKeywordPlannerGroups(
              keywordPlannerGroupDrafts,
            )
          : null;

      const bitkimarkSitemaps =
        selectedTask.source_id
          === 'bitkimark-sitemap'
          ? parseBitkimarkSitemapUrls(
              bitkimarkSitemapUrlsInput,
            )
          : null;

      const serpApiQueries =
        selectedTask.source_id === 'serpapi'
          ? parseSerpApiQueries(serpApiQueryDrafts)
          : null;

      if (
        selectedTask.source_id
          === 'google-keyword-planner'
        && keywordPlannerGroups === null
      ) {
        setMessage(
          'Enter valid named Keyword Planner groups before Review.',
        );
        return;
      }

      if (
        selectedTask.source_id
          === 'bitkimark-sitemap'
        && bitkimarkSitemaps === null
      ) {
        setMessage(
          'Use a bounded subset of the verified Bitkimark sitemap URLs, beginning with sitemap.xml.',
        );
        return;
      }

      if (selectedTask.source_id === 'serpapi' && serpApiQueries === null) {
        setMessage('Enter valid unique query-id | query rows before Review.');
        return;
      }

      setBusy(
        true,
      );

      setMessage(
        null,
      );

      try {
        const baseDraft =
          await window.roofroom
            .createDesktopDraft({
              workspace_id:
                workspaceId,
              origin: {
                kind: 'BLANK',
              },
            });

        const sourceConfiguration =
          buildCurrentTaskSourceConfiguration(selectedTask)
          ?? { included: true };

        const nextDraft:
          DesktopRunDraft = {
            ...baseDraft,
            reusable_configuration: {
              ...baseDraft.reusable_configuration,
              sources: {
                [selectedTask.source_id]:
                  sourceConfiguration,
              },
            },
          };

        const review =
          await window.roofroom
            .reviewDesktopDraft(
              nextDraft,
            );

        setQuickRunReview({
          draft:
            nextDraft,
          review,
        });
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Quick Run Review oluşturulamadı.',
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  const startReviewedQuickRun =
    async () => {
      if (
        quickRunReview === null
        || quickRunReview.review.can_start === false
        || busy
      ) {
        return;
      }

      setBusy(
        true,
      );

      setMessage(
        null,
      );

      try {
        const startedState =
          await window.roofroom
            .startDesktopDraft(
              quickRunReview.review.reviewed_draft ?? quickRunReview.draft,
            );

        setActiveRunState(
          startedState,
        );

        setQuickRunReview(
          null,
        );

        setSelectedTask(
          null,
        );

        setSelectedIkasFile(null);
        setSelectedKeywordPlannerCsvFile(null);
        setKeywordPlannerGroupDrafts([{
          row_id: 1,
          group_id: '',
          group_name: '',
          keywords: '',
        }]);
        setBitkimarkSitemapUrlsInput(
          BITKIMARK_VERIFIED_SITEMAP_URLS.join('\n'),
        );
        setSerpApiQueryDrafts([{
          row_id: 1,
          job_key: '',
          query: '',
        }]);

        setView(
          'RUNS',
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Run başlatılamadı.',
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  const loadTaskPackageReview = async (
    task: Extract<DesktopTaskDefinition, { task_kind: 'TASK_PACKAGE' }>,
  ) => {
    if (!workspaceId || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await window.roofroom.reviewDesktopTaskPackage({
        workspace_id: workspaceId,
        recipe_id: task.recipe_id,
      });
      if (response.ok === false) {
        setMessage(formatStatus(response.error.code));
        return;
      }
      setPublishedTaskPackage(null);
      setTaskPackageReview(response.result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Task Package Review could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const startSelectedTaskPackage = async () => {
    if (taskPackageReview === null || busy || !taskPackageReview.can_start) return;
    const intent: DesktopTaskPackageStartIntent = {
      workspace_id: taskPackageReview.workspace_id,
      recipe_id: taskPackageReview.recipe_id,
      recipe_version: taskPackageReview.recipe_version,
      reference_date: taskPackageReview.reference_date,
      current_window: { ...taskPackageReview.current_window },
      account_identity: { ...taskPackageReview.account_identity },
    };
    setBusy(true);
    setMessage(null);
    try {
      const response = await window.roofroom.startDesktopTaskPackage(intent);
      if (response.ok === false) {
        setMessage(formatStatus(response.error.code));
        return;
      }
      if (response.result.status === 'COLLECTION_STARTED') {
        setTaskPackageCollectionIntent(intent);
        setTaskPackageCollectionRunId(response.result.run_state.run.run_id);
        setActiveRunState(response.result.run_state);
        setTaskPackageReview(null);
        setSelectedTask(null);
        setView('RUNS');
        return;
      }
      setPublishedTaskPackage(response.result.package);
      setTaskPackageCollectionIntent(null);
      setTaskPackageCollectionRunId(null);
      setTaskPackageReview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Task Package could not be started.');
    } finally {
      setBusy(false);
    }
  };

  const openTaskPackage = async (packageId: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await window.roofroom.openDesktopTaskPackage({ package_id: packageId });
      if (response.ok === false) setMessage(formatStatus(response.error.code));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Task Package workbook could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const reviewTaskPackageAgain = async () => {
    if (taskPackageCollectionIntent === null) return;
    const task = DESKTOP_TASK_CATALOG.find((candidate) => (
      candidate.task_kind === 'TASK_PACKAGE'
      && candidate.recipe_id === taskPackageCollectionIntent.recipe_id
    ));
    if (task === undefined || task.task_kind !== 'TASK_PACKAGE') return;
    setSelectedTask(task);
    setView('TASKS');
    await loadTaskPackageReview(task);
  };

  const openHistoryRun =
    async (
      runId: string,
    ) => {
      setBusy(
        true,
      );

      setMessage(
        null,
      );

      try {
        const nextState =
          await window.roofroom
            .getDesktopRunState(
              runId,
            );

        setActiveRunState(
          nextState,
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Run Detail yüklenemedi.',
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  const exportActiveRun =
    async (
      mode: 'ALL' | 'SUCCESSFUL_ONLY',
    ) => {
      if (
        activeRunState === null
        || busy === true
      ) {
        return;
      }

      setBusy(
        true,
      );

      setMessage(
        null,
      );

      try {
        const result =
          await window.roofroom
            .exportDesktopRun({
              run_id:
                activeRunState.run.run_id,
              mode,
            });

        setExportResult(
          result,
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Run export oluşturulamadı.',
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  const openAcceptedEvidence =
    async (jobId: string) => {
      if (activeRunState === null || busy === true) return;

      setBusy(true);
      setMessage(null);
      try {
        await window.roofroom.openDesktopAcceptedEvidence({
          run_id: activeRunState.run.run_id,
          job_id: jobId,
        });
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Accepted evidence açılamadı.',
        );
      } finally {
        setBusy(false);
      }
    };

  const retryActiveRun =
    async () => {
      if (
        activeRunState === null
        || activeRunState.can_retry
          !== true
        || busy === true
      ) {
        return;
      }

      setBusy(
        true,
      );

      setMessage(
        null,
      );

      try {
        const nextState =
          await window.roofroom
            .retryDesktopFailed(
              activeRunState.run.run_id,
            );

        setActiveRunState(
          nextState,
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Failed Jobs yeniden başlatılamadı.',
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  const resumeActiveRun =
    async () => {
      if (
        activeRunState === null
        || activeRunState.can_resume
          !== true
        || busy === true
      ) {
        return;
      }

      setBusy(
        true,
      );

      setMessage(
        null,
      );

      try {
        const nextState =
          await window.roofroom
            .resumeDesktopInterrupted(
              activeRunState
                .run
                .run_id,
            );

        setActiveRunState(
          nextState,
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Interrupted Run devam ettirilemedi.',
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  const continueActiveRun =
    async () => {
      if (
        activeRunState === null
        || activeRunState.run.run_status
          !== 'MANUAL_ACTION_REQUIRED'
        || busy === true
      ) {
        return;
      }

      setBusy(
        true,
      );

      setMessage(
        null,
      );

      try {
        const nextState =
          await window.roofroom
            .continueDesktopManual(
              activeRunState
                .run
                .run_id,
            );

        setActiveRunState(
          nextState,
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Run devam ettirilemedi.',
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  const cancelActiveRun =
    async () => {
      if (
        activeRunState === null
        || activeRunState.can_cancel
          !== true
        || busy === true
      ) {
        return;
      }

      setBusy(
        true,
      );

      setMessage(
        null,
      );

      try {
        const nextState =
          await window.roofroom
            .cancelDesktopRun(
              activeRunState
                .run
                .run_id,
            );

        setActiveRunState(
          nextState,
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Run iptal edilemedi.',
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  const createPreset =
    async () => {
      const presetName =
        newPresetName
          .trim();

      if (
        !workspaceId
        || !presetName
        || newPresetTaskIds.length === 0
        || busy
      ) {
        return;
      }

      setBusy(
        true,
      );
      setMessage(
        null,
      );

      try {
        const sources = Object.fromEntries(
          newPresetTaskIds.flatMap((taskId) => {
            const task = DESKTOP_TASK_CATALOG.find((candidate) => (
              candidate.task_id === taskId
            ));
            if (task === undefined || task.task_kind !== 'COLLECTION') return [];
            const configuration = buildCurrentTaskSourceConfiguration(task);
            return configuration === null
              ? []
              : [[task.source_id, configuration]];
          }),
        );

        const created =
          await window
            .roofroom
            .createDesktopPreset({
              workspace_id:
                workspaceId,
              preset_name:
                presetName,
              reusable_configuration: {
                sources,
              },
            });

        const next =
          await window
            .roofroom
            .getDesktopPresets(
              workspaceId,
            );

        setPresets(
          next,
        );

        setPresetId(
          created
            .preset_id,
        );

        setNewPresetName(
          '',
        );
        setNewPresetTaskIds([]);

        setMessage(
          `Preset kaydedildi: ${created.preset_name}`,
        );
      } catch (error) {
        setMessage(
          error
            instanceof Error
            ? error.message
            : 'Preset kaydedilemedi.',
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  const updatePreset = async () => {
    if (!workspaceId || !presetId || !presetEditorName.trim() || busy) return;

    setBusy(true);
    setMessage(null);
    try {
      const updated = await window.roofroom.updateDesktopPreset({
        workspace_id: workspaceId,
        preset_id: presetId,
        preset_name: presetEditorName.trim(),
        reusable_configuration: presetEditorConfiguration,
      });
      const next = await window.roofroom.getDesktopPresets(workspaceId);
      setPresets(next);
      setPresetId(updated.preset_id);
      setPresetEditorDirty(false);
      setMessage(`Preset updated: ${updated.preset_name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Preset could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const duplicatePreset = async () => {
    if (!workspaceId || !presetId || busy) return;

    setBusy(true);
    setMessage(null);
    try {
      const created = await window.roofroom.createDesktopPreset({
        workspace_id: workspaceId,
        preset_name: `${presetEditorName.trim()} copy`,
        reusable_configuration: structuredClone(presetEditorConfiguration),
      });
      const next = await window.roofroom.getDesktopPresets(workspaceId);
      setPresets(next);
      setPresetId(created.preset_id);
      setMessage(`Preset duplicated: ${created.preset_name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Preset could not be duplicated.');
    } finally {
      setBusy(false);
    }
  };

  const reviewPreset = async () => {
    if (!workspaceId || !presetId || presetEditorDirty || busy) return;

    setBusy(true);
    setMessage(null);
    try {
      const nextDraft = await window.roofroom.createDesktopDraft({
        workspace_id: workspaceId,
        origin: { kind: 'SAVED_PRESET', preset_id: presetId },
      });
      const review = await window.roofroom.reviewDesktopDraft(nextDraft);
      setPresetReview({ draft: nextDraft, review });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Preset review could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const startReviewedPreset = async () => {
    if (presetReview === null || !presetReview.review.can_start || busy) return;

    setBusy(true);
    setMessage(null);
    try {
      const state = await window.roofroom.startDesktopDraft(
        presetReview.review.reviewed_draft ?? presetReview.draft,
      );
      setActiveRunState(state);
      setPresetReview(null);
      setView('RUNS');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Preset run could not be started.');
    } finally {
      setBusy(false);
    }
  };

  const setPresetTaskIncluded = (
    task: CollectionDesktopTaskDefinition,
    included: boolean,
  ) => {
    const currentSources = getReusableSources(presetEditorConfiguration);
    const nextSources = { ...currentSources };

    if (included) {
      const configuration = buildCurrentTaskSourceConfiguration(task);
      if (configuration === null) return;
      nextSources[task.source_id] = configuration;
    } else {
      delete nextSources[task.source_id];
    }

    setPresetEditorConfiguration({
      ...presetEditorConfiguration,
      sources: nextSources,
    });
    setPresetEditorDirty(true);
    setPresetReview(null);
  };

  const toggleNewPresetTask = (
    task: CollectionDesktopTaskDefinition,
    included: boolean,
  ) => {
    setNewPresetTaskIds((current) => {
      const withoutSameSource = current.filter((taskId) => {
        const candidate = DESKTOP_TASK_CATALOG.find((item) => item.task_id === taskId);
        return candidate?.task_kind !== 'COLLECTION'
          || candidate.source_id !== task.source_id;
      });
      return included ? [...withoutSameSource, task.task_id] : withoutSameSource;
    });
  };

  const deletePreset =
    async (
      preset:
        SavedCollectionPresetRecord,
    ) => {
      if (
        busy
        || !window.confirm(
          `"${preset.preset_name}" presetini silmek istiyor musunuz?`,
        )
      ) {
        return;
      }

      setBusy(
        true,
      );

      setMessage(
        null,
      );

      try {
        await window
          .roofroom
          .deleteDesktopPreset({
            workspace_id:
              preset
                .workspace_id,
            preset_id:
              preset
                .preset_id,
          });

        const next =
          await window
            .roofroom
            .getDesktopPresets(
              preset
                .workspace_id,
            );

        setPresets(
          next,
        );

        setPresetId(
          next[0]
            ?.preset_id
          ?? '',
        );
      } catch (error) {
        setMessage(
          error
            instanceof Error
            ? error.message
            : 'Preset silinemedi.',
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  const updateWorkspaceConnectionDraft = (
    sourceId: DesktopCredentialManagedSourceId,
    field: keyof WorkspaceConnectionDraft,
    value: string,
  ): void => {
    setWorkspaceConnectionDrafts((current) => ({
      ...current,
      [sourceId]: {
        ...EMPTY_WORKSPACE_CONNECTION_DRAFT,
        ...current[sourceId],
        [field]: value,
      },
    }));
  };

  const configureGoogleProvider = async (
    component: GoogleProviderConfigurationComponent,
  ): Promise<void> => {
    if (pendingGoogleProviderComponent !== null) return;
    setPendingGoogleProviderComponent(component);
    setMessage(null);
    try {
      const response = await window.roofroom.configureGoogleProvider({
        component,
      });
      if (response.ok === true) {
        setGoogleProviderConfiguration(response.result.status);
        setMessage('Google provider configuration updated.');
      } else {
        const copy: Record<string, string> = {
          INVALID_PROVIDER_CONFIGURATION_INTENT:
            'Google provider setup request is invalid.',
          SECRET_INGRESS_CANCELLED:
            'Provider credential entry was cancelled. Existing configuration was preserved.',
          SECRET_INGRESS_FAILED:
            'Provider credential entry could not be completed.',
          SECRET_INPUT_INVALID:
            'The provider credential value is invalid.',
          CREDENTIAL_PERSISTENCE_FAILED:
            'The protected provider configuration could not be saved.',
        };
        setMessage(copy[response.error.code]
          ?? 'Google provider configuration could not be updated.');
      }
    } catch {
      setMessage('Google provider configuration could not be updated.');
    } finally {
      try {
        const status = await window.roofroom
          .getGoogleProviderConfigurationStatus();
        setGoogleProviderConfiguration(status);
        if (workspaceId.length > 0) {
          const refreshed = await window.roofroom
            .getDesktopWorkspaceConnections(workspaceId);
          setWorkspaceConnections(refreshed);
        }
      } catch {
        setMessage('Google provider configuration state could not be refreshed.');
      }
      setPendingGoogleProviderComponent(null);
    }
  };

  const mutateWorkspaceConnection = async (
    sourceId: DesktopCredentialManagedSourceId,
    action: WorkspaceConnectionAction,
  ): Promise<void> => {
    if (
      workspaceId.length === 0
      || pendingWorkspaceConnectionSource !== null
    ) {
      return;
    }

    const draft = workspaceConnectionDrafts[sourceId]
      ?? EMPTY_WORKSPACE_CONNECTION_DRAFT;
    setPendingWorkspaceConnectionSource(sourceId);
    setMessage(null);

    try {
      let response;
      if (action === 'PROVISION_SERPAPI') {
        response = await window.roofroom
          .provisionSerpApiDesktopWorkspaceConnection({
            workspace_id: workspaceId,
            source_id: 'serpapi',
          });
      } else if (action === 'DISCONNECT') {
        response = await window.roofroom.disconnectDesktopWorkspaceConnection({
          workspace_id: workspaceId,
          source_id: sourceId,
        });
      } else if (sourceId === 'serpapi') {
        return;
      } else if (sourceId === 'google-search-console-query-page') {
        const siteUrl = draft.site_url.trim();
        if (action !== 'RECONNECT_GOOGLE' && siteUrl.length === 0) {
          setMessage('Enter a Site URL before updating this connection.');
          return;
        }
        const metadata = siteUrl.length === 0
          ? undefined
          : { site_url: siteUrl };
        if (action === 'MANAGE') {
          response = await window.roofroom.manageDesktopWorkspaceConnection({
            workspace_id: workspaceId,
            source_id: sourceId,
            metadata: metadata!,
          });
        } else if (action === 'CONNECT_GOOGLE') {
          response = await window.roofroom.connectGoogleDesktopWorkspaceConnection({
            workspace_id: workspaceId,
            source_id: sourceId,
            metadata: metadata!,
          });
        } else {
          response = await window.roofroom.reconnectGoogleDesktopWorkspaceConnection({
            workspace_id: workspaceId,
            source_id: sourceId,
            ...(metadata === undefined ? {} : { metadata }),
          });
        }
      } else {
        const customerId = draft.customer_id.trim();
        const loginCustomerId = draft.login_customer_id.trim();
        if (action !== 'RECONNECT_GOOGLE' && customerId.length === 0) {
          setMessage('Enter a Customer ID before updating this connection.');
          return;
        }
        const metadata = customerId.length === 0
          ? undefined
          : {
            customer_id: customerId,
            ...(loginCustomerId.length === 0
              ? {}
              : { login_customer_id: loginCustomerId }),
          };
        if (action === 'MANAGE') {
          response = await window.roofroom.manageDesktopWorkspaceConnection({
            workspace_id: workspaceId,
            source_id: sourceId,
            metadata: metadata!,
          });
        } else if (action === 'CONNECT_GOOGLE') {
          response = await window.roofroom.connectGoogleDesktopWorkspaceConnection({
            workspace_id: workspaceId,
            source_id: sourceId,
            metadata: metadata!,
          });
        } else {
          response = await window.roofroom.reconnectGoogleDesktopWorkspaceConnection({
            workspace_id: workspaceId,
            source_id: sourceId,
            ...(metadata === undefined ? {} : { metadata }),
          });
        }
      }

      if (response.ok === false) {
        setMessage(
          CONNECTION_ERROR_COPY[response.error.code]
            ?? 'The Workspace connection could not be updated.',
        );
      } else if (response.result.outcome === 'SUCCEEDED_WITH_CLEANUP_WARNING') {
        setMessage(
          'Connection updated, but obsolete credential cleanup needs attention.',
        );
      } else {
        setMessage('Workspace connection updated.');
      }
    } catch {
      setMessage('The Workspace connection could not be updated.');
    } finally {
      try {
        const refreshed = await window.roofroom
          .getDesktopWorkspaceConnections(workspaceId);
        setWorkspaceConnections(refreshed);
      } catch {
        setMessage('Workspace connection state could not be refreshed.');
      }
      setPendingWorkspaceConnectionSource(null);
    }
  };

  const presetEditorSources = getReusableSources(
    presetEditorConfiguration,
  );
  const selectedPreset = presets.find((preset) => (
    preset.preset_id === presetId
  )) ?? null;
  const dashboardSourceCards = draft?.source_cards ?? [];
  const dashboardReadyCount = dashboardSourceCards.filter((card) => (
    card.readiness_status === 'READY'
  )).length;
  const dashboardConnectionCount = dashboardSourceCards.filter((card) => (
    card.readiness_status === 'CONNECTION_REQUIRED'
  )).length;
  const dashboardImportCount = dashboardSourceCards.filter((card) => (
    card.readiness_status === 'FILE_REQUIRED'
  )).length;
  const dashboardAttentionCount = dashboardSourceCards.filter((card) => (
    card.readiness_status === 'CONFIGURATION_REQUIRED'
    || card.readiness_status === 'MANUAL_ACTION_REQUIRED'
  )).length;
  const recentCompletedRun = runHistory.find((run) => (
    run.run_status === 'COMPLETED'
    || run.run_status === 'COMPLETED_WITH_WARNINGS'
  )) ?? null;

  const hasUnsavedTaskInputs =
    selectedIkasFile !== null
    || selectedKeywordPlannerCsvFile !== null
    || keywordPlannerGroupDrafts.some((row) => (
      row.group_id.length > 0
      || row.group_name.length > 0
      || row.keywords.length > 0
    ))
    || bitkimarkSitemapUrlsInput
      !== BITKIMARK_VERIFIED_SITEMAP_URLS.join('\n')
    || serpApiQueryDrafts.some((row) => (
      row.job_key.length > 0
      || row.query.length > 0
    ));
  const hasUnsavedPresetInputs =
    presetEditorDirty
    || newPresetName.trim().length > 0
    || newPresetTaskIds.length > 0;

  const resetTransientEditors = () => {
    setSelectedIkasFile(null);
    setSelectedKeywordPlannerCsvFile(null);
    setKeywordPlannerGroupDrafts([{
      row_id: 1,
      group_id: '',
      group_name: '',
      keywords: '',
    }]);
    setBitkimarkSitemapUrlsInput(
      BITKIMARK_VERIFIED_SITEMAP_URLS.join('\n'),
    );
    setSerpApiQueryDrafts([{
      row_id: 1,
      job_key: '',
      query: '',
    }]);
    setNewPresetName('');
    setNewPresetTaskIds([]);
    setPresetEditorDirty(false);
    setPresetReview(null);
  };

  const confirmDiscardTransientEdits = () => (
    !(hasUnsavedTaskInputs || hasUnsavedPresetInputs)
    || window.confirm('Discard unsaved task and preset edits?')
  );

  const navigateTo = (
    nextView: View,
  ) => {
    if (!confirmDiscardTransientEdits()) return;
    if (hasUnsavedTaskInputs || hasUnsavedPresetInputs) {
      resetTransientEditors();
    }
    setSelectedTask(null);
    setQuickRunReview(null);
    setView(nextView);
  };

  const changeWorkspace = (
    nextWorkspaceId: string,
  ) => {
    if (!confirmDiscardTransientEdits()) return;
    resetTransientEditors();
    setWorkspaceId(nextWorkspaceId);
    setSelectedTask(null);
    setQuickRunReview(null);
    setActiveRunState(null);
    setRunHistory([]);
    setView('HOME');
  };

  return (
    <main
      className="rr-shell"
    >
      <aside
        className="rr-sidebar"
      >
        <div
          className="rr-brand"
        >
          <span
            className="rr-logo"
          >
            RR
          </span>

          <span>
            <strong>
              RoofRoom
            </strong>

            <small>
              Data Collector
            </small>
          </span>
        </div>

        <nav
          aria-label="Main navigation"
        >
          {NAV_ITEMS.map(
            (item) => (
              <button
                key={item}
                type="button"
                className={
                  view === item
                    ? 'active'
                    : ''
                }
                onClick={
                  () => navigateTo(item)
                }
              >
                {item}
              </button>
            ),
          )}
        </nav>
      </aside>

      <section
        className="rr-main"
      >
        <header
          className="rr-context"
        >
          <div>
            <span
              className="rr-kicker"
            >
              ROOFROOM OPERATIONS
            </span>

            <strong>
              Data Collection Console
            </strong>
          </div>

          <div
            className="rr-context-right"
          >
            <label>
              <span>
                Workspace
              </span>

              <select
                aria-label="Active Workspace"
                value={
                  workspaceId
                }
                onChange={
                  (event) => changeWorkspace(event.target.value)
                }
              >
                {workspaceView
                  ?.workspaces
                  .map(
                    (
                      workspace,
                    ) => (
                      <option
                        key={
                          workspace
                            .workspace_id
                        }
                        value={
                          workspace
                            .workspace_id
                        }
                      >
                        {
                          workspace
                            .workspace_name
                        }
                      </option>
                    ),
                  )}
              </select>
            </label>

            <span
              className="rr-system"
            >
              {systemReady === null
                ? '● SYSTEM CHECKING'
                : systemReady
                  ? '● SYSTEM READY'
                  : '● SYSTEM NOT READY'}
            </span>

            {version && (
              <code>
                v{version}
              </code>
            )}
          </div>
        </header>

        <div
          className="rr-content"
        >
          {message && (
            <p
              className="rr-alert"
            >
              {message}
            </p>
          )}

          {selectedTask?.task_kind === 'TASK_PACKAGE'
            && taskPackageReview === null
            && publishedTaskPackage === null
            && (
              <section className="rr-task-detail">
                <button
                  type="button"
                  className="rr-back-button"
                  onClick={() => navigateTo('TASKS')}
                >
                  Back to Tasks
                </button>

                <header className="rr-task-detail-head">
                  <div>
                    <span className="rr-kicker">TASK PACKAGE</span>
                    <h1>{selectedTask.task_name}</h1>
                    <p>{selectedTask.description}</p>
                  </div>
                  <span className="rr-status rr-status-ready">LOCAL REVIEW</span>
                </header>

                <section className="rr-panel rr-detail-panel">
                  <span className="rr-kicker">PACKAGE SCOPE</span>
                  <h2>Default Configuration</h2>
                  <p>{selectedTask.default_summary}</p>
                  <p>Review uses local accepted evidence only.</p>
                </section>

                <div className="rr-task-detail-actions">
                  <button
                    type="button"
                    className="rr-primary-action"
                    disabled={busy}
                    onClick={() => void loadTaskPackageReview(selectedTask)}
                  >
                    Review Package
                  </button>
                </div>
              </section>
            )}

          {selectedTask?.task_kind === 'TASK_PACKAGE'
            && taskPackageReview !== null
            && (
              <section className="rr-review-page" data-testid="task-package-review">
                <button
                  type="button"
                  className="rr-back-button"
                  onClick={() => setTaskPackageReview(null)}
                >
                  Back to Task
                </button>

                <header className="rr-task-detail-head">
                  <div>
                    <span className="rr-kicker">LOCAL PACKAGE REVIEW</span>
                    <h1>{selectedTask.task_name} Review</h1>
                    <p>
                      Current window: {taskPackageReview.current_window.start}
                      {' → '}
                      {taskPackageReview.current_window.end}
                    </p>
                    <p>
                      Google Ads readiness:{' '}
                      {formatStatus(
                        taskPackageReview.requirements
                          .find((requirement) => requirement.status === 'BLOCKED')
                          ?.reason_codes[0]
                          ?? 'READY',
                      )}
                    </p>
                  </div>
                  <span className={`rr-status rr-status-${taskPackageReview.status.toLowerCase()}`}>
                    {formatStatus(taskPackageReview.status)}
                  </span>
                </header>

                <div className="rr-detail-sections rr-task-package-requirements">
                  {taskPackageReview.requirements.map((requirement) => (
                    <article className="rr-panel rr-detail-panel" key={requirement.requirement_id}>
                      <span className="rr-kicker">{requirement.dataset_type}</span>
                      <h2>{formatStatus(requirement.status)}</h2>
                      {requirement.status === 'NO_DATA' && (
                        <p>Provider-accepted no data for the exact window.</p>
                      )}
                      {requirement.status === 'COLLECT_REQUIRED' && (
                        <p>Accepted evidence is missing for this exact requirement.</p>
                      )}
                      {requirement.reason_codes.length > 0 && (
                        <p>Reason: {requirement.reason_codes.map(formatStatus).join(', ')}</p>
                      )}
                    </article>
                  ))}
                </div>

                {taskPackageReview.status === 'INITIAL_BASELINE' && (
                  <p>No prior comparison exists; this package contains CURRENT evidence only.</p>
                )}

                {taskPackageReview.status === 'COMPARISON'
                  && taskPackageReview.previous_window !== undefined
                  && (
                    <div className="rr-panel rr-detail-panel">
                      <p>
                        Previous window: {taskPackageReview.previous_window.start}
                        {' → '}
                        {taskPackageReview.previous_window.end}
                      </p>
                      <p>Gap days: {taskPackageReview.gap_days}</p>
                    </div>
                  )}

                <div className="rr-task-detail-actions">
                  {taskPackageReview.status === 'EXISTING_PACKAGE'
                    && taskPackageReview.existing_package_id !== undefined
                    && (
                      <button
                        type="button"
                        className="rr-primary-action"
                        disabled={busy}
                        onClick={() => void openTaskPackage(taskPackageReview.existing_package_id as string)}
                      >
                        Open Workbook
                      </button>
                    )}
                  {taskPackageReview.status === 'NOT_READY'
                    && taskPackageReview.can_start
                    && (
                      <button
                        type="button"
                        className="rr-primary-action"
                        disabled={busy}
                        onClick={() => void startSelectedTaskPackage()}
                      >
                        Start Collection
                      </button>
                    )}
                  {(taskPackageReview.status === 'INITIAL_BASELINE'
                    || taskPackageReview.status === 'COMPARISON')
                    && taskPackageReview.can_start
                    && (
                      <button
                        type="button"
                        className="rr-primary-action"
                        disabled={busy}
                        onClick={() => void startSelectedTaskPackage()}
                      >
                        Assemble Package
                      </button>
                    )}
                </div>
              </section>
            )}

          {selectedTask?.task_kind === 'TASK_PACKAGE'
            && publishedTaskPackage !== null
            && (
              <section className="rr-review-page">
                <span className="rr-kicker">TASK PACKAGE</span>
                <h1>Package Published</h1>
                <p>Package ID: {publishedTaskPackage.package_id}</p>
                <p>Package kind: {formatStatus(publishedTaskPackage.package_kind)}</p>
                <p>
                  Current window: {publishedTaskPackage.current_window.start}
                  {' → '}
                  {publishedTaskPackage.current_window.end}
                </p>
                <button
                  type="button"
                  className="rr-primary-action"
                  disabled={busy}
                  onClick={() => void openTaskPackage(publishedTaskPackage.package_id)}
                >
                  Open Workbook
                </button>
              </section>
            )}

          {selectedTask
            && selectedTask.task_kind === 'COLLECTION'
            && quickRunReview === null
            && (() => {
            const readiness =
              readinessBySource.get(
                selectedTask.source_id,
              )
              ?? 'NOT_YET_AVAILABLE';

            const readinessReason =
              readinessReasonBySource.get(
                selectedTask.source_id,
              )
              ?? null;

            const readinessRemediation =
              readinessRemediationBySource.get(
                selectedTask.source_id,
              )
              ?? null;

            const freshness =
              freshnessBySource.get(selectedTask.source_id)
              ?? 'UNKNOWN';

            const effectiveReadiness =
              selectedTask.source_id === 'ikas-products'
              && selectedIkasFile !== null
                ? 'READY'
                : selectedTask.source_id
                    === 'google-keyword-planner-csv'
                  && selectedKeywordPlannerCsvFile !== null
                  ? 'READY'
                  : selectedTask.source_id
                      === 'bitkimark-sitemap'
                    && parseBitkimarkSitemapUrls(
                      bitkimarkSitemapUrlsInput,
                    ) !== null
                    ? 'READY'
                    : readiness;

            const hasReviewableQuickRunConfiguration =
              (
                selectedTask.source_id === 'ikas-products'
                && selectedIkasFile !== null
              )
              || (
                selectedTask.source_id
                  === 'google-keyword-planner-csv'
                && selectedKeywordPlannerCsvFile !== null
              )
              || (
                selectedTask.source_id
                  === 'bitkimark-sitemap'
                && parseBitkimarkSitemapUrls(
                  bitkimarkSitemapUrlsInput,
                ) !== null
              )
              || (
                (
                  selectedTask.source_id
                    === 'google-search-console-query-page'
                  || selectedTask.source_id
                    === 'google-trends'
                  || selectedTask.source_id
                    === 'google-ads-search-terms'
                )
                && selectedTask.date_policy
                  !== undefined
              )
              || (
                selectedTask.source_id
                  === 'google-keyword-planner'
                && parseKeywordPlannerGroups(
                  keywordPlannerGroupDrafts,
                ) !== null
              )
              || (
                selectedTask.source_id === 'serpapi'
                && parseSerpApiQueries(serpApiQueryDrafts) !== null
              );

            const keywordPlannerGroupIds = keywordPlannerGroupDrafts
              .map((row) => row.group_id.trim())
              .filter((groupId) => groupId.length > 0);
            const hasDuplicateKeywordPlannerGroupIds =
              new Set(keywordPlannerGroupIds).size
              !== keywordPlannerGroupIds.length;
            const serpApiQueryIds = serpApiQueryDrafts
              .map((row) => row.job_key.trim())
              .filter((jobKey) => jobKey.length > 0);
            const hasDuplicateSerpApiQueryIds =
              new Set(serpApiQueryIds).size
              !== serpApiQueryIds.length;
            const selectedBitkimarkSitemapUrls = new Set(
              bitkimarkSitemapUrlsInput.split(/\r?\n/u),
            );
            const preparedKeywordPlannerGroups = parseKeywordPlannerGroups(
              keywordPlannerGroupDrafts,
            );
            const preparedSerpApiQueries = parseSerpApiQueries(
              serpApiQueryDrafts,
            );
            const recentTaskRuns = runHistory
              .filter((run) => runIncludesTask(run, selectedTask))
              .slice(0, 5);

            const canReview =
              effectiveReadiness === 'READY'
              && hasReviewableQuickRunConfiguration;

            return (
              <section
                className="rr-task-detail"
              >
                <button
                  type="button"
                  className="rr-back-button"
                  onClick={() => navigateTo('TASKS')}
                >
                  Back to Tasks
                </button>

                <header
                  className="rr-task-detail-head"
                >
                  <div>
                    <span
                      className="rr-kicker"
                    >
                      DATASET TASK
                    </span>

                    <h1>
                      {selectedTask.task_name}
                    </h1>

                    <p>
                      {selectedTask.description}
                    </p>
                  </div>

                  <span
                    className={
                      `rr-status rr-status-${effectiveReadiness.toLowerCase()}`
                    }
                  >
                    {effectiveReadiness.replaceAll(
                      '_',
                      ' ',
                    )}
                  </span>
                </header>

                <div
                  className="rr-detail-sections"
                >
                  <section
                    className="rr-panel rr-detail-panel"
                  >
                    <span
                      className="rr-kicker"
                    >
                      SYSTEM STATE
                    </span>

                    <h2>
                      Readiness
                    </h2>

                    <dl
                      className="rr-detail-list"
                    >
                      <div>
                        <dt>
                          Status
                        </dt>
                        <dd>
                          {effectiveReadiness.replaceAll(
                            '_',
                            ' ',
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt>
                          Source
                        </dt>
                        <dd>
                          {selectedTask.source_id}
                        </dd>
                      </div>

                      <div>
                        <dt>
                          Freshness
                        </dt>
                        <dd>
                          {freshness.replaceAll('_', ' ')}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section
                    className="rr-panel rr-detail-panel"
                  >
                    <span
                      className="rr-kicker"
                    >
                      WORKSPACE DEFAULT
                    </span>

                    <h2>
                      Default Configuration
                    </h2>

                    <p>
                      {selectedTask.default_summary}
                    </p>

                    {selectedTask.source_id === 'google-search-console-query-page' && (
                      <>
                        <p>Property: managed securely in Workspace</p>
                        <p>Date scope: {selectedTask.date_policy?.replaceAll('_', ' ')}</p>
                      </>
                    )}

                    {selectedTask.source_id === 'google-ads-search-terms' && (
                      <>
                        <p>Scope: SEARCH campaigns · search_term_view</p>
                        <p>Date policy: 17-day reporting lag through yesterday</p>
                      </>
                    )}

                    {selectedTask.source_id === 'google-keyword-planner'
                      && preparedKeywordPlannerGroups !== null
                      && (
                        <p>
                          Prepared input: {preparedKeywordPlannerGroups.length} groups
                          {' · '}
                          {preparedKeywordPlannerGroups.reduce(
                            (count, group) => count + group.keywords.length,
                            0,
                          )}
                          {' keywords'}
                        </p>
                      )}

                    {selectedTask.source_id === 'bitkimark-sitemap' && (
                      <p>
                        Requests prepared: {selectedBitkimarkSitemapUrls.size}
                        {' · verified allowlist only'}
                      </p>
                    )}

                    {selectedTask.source_id === 'serpapi'
                      && preparedSerpApiQueries !== null
                      && (
                        <>
                          <p>
                            Requests prepared: {preparedSerpApiQueries.length}
                            {' · 1 provider request per query'}
                          </p>
                          <p>Result scope: Google · Turkey · Turkish · Desktop · 10 organic</p>
                        </>
                      )}
                  </section>

                  <section
                    className="rr-panel rr-detail-panel"
                  >
                    <span
                      className="rr-kicker"
                    >
                      PROVIDER INPUT
                    </span>

                    <h2>
                      Input / Connection
                    </h2>

                    {selectedTask.source_id === 'ikas-products'
                      ? (
                        <div
                          className="rr-file-input"
                        >
                          <p>
                            Products XLSX input is required for this task.
                          </p>

                          <div className="rr-input-actions">
                            <button
                              type="button"
                              className="rr-secondary-action"
                              onClick={() => void selectIkasProductsFile()}
                            >
                              {selectedIkasFile === null
                                ? 'Select Products XLSX'
                                : 'Replace Products XLSX'}
                            </button>

                            {selectedIkasFile && (
                              <button
                                type="button"
                                className="rr-secondary-action"
                                onClick={() => setSelectedIkasFile(null)}
                              >
                                Remove Products XLSX
                              </button>
                            )}
                          </div>

                          {selectedIkasFile && (
                            <div
                              className="rr-selected-file"
                            >
                              <strong>
                                {selectedIkasFile.file_name}
                              </strong>

                              <span>
                                {selectedIkasFile.file_type}
                                {' · '}
                                {formatFileSize(selectedIkasFile.file_size_bytes)}
                              </span>

                              <code>
                                {selectedIkasFile.file_path}
                              </code>
                            </div>
                          )}
                        </div>
                      )
                      : selectedTask.source_id
                          === 'google-keyword-planner-csv'
                        ? (
                          <div
                            className="rr-file-input"
                          >
                            <p>
                              A current Keyword Stats CSV export is required for this fallback task.
                            </p>

                            <div className="rr-input-actions">
                              <button
                                type="button"
                                className="rr-secondary-action"
                                onClick={() => void selectKeywordPlannerCsvFile()}
                              >
                                {selectedKeywordPlannerCsvFile === null
                                  ? 'Select Keyword Stats CSV'
                                  : 'Replace Keyword Stats CSV'}
                              </button>

                              {selectedKeywordPlannerCsvFile && (
                                <button
                                  type="button"
                                  className="rr-secondary-action"
                                  onClick={() => setSelectedKeywordPlannerCsvFile(null)}
                                >
                                  Remove Keyword Stats CSV
                                </button>
                              )}
                            </div>

                            {selectedKeywordPlannerCsvFile && (
                              <div
                                className="rr-selected-file"
                              >
                                <strong>
                                  {selectedKeywordPlannerCsvFile.file_name}
                                </strong>

                                <span>
                                  {selectedKeywordPlannerCsvFile.file_type}
                                  {' · '}
                                  {formatFileSize(selectedKeywordPlannerCsvFile.file_size_bytes)}
                                </span>

                                <code>
                                  {selectedKeywordPlannerCsvFile.file_path}
                                </code>
                              </div>
                            )}
                          </div>
                        )
                      : selectedTask.source_id
                          === 'bitkimark-sitemap'
                        ? (
                          <div
                            className="rr-file-input"
                          >
                            <p>
                              One reviewed request is made for each selected evidence-backed sitemap URL. No discovered link is crawled automatically.
                            </p>

                            <strong>
                              {selectedBitkimarkSitemapUrls.size}
                              {' of '}
                              {BITKIMARK_VERIFIED_SITEMAP_URLS.length}
                              {' sitemap URLs selected'}
                            </strong>

                            <div className="rr-checkbox-list">
                              {BITKIMARK_VERIFIED_SITEMAP_URLS.map((url, index) => (
                                <label key={url}>
                                  <input
                                    type="checkbox"
                                    checked={selectedBitkimarkSitemapUrls.has(url)}
                                    disabled={index === 0}
                                    onChange={(event) => setBitkimarkSitemapSelected(
                                      url,
                                      event.target.checked,
                                    )}
                                  />
                                  <span>{url}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )
                      : selectedTask.source_id
                          === 'google-keyword-planner'
                        ? (
                          <div
                            className="rr-file-input"
                          >
                            <p>
                              Define explicit named groups. Separate keywords with commas.
                            </p>

                            <div className="rr-structured-editor">
                              {keywordPlannerGroupDrafts.map((row, index) => (
                                <fieldset key={row.row_id}>
                                  <legend>Keyword group {index + 1}</legend>
                                  <label>
                                    <span>Group ID</span>
                                    <input
                                      aria-label={`Keyword group ${index + 1} ID`}
                                      value={row.group_id}
                                      onChange={(event) => updateKeywordPlannerGroupDraft(
                                        row.row_id,
                                        'group_id',
                                        event.target.value,
                                      )}
                                    />
                                  </label>
                                  <label>
                                    <span>Group name</span>
                                    <input
                                      aria-label={`Keyword group ${index + 1} name`}
                                      value={row.group_name}
                                      onChange={(event) => updateKeywordPlannerGroupDraft(
                                        row.row_id,
                                        'group_name',
                                        event.target.value,
                                      )}
                                    />
                                  </label>
                                  <label>
                                    <span>Keywords</span>
                                    <input
                                      aria-label={`Keyword group ${index + 1} keywords`}
                                      value={row.keywords}
                                      onChange={(event) => updateKeywordPlannerGroupDraft(
                                        row.row_id,
                                        'keywords',
                                        event.target.value,
                                      )}
                                    />
                                  </label>
                                  {keywordPlannerGroupDrafts.length > 1 && (
                                    <button
                                      type="button"
                                      className="rr-secondary-action"
                                      onClick={() => removeKeywordPlannerGroupDraft(row.row_id)}
                                    >
                                      Remove keyword group {index + 1}
                                    </button>
                                  )}
                                </fieldset>
                              ))}
                            </div>

                            {hasDuplicateKeywordPlannerGroupIds && (
                              <p className="rr-field-error">Group IDs must be unique.</p>
                            )}

                            <button
                              type="button"
                              className="rr-secondary-action"
                              onClick={addKeywordPlannerGroupDraft}
                            >
                              Add keyword group
                            </button>
                          </div>
                        )
                      : selectedTask.source_id === 'serpapi'
                        ? (
                          <div className="rr-file-input">
                            <p>
                              Define an explicit on-demand query batch with stable query IDs.
                            </p>

                            <div className="rr-structured-editor">
                              {serpApiQueryDrafts.map((row, index) => (
                                <fieldset key={row.row_id}>
                                  <legend>SERP query {index + 1}</legend>
                                  <label>
                                    <span>Query ID</span>
                                    <input
                                      aria-label={`SERP query ${index + 1} ID`}
                                      value={row.job_key}
                                      onChange={(event) => updateSerpApiQueryDraft(
                                        row.row_id,
                                        'job_key',
                                        event.target.value,
                                      )}
                                    />
                                  </label>
                                  <label>
                                    <span>Query text</span>
                                    <input
                                      aria-label={`SERP query ${index + 1} text`}
                                      value={row.query}
                                      onChange={(event) => updateSerpApiQueryDraft(
                                        row.row_id,
                                        'query',
                                        event.target.value,
                                      )}
                                    />
                                  </label>
                                  {serpApiQueryDrafts.length > 1 && (
                                    <button
                                      type="button"
                                      className="rr-secondary-action"
                                      onClick={() => removeSerpApiQueryDraft(row.row_id)}
                                    >
                                      Remove SERP query {index + 1}
                                    </button>
                                  )}
                                </fieldset>
                              ))}
                            </div>

                            {hasDuplicateSerpApiQueryIds && (
                              <p className="rr-field-error">Query IDs must be unique.</p>
                            )}

                            <button
                              type="button"
                              className="rr-secondary-action"
                              onClick={addSerpApiQueryDraft}
                            >
                              Add SERP query
                            </button>
                          </div>
                        )
                      : (
                        <p>
                          Provider input and connection state are managed through the source-neutral collection boundary.
                        </p>
                      )}
                  </section>

                  <section
                    className="rr-panel rr-detail-panel"
                  >
                    <span
                      className="rr-kicker"
                    >
                      HISTORY
                    </span>

                    <h2>
                      Recent Runs
                    </h2>

                    <div
                      className="rr-operational-list"
                      data-testid="task-recent-runs"
                    >
                      {recentTaskRuns.length === 0
                        ? <p>No persisted runs for this task yet.</p>
                        : recentTaskRuns.map((run) => {
                            const state = taskRecentRunStates[run.run_id];
                            const acceptedValidationCount = state?.jobs.filter((job) => (
                              job.validation_status === 'VALID'
                              || job.validation_status === 'LOW_DATA'
                              || job.validation_status === 'NO_DATA'
                            )).length ?? 0;
                            const attentionValidationCount = state === undefined
                              ? 0
                              : state.jobs.length - acceptedValidationCount;

                            return (
                              <article key={run.run_id}>
                                <strong>{formatStatus(run.run_status)}</strong>
                                <span>Created: {formatTimestamp(run.created_at)}</span>
                                {state && (
                                  <span>
                                    Validation: {acceptedValidationCount} valid
                                    {' · '}
                                    {attentionValidationCount} needs attention
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="rr-secondary-action"
                                  disabled={busy}
                                  onClick={() => {
                                    setSelectedTask(null);
                                    setView('RUNS');
                                    void openHistoryRun(run.run_id);
                                  }}
                                >
                                  Open Run
                                </button>
                              </article>
                            );
                          })}
                    </div>
                  </section>
                </div>

                <div
                  className="rr-task-detail-actions"
                >
                  {!canReview && (
                    <p>
                      {effectiveReadiness !== 'READY'
                        ? readinessReason
                          ?? 'Resolve the current readiness requirement before reviewing a Quick Run.'
                        : 'Complete the task-specific Quick Run configuration before Review.'}
                    </p>
                  )}


                  {canReview
                    || effectiveReadiness === 'READY'
                    || readinessRemediation === null
                    ? null
                    : (
                      <button
                        type="button"
                        className="rr-secondary-action"
                        onClick={() => void followReadinessRemediation(
                          readinessRemediation,
                        )}
                      >
                        {readinessRemediation.label}
                      </button>
                    )}

                  <button
                    type="button"
                    className="rr-primary-action"
                    disabled={
                      !canReview
                      || busy
                    }
                    onClick={
                      () =>
                        void reviewSelectedTaskQuickRun()
                    }
                  >
                    Review Quick Run
                  </button>
                </div>
              </section>
            );
          })()}

          {selectedTask
            && selectedTask.task_kind === 'COLLECTION'
            && quickRunReview !== null
            && (
              <section
                className="rr-review-page"
              >
                <button
                  type="button"
                  className="rr-back-button"
                  onClick={
                    () =>
                      setQuickRunReview(
                        null,
                      )
                  }
                >
                  Back to Task
                </button>

                <header
                  className="rr-task-detail-head"
                >
                  <div>
                    <span
                      className="rr-kicker"
                    >
                      QUICK RUN
                    </span>

                    <h1>
                      Review Quick Run
                    </h1>

                    <p>
                      Confirm the exact Run input before any provider execution begins.
                    </p>
                  </div>

                  <span
                    className={
                      quickRunReview.review.can_start
                        ? 'rr-status rr-status-ready'
                        : 'rr-status rr-status-file_required'
                    }
                  >
                    {
                      quickRunReview.review.can_start
                        ? 'READY'
                        : 'BLOCKED'
                    }
                  </span>
                </header>

                <div
                  className="rr-detail-sections"
                >
                  <section
                    className="rr-panel rr-detail-panel"
                  >
                    <span
                      className="rr-kicker"
                    >
                      TASK
                    </span>

                    <h2>
                      {selectedTask.task_name}
                    </h2>

                    <dl
                      className="rr-detail-list"
                    >
                      <div>
                        <dt>
                          Workspace
                        </dt>
                        <dd>
                          {
                            quickRunReview
                              .review
                              .workspace
                              .workspace_name
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>
                          Jobs
                        </dt>
                        <dd>
                          {
                            quickRunReview
                              .review
                              .job_count
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>
                          Readiness
                        </dt>
                        <dd>
                          {
                            quickRunReview
                              .review
                              .can_start
                              ? 'READY'
                              : 'BLOCKED'
                          }
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section
                    className="rr-panel rr-detail-panel"
                  >
                    <span
                      className="rr-kicker"
                    >
                      EXACT INPUT
                    </span>

                    <h2>
                      Input / Connection
                    </h2>

                    {
                      selectedTask.source_id === 'ikas-products'
                      && selectedIkasFile !== null
                        ? (
                          <div
                            className="rr-selected-file"
                          >
                            <strong>
                              {selectedIkasFile.file_name}
                            </strong>

                            <code>
                              {selectedIkasFile.file_path}
                            </code>
                          </div>
                        )
                        : selectedTask.source_id
                            === 'google-keyword-planner-csv'
                          && selectedKeywordPlannerCsvFile !== null
                          ? (
                            <div
                              className="rr-selected-file"
                            >
                              <strong>
                                {selectedKeywordPlannerCsvFile.file_name}
                              </strong>

                              <code>
                                {selectedKeywordPlannerCsvFile.file_path}
                              </code>
                            </div>
                          )
                        : (
                          <p>
                            Configuration is captured in the reviewed Run draft.
                          </p>
                        )
                    }
                  </section>
                </div>

                {(() => {
                  const summary =
                    getReviewedDateSummary(
                      quickRunReview.review,
                    );

                  return summary === null
                    ? null
                    : (
                      <section
                        className="rr-panel rr-detail-panel"
                      >
                        <span
                          className="rr-kicker"
                        >
                          RESOLVED RUN WINDOW
                        </span>

                        <h2>
                          Exact Dates
                        </h2>

                        <p>
                          {
                            [
                              'Reference date: ',
                              summary.referenceDate,
                            ].join('')
                          }
                        </p>

                        <p>
                          {
                            [
                              'Resolved range: ',
                              summary.start,
                              ' → ',
                              summary.end,
                            ].join('')
                          }
                        </p>
                      </section>
                    );
                })()}

                {(() => {
                  const summary =
                    getReviewedGoogleTrendsSummary(
                      quickRunReview.review,
                    );

                  return summary === null
                    ? null
                    : (
                      <section
                        className={
                          'rr-panel rr-detail-panel'
                        }
                      >
                        <span
                          className={
                            'rr-kicker'
                          }
                        >
                          COMPARISON CONTEXT
                        </span>

                        <h2>
                          Google Trends Scope
                        </h2>

                        <p>
                          {
                            [
                              'Configured groups: ',
                              String(
                                summary.groupIds.length,
                              ),
                            ].join('')
                          }
                        </p>

                        <p>
                          {
                            [
                              'Query groups: ',
                              summary.groupIds.join(
                                ', ',
                              ),
                            ].join('')
                          }
                        </p>

                        <p>
                          Fixed scope: Turkey · All Categories · Web Search · Search Term
                        </p>
                      </section>
                    );
                })()}

                {(() => {
                  const groups =
                    getReviewedKeywordPlannerGroups(
                      quickRunReview.review,
                    );

                  return groups === null
                    ? null
                    : (
                      <section
                        className="rr-panel rr-detail-panel"
                      >
                        <span
                          className="rr-kicker"
                        >
                          REQUESTED KEYWORDS
                        </span>

                        <h2>
                          Keyword Planner Groups
                        </h2>

                        <p>
                          Keyword groups: {groups.length}
                        </p>

                        {groups.map(
                          (group) => (
                            <p
                              key={group.group_id}
                            >
                              {group.group_id}: {group.keywords.join(', ')}
                            </p>
                          ),
                        )}
                      </section>
                    );
                })()}

                {(() => {
                  const sitemaps =
                    getReviewedBitkimarkSitemaps(
                      quickRunReview.review,
                    );

                  return sitemaps === null
                    ? null
                    : (
                      <section
                        className="rr-panel rr-detail-panel"
                      >
                        <span
                          className="rr-kicker"
                        >
                          REQUESTED HTTP/XML
                        </span>

                        <h2>
                          Bitkimark Sitemaps
                        </h2>

                        <p>
                          Sitemap URLs: {sitemaps.length}
                        </p>

                        {sitemaps.map(
                          (sitemap) => (
                            <p
                              key={sitemap.requested_url}
                            >
                              {sitemap.requested_url}
                            </p>
                          ),
                        )}
                      </section>
                    );
                })()}

                {(() => {
                  const queries = getReviewedSerpApiQueries(quickRunReview.review);
                  return queries === null
                    ? null
                    : (
                      <section className="rr-panel rr-detail-panel">
                        <span className="rr-kicker">
                          ON-DEMAND BATCH
                        </span>

                        <h2>
                          SerpApi Queries
                        </h2>

                        <p>
                          SERP queries: {queries.length}
                        </p>

                        {queries.map((query) => (
                          <p key={query.job_key}>
                            {query.job_key}: {query.query}
                          </p>
                        ))}

                        <p>
                          Fixed scope: Google · Turkey · Turkish · Desktop · First page · 10 organic
                        </p>
                      </section>
                    );
                })()}

                {
                  quickRunReview
                    .review
                    .blocking_sources
                    .length > 0
                  && (
                    <p
                      className="rr-alert"
                    >
                      Blocking sources:
                      {' '}
                      {
                        quickRunReview
                          .review
                          .blocking_sources
                          .join(', ')
                      }
                    </p>
                  )
                }

                <div
                  className="rr-task-detail-actions"
                >
                  <p>
                    Provider execution has not started.
                  </p>

                  <button
                    type="button"
                    className="rr-primary-action"
                    disabled={
                      quickRunReview.review.can_start === false
                      || busy
                    }
                    onClick={
                      () =>
                        void startReviewedQuickRun()
                    }
                  >
                    Start Run
                  </button>
                </div>
              </section>
            )}

          {!selectedTask
            && view ===
            'HOME'
            && (
              <>
                <div
                  className="rr-page-head"
                >
                  <div>
                    <span
                      className="rr-kicker"
                    >
                      HOME
                    </span>

                    <h1>
                      Collection Operations
                    </h1>

                    <p>
                      Inspect readiness and run traceable collection work from one Workspace.
                    </p>
                  </div>
                </div>

                <section
                  className="rr-dashboard"
                  data-testid="operations-dashboard"
                >
                  <button type="button" onClick={() => navigateTo('TASKS')}>
                    <strong>{dashboardReadyCount} ready</strong>
                    <span>Open runnable sources</span>
                  </button>
                  <button type="button" onClick={() => navigateTo('WORKSPACE')}>
                    <strong>{dashboardConnectionCount} need connection</strong>
                    <span>Manage source access</span>
                  </button>
                  <button type="button" onClick={() => navigateTo('TASKS')}>
                    <strong>{dashboardImportCount} need import</strong>
                    <span>Select current provider files</span>
                  </button>
                  <button type="button" onClick={() => navigateTo('TASKS')}>
                    <strong>{dashboardAttentionCount} needs attention</strong>
                    <span>Resolve configuration or manual action</span>
                  </button>
                  <button
                    type="button"
                    disabled={recentCompletedRun === null}
                    onClick={() => {
                      if (recentCompletedRun === null) return;
                      setView('RUNS');
                      void openHistoryRun(recentCompletedRun.run_id);
                    }}
                  >
                    <strong>Recent completed work</strong>
                    <span>
                      {recentCompletedRun === null
                        ? 'No completed runs yet'
                        : `${getRunDisplayName(recentCompletedRun)} · ${formatTimestamp(recentCompletedRun.completed_at)}`}
                    </span>
                  </button>
                </section>

                <section
                  className="rr-preset-run"
                >
                  <div>
                    <span
                      className="rr-kicker"
                    >
                      PRESET RUN
                    </span>

                    <h2>
                      Reusable multi-task collection
                    </h2>

                    <p>
                      Provider execution starts only after Review.
                    </p>
                  </div>

                  <label>
                    <span>
                      Saved Preset
                    </span>

                    <select
                      aria-label="Saved Preset"
                      value={
                        presetId
                      }
                      disabled={
                        presets.length
                        === 0
                      }
                      onChange={
                        (event) =>
                          setPresetId(
                            event
                              .target
                              .value,
                          )
                      }
                    >
                      {presets.length
                        === 0
                        && (
                          <option
                            value=""
                          >
                            No saved preset
                          </option>
                        )}

                      {presets.map(
                        (
                          preset,
                        ) => (
                          <option
                            key={
                              preset
                                .preset_id
                            }
                            value={
                              preset
                                .preset_id
                            }
                          >
                            {
                              preset
                                .preset_name
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </section>

                {
                  renderTaskCatalog()
                }
              </>
            )}

          {!selectedTask
            && view ===
            'TASKS'
            && (
              <>
                <div
                  className="rr-page-head"
                >
                  <div>
                    <span
                      className="rr-kicker"
                    >
                      TASK CATALOG
                    </span>

                    <h1>
                      Tasks
                    </h1>

                    <p>
                      Every dataset is an independent collection task.
                    </p>
                  </div>
                </div>

                {
                  renderTaskCatalog()
                }
              </>
            )}

          {!selectedTask
            && view === 'RUNS'
            && activeRunState !== null
            && (
              <section
                className="rr-panel"
              >
                <span
                  className="rr-kicker"
                >
                  RUN
                </span>

                <h1>
                  Run Detail
                </h1>

                <h2>
                  {getRunDisplayName(activeRunState.run)}
                </h2>

                <p>
                  Run Status: {formatStatus(activeRunState.run.run_status)}
                </p>

                <dl className="rr-detail-list rr-run-summary">
                  <div>
                    <dt>Created</dt>
                    <dd>{formatTimestamp(activeRunState.run.created_at)}</dd>
                  </div>
                  <div>
                    <dt>Started</dt>
                    <dd>{formatTimestamp(activeRunState.run.started_at)}</dd>
                  </div>
                  <div>
                    <dt>Completed</dt>
                    <dd>{formatTimestamp(activeRunState.run.completed_at)}</dd>
                  </div>
                </dl>

                <details className="rr-technical-details">
                  <summary>Technical identifiers</summary>
                  <code>{activeRunState.run.run_id}</code>
                </details>

                <p>
                  {activeRunState.completed_jobs}
                  {' / '}
                  {activeRunState.jobs.length}
                  {' completed · '}
                  {activeRunState.failed_jobs}
                  {' failed'}
                </p>

                <h2>
                  Jobs
                </h2>

                <div>
                  {activeRunState.jobs.map(
                    (job) => (
                      <article
                        key={job.job_id}
                        className="rr-run-job"
                      >
                        <h3>{getJobDisplayName(job)}</h3>

                        <strong>
                          {job.job_key}
                        </strong>

                        <p>
                          Source: {job.source_id}
                        </p>

                        <p>
                          Execution: {formatStatus(job.execution_status)}
                        </p>

                        <p>
                          Validation: {formatStatus(job.validation_status)}
                        </p>

                        <p>
                          Attempts: {job.attempt_count}
                        </p>

                        {activeRunState.job_attempts
                          ?.filter((attempt) => attempt.job_id === job.job_id)
                          .slice(-1)
                          .map((attempt) => attempt.error_code === null
                            ? null
                            : (
                              <p key={`${attempt.job_id}-${attempt.attempt_number}`}>
                                Error: {attempt.error_code}
                              </p>
                            ))}

                        <p>
                          Started: {formatTimestamp(job.started_at)}
                        </p>

                        <p>
                          Completed: {formatTimestamp(job.completed_at)}
                        </p>

                        <details className="rr-technical-details">
                          <summary>Job identifier</summary>
                          <code>{job.job_id}</code>
                        </details>

                        {job.accepted_artifact_id !== null
                          && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void openAcceptedEvidence(job.job_id)}
                            >
                              Open Accepted Evidence
                            </button>
                          )}
                      </article>
                    ),
                  )}
                </div>

                {
                  activeRunState.can_resume
                    === true
                  && (
                    <button
                      type="button"
                      className="rr-primary-action"
                      disabled={
                        busy
                      }
                      onClick={
                        () =>
                          void resumeActiveRun()
                      }
                    >
                      Resume Run
                    </button>
                  )
                }

                {
                  activeRunState.run.run_status === 'MANUAL_ACTION_REQUIRED'
                  && (
                    <button
                      type="button"
                      className="rr-primary-action"
                      disabled={
                        busy
                      }
                      onClick={
                        () =>
                          void continueActiveRun()
                      }
                    >
                      Continue Run
                    </button>
                  )
                }

                {
                  activeRunState.can_retry
                    === true
                  && (
                    <button
                      type="button"
                      className="rr-primary-action"
                      disabled={
                        busy
                      }
                      onClick={
                        () =>
                          void retryActiveRun()
                      }
                    >
                      Retry Failed
                    </button>
                  )
                }

                {
                  activeRunState.can_cancel
                    === true
                  && (
                    <button
                      type="button"
                      className="rr-primary-action"
                      disabled={
                        busy
                      }
                      onClick={
                        () =>
                          void cancelActiveRun()
                      }
                    >
                      Cancel Run
                    </button>
                  )
                }

                {
                  (
                    activeRunState.run.run_status === 'COMPLETED'
                    || activeRunState.run.run_status === 'COMPLETED_WITH_WARNINGS'
                    || activeRunState.run.run_status === 'FAILED'
                    || activeRunState.run.run_status === 'CANCELLED'
                  )
                  && taskPackageCollectionIntent !== null
                  && taskPackageCollectionRunId === activeRunState.run.run_id
                  && (
                    <button
                      type="button"
                      className="rr-primary-action"
                      disabled={busy}
                      onClick={() => void reviewTaskPackageAgain()}
                    >
                      Review Kampanya Gelişim Again
                    </button>
                  )
                }

                {
                  (
                    activeRunState.run.run_status === 'COMPLETED'
                    || activeRunState.run.run_status === 'COMPLETED_WITH_WARNINGS'
                    || activeRunState.run.run_status === 'FAILED'
                    || activeRunState.run.run_status === 'CANCELLED'
                  )
                  && (
                    <div
                      className="rr-task-detail-actions"
                    >
                      <button
                        type="button"
                        className="rr-primary-action"
                        disabled={
                          busy
                        }
                        onClick={
                          () =>
                            void exportActiveRun(
                              'ALL',
                            )
                        }
                      >
                        Export All
                      </button>

                      <button
                        type="button"
                        disabled={
                          busy
                        }
                        onClick={
                          () =>
                            void exportActiveRun(
                              'SUCCESSFUL_ONLY',
                            )
                        }
                      >
                        Export Successful Only
                      </button>
                    </div>
                  )
                }

                {exportResult !== null
                  && (
                    <div>
                      <p>
                        {exportResult.export_directory}
                      </p>

                      <p>
                        Datasets: {exportResult.dataset_count}
                        {' · Failures: '}
                        {exportResult.failed_count}
                      </p>
                    </div>
                  )}
              </section>
            )}

          {!selectedTask
            && view === 'RUNS'
            && activeRunState === null
            && (
              <section
                className="rr-panel"
              >
                <span
                  className="rr-kicker"
                >
                  RUN HISTORY
                </span>

                <h1>
                  Runs
                </h1>

                {runHistory.length === 0
                  ? (
                    <p>
                      No persisted Runs yet.
                    </p>
                  )
                  : (
                    <div className="rr-operational-list">
                      {runHistory.map(
                        (run) => (
                          <article
                            key={run.run_id}
                          >
                            <button
                              type="button"
                              className="rr-run-history-action"
                              disabled={
                                busy
                              }
                              onClick={
                                () =>
                                  void openHistoryRun(
                                    run.run_id,
                                  )
                              }
                            >
                              <strong>{getRunDisplayName(run)}</strong>
                              <span>{formatStatus(run.run_status)}</span>
                              <small>{run.run_id}</small>
                            </button>

                            <p>
                              Created: {formatTimestamp(run.created_at)}
                            </p>

                            <p>
                              Sources: {run.selected_sources.join(', ')}
                            </p>
                          </article>
                        ),
                      )}
                    </div>
                  )}
              </section>
            )}

          {!selectedTask
            && view ===
            'PRESETS'
            && (
              <>
                <div
                  className="rr-page-head"
                >
                  <div>
                    <span
                      className="rr-kicker"
                    >
                      REUSABLE CONFIGURATION
                    </span>

                    <h1>
                      Presets
                    </h1>
                  </div>
                </div>

                <div className="rr-two-column">
                  <section
                    className="rr-panel"
                  >
                    <span
                      className="rr-kicker"
                    >
                      SAVED PRESETS
                    </span>

                    <div
                      className="rr-preset-list"
                    >
                      {presets.length
                        === 0
                        && (
                          <p>
                            No saved presets yet.
                          </p>
                        )}

                      {presets.map(
                        (
                          preset,
                        ) => (
                          <div
                            key={
                              preset
                                .preset_id
                            }
                          >
                            <strong>
                              {
                                preset
                                  .preset_name
                              }
                            </strong>

                            <span>
                              {Object.keys(
                                getReusableSources(preset.reusable_configuration),
                              ).length}
                              {' tasks'}
                            </span>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setPresetId(preset.preset_id)}
                            >
                              Open
                            </button>

                            <button
                              type="button"
                              disabled={
                                busy
                              }
                              onClick={
                                () =>
                                  void deletePreset(
                                    preset,
                                  )
                              }
                            >
                              Delete
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  </section>

                  <section
                    className="rr-panel"
                    data-testid="preset-editor"
                  >
                    <span
                      className="rr-kicker"
                    >
                      PRESET EDITOR
                    </span>

                    {selectedPreset === null
                      ? <p>Open a saved preset to inspect and edit it.</p>
                      : (
                        <>
                          <label className="rr-field">
                            <span>Preset name</span>
                            <input
                              aria-label="Edit preset name"
                              value={presetEditorName}
                              onChange={(event) => {
                                setPresetEditorName(event.target.value);
                                setPresetEditorDirty(true);
                                setPresetReview(null);
                              }}
                            />
                          </label>

                          <div className="rr-preset-task-list">
                            {DESKTOP_TASK_CATALOG
                              .filter((task): task is CollectionDesktopTaskDefinition => (
                                task.task_kind === 'COLLECTION'
                              ))
                              .map((task) => {
                              const configuration = presetEditorSources[task.source_id];
                              const configuredTaskId = typeof configuration === 'object'
                                && configuration !== null
                                && !Array.isArray(configuration)
                                && typeof (configuration as JsonObject).task_id === 'string'
                                ? (configuration as JsonObject).task_id
                                : null;
                              const checked = configuredTaskId === task.task_id;
                              const available = checked
                                || buildCurrentTaskSourceConfiguration(task) !== null;

                              return (
                                <label key={task.task_id}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!available}
                                    onChange={(event) => setPresetTaskIncluded(
                                      task,
                                      event.target.checked,
                                    )}
                                  />
                                  <span>{task.task_name}</span>
                                  <small>
                                    Readiness: {formatStatus(
                                      readinessBySource.get(task.source_id)
                                      ?? 'NOT_YET_AVAILABLE',
                                    )}
                                  </small>
                                </label>
                              );
                            })}
                          </div>

                          {presetEditorDirty && (
                            <p className="rr-field-error">Unsaved preset changes.</p>
                          )}

                          <div className="rr-input-actions">
                            <button
                              type="button"
                              className="rr-primary-action"
                              disabled={busy || !presetEditorDirty || !presetEditorName.trim()}
                              onClick={() => void updatePreset()}
                            >
                              Save Changes
                            </button>
                            <button
                              type="button"
                              className="rr-secondary-action"
                              disabled={busy}
                              onClick={() => void duplicatePreset()}
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              className="rr-secondary-action"
                              disabled={busy || presetEditorDirty}
                              onClick={() => void reviewPreset()}
                            >
                              Review Preset
                            </button>
                          </div>

                          {presetReview && (
                            <div className="rr-preset-review" data-testid="preset-review">
                              <strong>
                                {presetReview.review.included_sources.length}
                                {' sources · '}
                                {presetReview.review.job_count}
                                {' jobs'}
                              </strong>
                              {presetReview.review.source_cards
                                .filter((card) => card.included)
                                .map((card) => (
                                  <p key={card.source_id}>
                                    {card.source_name}: {formatStatus(card.readiness_status)}
                                  </p>
                                ))}
                              {presetReview.review.blocking_sources.length > 0 && (
                                <p className="rr-field-error">
                                  Blocked: {presetReview.review.blocking_sources.join(', ')}
                                </p>
                              )}
                              <button
                                type="button"
                                className="rr-primary-action"
                                disabled={busy || !presetReview.review.can_start}
                                onClick={() => void startReviewedPreset()}
                              >
                                Start Preset Run
                              </button>
                            </div>
                          )}
                        </>
                      )}
                  </section>
                </div>

                <section
                  className="rr-panel rr-new-preset"
                  data-testid="new-preset"
                >
                  <span className="rr-kicker">
                    NEW PRESET
                  </span>

                    <label
                      className="rr-field"
                    >
                      <span>
                        Preset name
                      </span>

                      <input
                        aria-label="New preset name"
                        value={
                          newPresetName
                        }
                        onChange={
                          (event) =>
                            setNewPresetName(
                              event
                                .target
                                .value,
                            )
                        }
                      />
                    </label>

                    <div className="rr-preset-task-list">
                      {DESKTOP_TASK_CATALOG
                        .filter((task): task is CollectionDesktopTaskDefinition => (
                          task.task_kind === 'COLLECTION'
                        ))
                        .map((task) => {
                        const available = buildCurrentTaskSourceConfiguration(task) !== null;
                        return (
                          <label key={task.task_id}>
                            <input
                              type="checkbox"
                              checked={newPresetTaskIds.includes(task.task_id)}
                              disabled={!available}
                              onChange={(event) => toggleNewPresetTask(
                                task,
                                event.target.checked,
                              )}
                            />
                            <span>{task.task_name}</span>
                          </label>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      disabled={
                        busy
                        || !workspaceId
                        || !newPresetName
                          .trim()
                        || newPresetTaskIds.length === 0
                      }
                      onClick={
                        () =>
                          void createPreset()
                      }
                    >
                      Create Preset
                    </button>
                  </section>
              </>
            )}

          {!selectedTask
            && view ===
            'WORKSPACE'
            && (
              <section
                className="rr-panel"
              >
                <span
                  className="rr-kicker"
                >
                  SHARED INFRASTRUCTURE
                </span>

                <h1>
                  Workspace
                </h1>

                <p>
                  Connections and local data live here. Task configuration does not.
                </p>

                <article
                  className="rr-panel rr-detail-panel rr-connection-panel"
                  data-testid="google-provider-configuration"
                >
                  <h2>Application / Provider Credentials</h2>
                  <p>
                    Shared Google credentials are stored by the main process. Values never enter this page.
                  </p>
                  <p>
                    OAuth application: {googleProviderConfiguration
                      ?.oauth_application_status ?? 'NOT_CONFIGURED'}
                  </p>
                  <div className="rr-connection-actions">
                    <button
                      type="button"
                      disabled={pendingGoogleProviderComponent !== null}
                      onClick={() => {
                        void configureGoogleProvider('OAUTH_APPLICATION');
                      }}
                    >
                      {googleProviderConfiguration?.oauth_application_status
                        === 'AVAILABLE'
                        ? 'Replace OAuth application'
                        : 'Configure OAuth application'}
                    </button>
                  </div>
                </article>

                <div
                  className="rr-detail-sections"
                  data-testid="workspace-connections"
                >
                  {workspaceConnections.map(
                    (connection) => {
                      const draft = workspaceConnectionDrafts[
                        connection.source_id
                      ] ?? EMPTY_WORKSPACE_CONNECTION_DRAFT;
                      const pending = pendingWorkspaceConnectionSource
                        === connection.source_id;
                      const isGoogle = connection.source_id !== 'serpapi';
                      const requiredMetadataReady = connection.source_id
                        === 'google-search-console-query-page'
                        ? draft.site_url.trim().length > 0
                        : draft.customer_id.trim().length > 0;
                      const providerReady = googleProviderConfiguration
                        ?.oauth_application_status === 'AVAILABLE';

                      return (
                        <article
                          key={connection.source_id}
                          className="rr-panel rr-detail-panel rr-connection-panel"
                          data-testid={`workspace-connection-${connection.source_id}`}
                        >
                          <strong>
                            {connection.source_id}
                          </strong>

                          <p>
                            Credential: {connection.credential_status}
                          </p>

                          <p>
                            Readiness: {connection.readiness_status}
                          </p>

                          {isGoogle && (
                            <div className="rr-connection-fields">
                              {connection.source_id
                                === 'google-search-console-query-page'
                                ? (
                                  <label className="rr-field">
                                    <span>Site URL</span>
                                    <input
                                      aria-label={`Site URL for ${connection.source_id}`}
                                      type="text"
                                      autoComplete="off"
                                      value={draft.site_url}
                                      onChange={(event) => {
                                        updateWorkspaceConnectionDraft(
                                          connection.source_id,
                                          'site_url',
                                          event.target.value,
                                        );
                                      }}
                                    />
                                  </label>
                                )
                                : (
                                  <>
                                    <label className="rr-field">
                                      <span>Customer ID</span>
                                      <input
                                        aria-label={`Customer ID for ${connection.source_id}`}
                                        type="text"
                                        autoComplete="off"
                                        value={draft.customer_id}
                                        onChange={(event) => {
                                          updateWorkspaceConnectionDraft(
                                            connection.source_id,
                                            'customer_id',
                                            event.target.value,
                                          );
                                        }}
                                      />
                                    </label>
                                    <label className="rr-field">
                                      <span>Login customer ID (optional)</span>
                                      <input
                                        aria-label={`Login customer ID for ${connection.source_id}`}
                                        type="text"
                                        autoComplete="off"
                                        value={draft.login_customer_id}
                                        onChange={(event) => {
                                          updateWorkspaceConnectionDraft(
                                            connection.source_id,
                                            'login_customer_id',
                                            event.target.value,
                                          );
                                        }}
                                      />
                                    </label>
                                  </>
                                )}
                            </div>
                          )}

                          {connection.source_id === 'serpapi' && (
                            <p className="rr-connection-note">
                              API-key entry opens in a native masked prompt and never enters this renderer.
                            </p>
                          )}

                          <div className="rr-connection-actions">
                            {isGoogle
                              && connection.credential_status === 'AVAILABLE'
                              && (
                                <button
                                  type="button"
                                  disabled={pending || !requiredMetadataReady}
                                  onClick={() => {
                                    void mutateWorkspaceConnection(
                                      connection.source_id,
                                      'MANAGE',
                                    );
                                  }}
                                >
                                  Manage
                                </button>
                              )}
                            {isGoogle
                              && connection.credential_status === 'MISSING'
                              && (
                                <button
                                  type="button"
                                  disabled={pending || !providerReady}
                                  onClick={() => {
                                    void mutateWorkspaceConnection(
                                      connection.source_id,
                                      'RECONNECT_GOOGLE',
                                    );
                                  }}
                                >
                                  Reconnect
                                </button>
                              )}
                            {isGoogle
                              && connection.credential_status === 'NOT_CONFIGURED'
                              && (
                                <button
                                  type="button"
                                  disabled={pending || !requiredMetadataReady || !providerReady}
                                  onClick={() => {
                                    void mutateWorkspaceConnection(
                                      connection.source_id,
                                      'CONNECT_GOOGLE',
                                    );
                                  }}
                                >
                                  Connect
                                </button>
                              )}
                            {!isGoogle && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => {
                                  void mutateWorkspaceConnection(
                                    connection.source_id,
                                    'PROVISION_SERPAPI',
                                  );
                                }}
                              >
                                {connection.credential_status === 'AVAILABLE'
                                  ? 'Replace API key'
                                  : connection.credential_status === 'MISSING'
                                    ? 'Re-provision API key'
                                    : 'Provision API key'}
                              </button>
                            )}
                            {connection.credential_status !== 'NOT_CONFIGURED' && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => {
                                  void mutateWorkspaceConnection(
                                    connection.source_id,
                                    'DISCONNECT',
                                  );
                                }}
                              >
                                Disconnect
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    },
                  )}
                </div>
              </section>
            )}
        </div>
      </section>
    </main>
  );
}
