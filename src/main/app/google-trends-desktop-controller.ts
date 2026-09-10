import type {
  SourceCollectionContext,
  SourceCollectionResult,
} from '../../shared/collection';
import type {
  DesktopCollectionOperation,
  DesktopCollectionPhase,
  DesktopCollectionState,
  DesktopExportState,
  DesktopRecoveryState,
} from '../../shared/collection-control';
import {
  normalizeGoogleTrendsPeriodSelection,
  type GoogleTrendsPeriodSelection,
} from '../../shared/google-trends-period';
import type {
  GoogleTrendsCoreBatchRunResult,
  GoogleTrendsCoreRunHooks,
} from '../sources/google-trends/google-trends-core-runner';

const EMPTY_RECOVERY:
  DesktopRecoveryState = {
    run_id:
      null,
    can_resume:
      false,
    can_retry:
      false,
    manual_action_required:
      false,
  };

const EMPTY_EXPORT:
  DesktopExportState = {
    status:
      'NOT_RUN',
    export_directory:
      null,
    workbook_path:
      null,
    normalized_row_count:
      null,
    error:
      null,
  };

export interface GoogleTrendsDesktopControllerDependencies {
  total_groups: number;
  query_group_ids:
    readonly string[];
  start_batch: (
    queryGroupIds:
      readonly string[],
    periodSelection:
      GoogleTrendsPeriodSelection,
    hooks:
      GoogleTrendsCoreRunHooks,
  ) =>
    Promise<GoogleTrendsCoreBatchRunResult>;
  resume_run: (
    runId: string,
    retryFailed: boolean,
    hooks:
      GoogleTrendsCoreRunHooks,
  ) =>
    Promise<GoogleTrendsCoreBatchRunResult>;
  discover_recovery: () =>
    DesktopRecoveryState;
  cancel_run: (
    runId: string,
  ) => Promise<void>;
  close_browser: () =>
    Promise<void>;
  export_run: (
    runId: string,
  ) => Promise<{
    export_directory: string;
    workbook_path: string;
    normalized_row_count:
      number;
  }>;
  now?: () => Date;
}

const phaseFromRun = (
  result:
    GoogleTrendsCoreBatchRunResult,
): DesktopCollectionPhase => {
  switch (
    result.run.run_status
  ) {
    case 'COMPLETED':
      return 'COMPLETED';
    case 'COMPLETED_WITH_WARNINGS':
      return 'COMPLETED_WITH_WARNINGS';
    case 'MANUAL_ACTION_REQUIRED':
      return 'MANUAL_ACTION_REQUIRED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'FAILED':
      return 'FAILED';
    case 'PENDING':
    case 'RUNNING':
    case 'RETRY_REQUIRED':
      return 'FAILED';
  }
};

const cloneRecovery = (
  recovery:
    DesktopRecoveryState,
): DesktopRecoveryState => ({
  ...recovery,
});

const cloneExport = (
  exportState:
    DesktopExportState,
): DesktopExportState => ({
  ...exportState,
});

const requireGoogleTrendsQueryGroupId = (
  job: {
    job_key: string;
    query_group_id: string | null;
  },
): string => {
  if (
    job.query_group_id === null ||
    job.query_group_id !== job.job_key
  ) {
    throw new Error(
      `Google Trends job ${job.job_key} has invalid query-group identity.`,
    );
  }

  return job.query_group_id;
};

export class GoogleTrendsDesktopController {
  private readonly now: () => Date;

  private state:
    DesktopCollectionState;

  private activeOperation:
    Promise<void> | null =
    null;

  private cancelRequested =
    false;

  private readonly startedGroups =
    new Set<string>();

  private readonly collectedGroups =
    new Set<string>();

  constructor(
    private readonly dependencies:
      GoogleTrendsDesktopControllerDependencies,
  ) {
    if (
      !Number.isSafeInteger(
        dependencies.total_groups,
      ) ||
      dependencies.total_groups < 1
    ) {
      throw new Error(
        'Desktop controller total_groups must be a positive integer.',
      );
    }

    if (
      dependencies
        .query_group_ids.length !==
        dependencies.total_groups ||
      new Set(
        dependencies
          .query_group_ids,
      ).size !==
        dependencies.total_groups
    ) {
      throw new Error(
        'Desktop controller query_group_ids must uniquely describe every configured group.',
      );
    }

    this.now =
      dependencies.now ??
      (() => new Date());

    this.state = {
      phase:
        'IDLE',
      operation:
        null,
      run_id:
        null,
      run_status:
        null,
      total_groups:
        dependencies.total_groups,
      groups_started:
        0,
      groups_collected:
        0,
      current_group_id:
        null,
      jobs: [],
      recovery:
        this.readRecovery(),
      export:
        cloneExport(
          EMPTY_EXPORT,
        ),
      message:
        null,
      updated_at:
        this.timestamp(),
    };
  }

  getState(): DesktopCollectionState {
    if (
      this.activeOperation ===
      null
    ) {
      this.state.recovery =
        this.readRecovery();
    }

    return {
      ...this.state,
      jobs:
        this.state.jobs.map(
          (job) => ({
            ...job,
          }),
        ),
      recovery:
        cloneRecovery(
          this.state.recovery,
        ),
      export:
        cloneExport(
          this.state.export,
        ),
    };
  }

  start(
    queryGroupIds:
      readonly string[],
    periodSelection:
      GoogleTrendsPeriodSelection,
  ): DesktopCollectionState {
    this.requireIdle();

    if (
      queryGroupIds.length < 1 ||
      new Set(
        queryGroupIds,
      ).size !==
        queryGroupIds.length ||
      !queryGroupIds.every(
        (groupId) =>
          typeof groupId ===
            'string' &&
          groupId.trim().length >
            0 &&
          this.dependencies
            .query_group_ids
            .includes(
              groupId,
            ),
      )
    ) {
      throw new Error(
        'A new collection requires one or more unique query group IDs.',
      );
    }

    const normalizedPeriodSelection =
      normalizeGoogleTrendsPeriodSelection(
        periodSelection,
      );

    return this.launch(
      'START',
      queryGroupIds.length,
      (hooks) =>
        this.dependencies
          .start_batch(
            queryGroupIds,
            normalizedPeriodSelection,
            hooks,
          ),
    );
  }

  resume(): DesktopCollectionState {
    this.requireIdle();

    const recovery =
      this.readRecovery();

    if (
      recovery.run_id === null ||
      !recovery.can_resume
    ) {
      throw new Error(
        'No incomplete Google Trends run is eligible for resume.',
      );
    }

    return this.launch(
      'RESUME',
      this.dependencies
        .total_groups,
      (hooks) =>
        this.dependencies
          .resume_run(
            recovery.run_id as string,
            false,
            hooks,
          ),
    );
  }

  retryFailed(): DesktopCollectionState {
    this.requireIdle();

    const recovery =
      this.readRecovery();

    if (
      recovery.run_id === null ||
      !recovery.can_retry
    ) {
      throw new Error(
        'No failed Google Trends job is eligible for explicit retry.',
      );
    }

    return this.launch(
      'RETRY',
      this.dependencies
        .total_groups,
      (hooks) =>
        this.dependencies
          .resume_run(
            recovery.run_id as string,
            true,
            hooks,
          ),
    );
  }

  async cancel(): Promise<DesktopCollectionState> {
    if (
      this.activeOperation ===
      null
    ) {
      return this.getState();
    }

    this.cancelRequested =
      true;
    this.patch({
      phase:
        'CANCELLING',
      message:
        'Aktif çalışma güvenli biçimde durduruluyor…',
    });

    if (this.state.run_id !== null) {
      await this.cancelPersistedRun(
        this.state.run_id,
      );
    }

    await this.dependencies
      .close_browser();

    return this.getState();
  }

  async waitForIdle(): Promise<void> {
    await this.activeOperation;
  }

  private launch(
    operation:
      DesktopCollectionOperation,
    totalGroups: number,
    execute: (
      hooks:
        GoogleTrendsCoreRunHooks,
    ) =>
      Promise<GoogleTrendsCoreBatchRunResult>,
  ): DesktopCollectionState {
    this.cancelRequested =
      false;
    this.startedGroups.clear();
    this.collectedGroups.clear();

    this.state = {
      phase:
        'RUNNING',
      operation,
      run_id:
        null,
      run_status:
        null,
      total_groups:
        totalGroups,
      groups_started:
        0,
      groups_collected:
        0,
      current_group_id:
        null,
      jobs: [],
      recovery:
        cloneRecovery(
          EMPTY_RECOVERY,
        ),
      export:
        cloneExport(
          EMPTY_EXPORT,
        ),
      message:
        operation === 'START'
          ? 'Yeni Google Trends çalışması başlatılıyor…'
          : operation === 'RESUME'
            ? 'Bekleyen işler sürdürülüyor…'
            : 'Başarısız iş açıkça yeniden deneniyor…',
      updated_at:
        this.timestamp(),
    };

    const promise =
      execute(
        this.createHooks(),
      )
        .then(
          async (result): Promise<void> => {
            this.applyResult(
              result,
            );

            if (
              result.run.run_status ===
                'COMPLETED' ||
              result.run.run_status ===
                'COMPLETED_WITH_WARNINGS'
            ) {
              const completedPhase =
                phaseFromRun(
                  result,
                );

              this.patch({
                phase:
                  'EXPORTING',
                export: {
                  status:
                    'RUNNING',
                  export_directory:
                    null,
                  workbook_path:
                    null,
                  normalized_row_count:
                    null,
                  error:
                    null,
                },
                message:
                  'Yapılandırılmış CSV/XLSX veri paketi oluşturuluyor…',
              });

              try {
                const exported =
                  await this.dependencies
                    .export_run(
                      result.run
                        .run_id,
                    );

                this.patch({
                  phase:
                    completedPhase,
                  export: {
                    status:
                      'COMPLETED',
                    export_directory:
                      exported.export_directory,
                    workbook_path:
                      exported.workbook_path,
                    normalized_row_count:
                      exported.normalized_row_count,
                    error:
                      null,
                  },
                  message:
                    'Toplama, doğrulama ve yapılandırılmış dışa aktarma tamamlandı.',
                });
              } catch (error: unknown) {
                this.patch({
                  phase:
                    'EXPORT_FAILED',
                  export: {
                    status:
                      'FAILED',
                    export_directory:
                      null,
                    workbook_path:
                      null,
                    normalized_row_count:
                      null,
                    error:
                      error instanceof Error
                        ? error.message
                        : 'Unknown structured export failure.',
                  },
                  message:
                    'Toplama kanıtı kabul edildi ancak yapılandırılmış dışa aktarma paketi oluşturulamadı.',
                });
              }
            }
          },
        )
        .catch(
          (error: unknown): void => {
            this.patch({
              phase:
                this.cancelRequested
                  ? 'CANCELLED'
                  : 'FAILED',
              current_group_id:
                null,
              message:
                this.cancelRequested
                  ? 'Aktif çalışma iptal edildi.'
                  : error instanceof Error
                    ? error.message
                    : 'Bilinmeyen masaüstü toplama hatası.',
            });
          },
        )
        .finally((): void => {
          this.activeOperation =
            null;
          this.state.recovery =
            this.readRecovery();
          this.state.updated_at =
            this.timestamp();
        });

    this.activeOperation =
      promise;

    return this.getState();
  }

  private createHooks(): GoogleTrendsCoreRunHooks {
    return {
      on_run_available:
        (run): void => {
          this.patch({
            run_id:
              run.run_id,
            run_status:
              run.run_status,
          });

          if (this.cancelRequested) {
            void this.cancelPersistedRun(
              run.run_id,
            );
          }
        },
      on_collection_started:
        (context): void => {
          this.observeStarted(
            context,
          );
        },
      on_collection_result:
        (context, result): void => {
          this.observeCollected(
            context,
            result,
          );
        },
    };
  }

  private observeStarted(
    context:
      SourceCollectionContext,
  ): void {
    this.startedGroups.add(
      context.job_key,
    );

    this.patch({
      current_group_id:
        context.job_key,
      groups_started:
        this.startedGroups.size,
      message:
        `${context.job_key} toplanıyor…`,
    });
  }

  private observeCollected(
    context:
      SourceCollectionContext,
    result:
      SourceCollectionResult,
  ): void {
    this.collectedGroups.add(
      context.job_key,
    );

    this.patch({
      groups_collected:
        this.collectedGroups.size,
      message:
        result.result_type ===
          'ARTIFACT_PRODUCED'
          ? `${context.job_key} doğrulanıyor…`
          : result.result_type ===
              'MANUAL_ACTION_REQUIRED'
            ? `${context.job_key} için sağlayıcı penceresinde manuel işlem gerekiyor.`
            : `${context.job_key} kabul edilmiş bir kanıt üretmedi.`,
    });
  }

  private applyResult(
    result:
      GoogleTrendsCoreBatchRunResult,
  ): void {
    const phase =
      phaseFromRun(
        result,
      );

    this.patch({
      phase,
      run_id:
        result.run.run_id,
      run_status:
        result.run.run_status,
      total_groups:
        result.jobs.length,
      groups_started:
        result.jobs.filter(
          (entry) =>
            entry.job
              .attempt_count > 0,
        ).length,
      groups_collected:
        result.jobs.filter(
          (entry) =>
            entry.job
              .execution_status ===
            'COMPLETED',
        ).length,
      current_group_id:
        null,
      jobs:
        result.jobs.map(
          (entry) => ({
            query_group_id:
              requireGoogleTrendsQueryGroupId(
                entry.job,
              ),
            execution_status:
              entry.job
                .execution_status,
            validation_status:
              entry.job
                .validation_status,
            attempt_number:
              entry.attempt
                ?.attempt_number ??
              null,
            artifact_state:
              entry.artifact
                ?.artifact_state ??
              null,
            error_code:
              entry.attempt
                ?.error_code ??
              null,
          }),
        ),
      message:
        phase === 'COMPLETED'
          ? 'Seçilen tüm kümeler kabul edilmiş doğrulamayla tamamlandı.'
          : phase ===
              'COMPLETED_WITH_WARNINGS'
            ? 'Çalışma doğrulama uyarılarıyla tamamlandı.'
            : phase ===
                'MANUAL_ACTION_REQUIRED'
              ? 'Google, sağlayıcı penceresinde manuel işlem gerektiriyor.'
              : phase === 'CANCELLED'
                ? 'Çalışma iptal edildi.'
                : 'Çalışma tüm kümeler kabul edilmeden durdu.',
    });
  }

  private async cancelPersistedRun(
    runId: string,
  ): Promise<void> {
    try {
      await this.dependencies
        .cancel_run(
          runId,
        );
    } catch {
      // The run may have crossed a terminal boundary before cancellation.
    }
  }

  private requireIdle(): void {
    if (
      this.activeOperation !==
      null
    ) {
      throw new Error(
        'A Google Trends desktop collection operation is already active.',
      );
    }
  }

  private readRecovery(): DesktopRecoveryState {
    try {
      return cloneRecovery(
        this.dependencies
          .discover_recovery(),
      );
    } catch {
      return cloneRecovery(
        EMPTY_RECOVERY,
      );
    }
  }

  private patch(
    patch:
      Partial<DesktopCollectionState>,
  ): void {
    this.state = {
      ...this.state,
      ...patch,
      updated_at:
        this.timestamp(),
    };
  }

  private timestamp(): string {
    return this.now()
      .toISOString();
  }
}
