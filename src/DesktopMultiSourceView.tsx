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

export function DesktopMultiSourceView() {
  const [
    view,
    setView,
  ] =
    useState<View>(
      'HOME',
    );

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
                          () =>
                            setView(
                              'TASKS',
                            )
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
                  () =>
                    setView(
                      item,
                    )
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

          {view ===
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

          {view ===
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

          {view ===
            'RUNS'
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

                <p>
                  Dedicated Run list and Run Detail are the next slice.
                </p>
              </section>
            )}

          {view ===
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

          {view ===
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
