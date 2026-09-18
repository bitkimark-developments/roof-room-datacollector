import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  DESKTOP_TASK_CATALOG,
  type DesktopTaskDefinition,
  type DesktopTaskGroup,
} from './desktop-task-catalog';
import type {
  DesktopReview,
  DesktopReadinessStatus,
  DesktopRunDraft,
  DesktopWorkspaceView,
} from './shared/desktop-multisource';
import type {
  SavedCollectionPresetRecord,
} from './shared/collection-configuration';

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
  onOpen,
}: {
  task:
    DesktopTaskDefinition;
  readiness:
    UiReadiness;
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

import type { JsonObject } from './shared/run-job';

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

const parseKeywordPlannerGroups = (
  value: string,
): KeywordPlannerInputGroup[] | null => {
  const lines =
    value
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  const groups:
    KeywordPlannerInputGroup[] = [];

  for (const line of lines) {
    const parts =
      line
        .split('|')
        .map((part) => part.trim());

    if (parts.length !== 3) {
      return null;
    }

    const [
      groupId,
      groupName,
      keywordText,
    ] = parts;

    const keywords =
      keywordText
        .split(',')
        .map((keyword) => keyword.trim());

    if (
      !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u.test(groupId)
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
    selectedIkasFile,
    setSelectedIkasFile,
  ] =
    useState<{
      file_path: string;
      file_name: string;
    } | null>(
      null,
    );

  const [
    keywordPlannerGroupsInput,
    setKeywordPlannerGroupsInput,
  ] =
    useState('');

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
    ])
      .then(
        ([
          next,
          info,
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
                          readinessBySource
                            .get(
                              task
                                .source_id,
                            )
                          ?? 'NOT_YET_AVAILABLE'
                        }
                        onOpen={
                          () => {
                            setQuickRunReview(
                              null,
                            );

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
        ) {
          return;
        }

        setSelectedIkasFile({
          file_path:
            result.file_path,
          file_name:
            result.file_name,
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

  const reviewSelectedTaskQuickRun =
    async () => {
      if (
        selectedTask === null
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

      const keywordPlannerGroups =
        selectedTask.source_id
          === 'google-keyword-planner'
          ? parseKeywordPlannerGroups(
              keywordPlannerGroupsInput,
            )
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

        const sourceConfiguration:
          JsonObject =
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
              ? {
                  included:
                    true,
                  task_id:
                    selectedTask.task_id,
                  date_policy:
                    selectedTask.date_policy,
                }
              : selectedTask.source_id === 'ikas-products'
            && selectedIkasFile !== null
              ? {
                  included: true,
                  file_path:
                    selectedIkasFile.file_path,
                }
              : selectedTask.source_id
                  === 'google-keyword-planner'
                && keywordPlannerGroups !== null
                ? {
                    included:
                      true,
                    task_id:
                      selectedTask.task_id,
                    groups:
                      keywordPlannerGroups,
                  }
              : {
                  included: true,
                };

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
        const created =
          await window
            .roofroom
            .createDesktopPreset({
              workspace_id:
                workspaceId,
              preset_name:
                presetName,
              reusable_configuration: {
                sources:
                  {},
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
                  () => {
                    setSelectedTask(
                      null,
                    );

                    setQuickRunReview(
                      null,
                    );

                    setView(
                      item,
                    );
                  }
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
                  (event) => {
                    setWorkspaceId(
                      event
                        .target
                        .value,
                    );

                    setSelectedTask(
                      null,
                    );

                    setSelectedIkasFile(
                      null,
                    );

                    setQuickRunReview(
                      null,
                    );

                    setView(
                      'HOME',
                    );
                  }
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
              ● SYSTEM READY
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

          {selectedTask
            && quickRunReview === null
            && (() => {
            const readiness =
              readinessBySource.get(
                selectedTask.source_id,
              )
              ?? 'NOT_YET_AVAILABLE';

            const effectiveReadiness =
              selectedTask.source_id === 'ikas-products'
              && selectedIkasFile !== null
                ? 'READY'
                : readiness;

            const hasReviewableQuickRunConfiguration =
              (
                selectedTask.source_id === 'ikas-products'
                && selectedIkasFile !== null
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
                  keywordPlannerGroupsInput,
                ) !== null
              );

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
                  onClick={() => {
                    setSelectedTask(
                      null,
                    );
                    setView(
                      'TASKS',
                    );
                  }}
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

                          <button
                            type="button"
                            className="rr-secondary-action"
                            onClick={
                              () =>
                                void selectIkasProductsFile()
                            }
                          >
                            Select Products XLSX
                          </button>

                          {selectedIkasFile && (
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
                          )}
                        </div>
                      )
                      : selectedTask.source_id
                          === 'google-keyword-planner'
                        ? (
                          <div
                            className="rr-file-input"
                          >
                            <p>
                              Enter one explicit group per line: group-id | Group name | keyword one, keyword two
                            </p>

                            <label>
                              <span>
                                Keyword groups
                              </span>

                              <textarea
                                aria-label="Keyword groups"
                                rows={6}
                                value={
                                  keywordPlannerGroupsInput
                                }
                                onChange={
                                  (event) =>
                                    setKeywordPlannerGroupsInput(
                                      event.target.value,
                                    )
                                }
                              />
                            </label>
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

                    <p>
                      Run history for this task will appear here from persisted Core state.
                    </p>
                  </section>
                </div>

                <div
                  className="rr-task-detail-actions"
                >
                  {!canReview && (
                    <p>
                      {effectiveReadiness !== 'READY'
                        ? 'Resolve the current readiness requirement before reviewing a Quick Run.'
                        : 'Complete the task-specific Quick Run configuration before Review.'}
                    </p>
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

                <p>
                  {activeRunState.run.run_id}
                </p>

                <p>
                  Run Status: {activeRunState.run.run_status}
                </p>

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
                      >
                        <strong>
                          {job.job_key}
                        </strong>

                        <p>
                          {job.source_id}
                        </p>

                        <p>
                          {job.execution_status}
                        </p>

                        <p>
                          {job.validation_status}
                        </p>

                        <p>
                          Attempts: {job.attempt_count}
                        </p>
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
                    <div>
                      {runHistory.map(
                        (run) => (
                          <article
                            key={run.run_id}
                          >
                            <button
                              type="button"
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
                              {run.run_id}
                            </button>

                            <p>
                              {run.run_status}
                            </p>

                            <p>
                              {run.created_at}
                            </p>

                            <p>
                              Sources: {run.selected_sources.length}
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

                <div
                  className="rr-two-column"
                >
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
                  >
                    <span
                      className="rr-kicker"
                    >
                      NEW PRESET
                    </span>

                    <label
                      className="rr-field"
                    >
                      <span>
                        Preset name
                      </span>

                      <input
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

                    <button
                      type="button"
                      disabled={
                        busy
                        || !workspaceId
                        || !newPresetName
                          .trim()
                      }
                      onClick={
                        () =>
                          void createPreset()
                      }
                    >
                      Create Preset
                    </button>
                  </section>
                </div>
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
              </section>
            )}
        </div>
      </section>
    </main>
  );
}
