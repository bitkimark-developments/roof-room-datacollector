import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type {
  ApplicationInfo,
} from './shared/application-info';
import type {
  BootstrapStatus,
} from './shared/bootstrap-status';
import type {
  DesktopCollectionJobSummary,
  DesktopCollectionState,
} from './shared/collection-control';
import {
  deriveGoogleTrendsRequestedDateRange,
  GOOGLE_TRENDS_PERIOD_PRESETS,
  type GoogleTrendsPeriodPreset,
} from './shared/google-trends-period';

interface AppState {
  applicationInfo:
    ApplicationInfo;
  bootstrapStatus:
    BootstrapStatus;
}

type PendingAction =
  | 'START'
  | 'RESUME'
  | 'RETRY'
  | 'CANCEL'
  | 'OPEN_FOLDER'
  | 'OPEN_CONFIG'
  | null;

const ACTIVE_PHASES =
  new Set([
    'RUNNING',
    'EXPORTING',
    'CANCELLING',
  ]);

const GOOGLE_TRENDS_PERIOD_LABELS:
  Record<
    GoogleTrendsPeriodPreset,
    string
  > = {
    '1W':
      '1 Hafta',
    '1M':
      '1 Ay',
    '6M':
      '6 Ay',
    '12M':
      '12 Ay',
    '24M':
      '24 Ay',
    '36M':
      '36 Ay',
  };

const formatLocalCalendarDate = (
  value: Date,
): string => {
  const year =
    value.getFullYear();
  const month =
    String(
      value.getMonth() + 1,
    ).padStart(
      2,
      '0',
    );
  const day =
    String(
      value.getDate(),
    ).padStart(
      2,
      '0',
    );

  return `${year}-${month}-${day}`;
};

const getLastCompleteLocalDate =
  (): string => {
    const now =
      new Date();

    const lastCompleteDay =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1,
      );

    return formatLocalCalendarDate(
      lastCompleteDay,
    );
  };

const phaseLabel = (
  phase:
    DesktopCollectionState['phase'],
): string => {
  switch (phase) {
    case 'IDLE':
      return 'Hazır';
    case 'RUNNING':
      return 'Toplanıyor';
    case 'EXPORTING':
      return 'Çıktı hazırlanıyor';
    case 'CANCELLING':
      return 'İptal ediliyor';
    case 'COMPLETED':
      return 'Tamamlandı';
    case 'COMPLETED_WITH_WARNINGS':
      return 'Uyarıyla tamamlandı';
    case 'FAILED':
      return 'Durduruldu';
    case 'EXPORT_FAILED':
      return 'Çıktı hatası';
    case 'MANUAL_ACTION_REQUIRED':
      return 'Manuel işlem gerekli';
    case 'CANCELLED':
      return 'İptal edildi';
  }
};

const jobTone = (
  job:
    DesktopCollectionJobSummary,
): string => {
  if (
    job.validation_status ===
      'LOW_DATA' ||
    job.validation_status ===
      'NO_DATA'
  ) {
    return 'warning';
  }

  if (
    job.execution_status ===
      'MANUAL_ACTION_REQUIRED'
  ) {
    return 'manual';
  }

  if (
    job.execution_status ===
      'COMPLETED' &&
    job.validation_status ===
      'VALID'
  ) {
    return 'success';
  }

  if (
    job.execution_status ===
      'FAILED' ||
    job.artifact_state ===
      'REJECTED'
  ) {
    return 'danger';
  }

  return 'neutral';
};

const compactRunId = (
  value: string | null,
): string => {
  if (value === null) {
    return 'Henüz yok';
  }

  if (value.length <= 28) {
    return value;
  }

  return `${value.slice(0, 20)}…${value.slice(-6)}`;
};

export function App() {
  const [appState, setAppState] =
    useState<AppState | null>(
      null,
    );
  const [collection, setCollection] =
    useState<DesktopCollectionState | null>(
      null,
    );
  const [pendingAction, setPendingAction] =
    useState<PendingAction>(
      null,
    );
  const [errorMessage, setErrorMessage] =
    useState<string | null>(
      null,
    );
  const [selectedGroupIds, setSelectedGroupIds] =
    useState<string[]>(
      [],
    );
  const [periodPreset, setPeriodPreset] =
    useState<GoogleTrendsPeriodPreset>(
      '24M',
    );
  const [referenceDate, setReferenceDate] =
    useState<string>(
      () =>
        getLastCompleteLocalDate(),
    );

  const refreshCollection =
    useCallback(async (): Promise<void> => {
      const next =
        await window.roofroom
          .getCollectionState();
      setCollection(next);
    }, []);

  useEffect(() => {
    let active =
      true;

    Promise.all([
      window.roofroom
        .getApplicationInfo(),
      window.roofroom
        .getBootstrapStatus(),
      window.roofroom
        .getCollectionState(),
    ])
      .then(([
        applicationInfo,
        bootstrapStatus,
        collectionState,
      ]) => {
        if (!active) {
          return;
        }

        setAppState({
          applicationInfo,
          bootstrapStatus,
        });
        setCollection(
          collectionState,
        );

        if (
          bootstrapStatus
            .query_config.status ===
          'READY'
        ) {
          setSelectedGroupIds(
            bootstrapStatus
              .query_config.config
              .groups.map(
                (group) =>
                  group.query_group_id,
              ),
          );
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Uygulama başlatma durumu okunamadı.',
          );
        }
      });

    return () => {
      active =
        false;
    };
  }, []);

  useEffect(() => {
    if (collection === null) {
      return;
    }

    let active =
      true;
    let timeoutId:
      ReturnType<typeof setTimeout>;

    const poll =
      async (): Promise<void> => {
        try {
          await refreshCollection();
        } catch (error: unknown) {
          if (active) {
            setErrorMessage(
              error instanceof Error
                ? error.message
                : 'Toplama durumu yenilenemedi.',
            );
          }
        } finally {
          if (active) {
            timeoutId =
              setTimeout(
                poll,
                1000,
              );
          }
        }
      };

    timeoutId =
      setTimeout(
        poll,
        1000,
      );

    return () => {
      active =
        false;
      clearTimeout(
        timeoutId,
      );
    };
  }, [
    collection !== null,
    refreshCollection,
  ]);

  const runAction =
    async (
      action: Exclude<
        PendingAction,
        null
      >,
      operation: () =>
        Promise<DesktopCollectionState | void>,
    ): Promise<void> => {
      setPendingAction(
        action,
      );
      setErrorMessage(
        null,
      );

      try {
        const next =
          await operation();

        if (next) {
          setCollection(next);
        }
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'İşlem tamamlanamadı.',
        );
      } finally {
        setPendingAction(
          null,
        );
      }
    };

  const config =
    appState?.bootstrapStatus
      .query_config.status === 'READY'
      ? appState.bootstrapStatus
          .query_config.config
      : null;

  const queryCount =
    useMemo(
      () =>
        config?.groups
          .filter(
            (group) =>
              selectedGroupIds.includes(
                group.query_group_id,
              ),
          )
          .reduce(
            (total, group) =>
              total +
              group.queries.length,
            0,
          ) ?? 0,
      [
        config,
        selectedGroupIds,
      ],
    );

  const requestedDateRange =
    useMemo(
      () => {
        try {
          return deriveGoogleTrendsRequestedDateRange({
            period_preset:
              periodPreset,
            reference_date:
              referenceDate,
          });
        } catch {
          return null;
        }
      },
      [
        periodPreset,
        referenceDate,
      ],
    );

  const isActive =
    collection !== null &&
    ACTIVE_PHASES.has(
      collection.phase,
    );
  const completedGroups =
    collection === null
      ? 0
      : Math.max(
          collection.groups_collected,
          collection.jobs.filter(
            (job) =>
              job.execution_status ===
              'COMPLETED',
          ).length,
        );
  const progress =
    collection === null ||
    collection.total_groups === 0
      ? 0
      : Math.round(
          (completedGroups /
            collection.total_groups) *
            100,
        );
  const bootstrapReady =
    appState?.bootstrapStatus
        .query_config.status ===
      'READY' &&
    appState.bootstrapStatus
        .database.status ===
      'READY';

  const toggleGroup = (
    groupId: string,
  ): void => {
    setSelectedGroupIds(
      (current) =>
        current.includes(
          groupId,
        )
          ? current.filter(
              (candidate) =>
                candidate !==
                groupId,
            )
          : [
              ...current,
              groupId,
            ],
    );
  };

  if (
    appState === null ||
    collection === null
  ) {
    return (
      <main className="loading-shell">
        <div className="loader" />
        <p>
          RoofRoom hazırlanıyor…
        </p>
        {errorMessage && (
          <p
            className="inline-alert danger"
            role="alert"
          >
            {errorMessage}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          RR
        </div>
        <div className="brand-copy">
          <strong>
            RoofRoom Data Collector
          </strong>
          <span>
            Google Trends · Interest Over Time
          </span>
        </div>
        <div
          className={`phase-pill phase-${collection.phase.toLowerCase()}`}
          aria-live="polite"
        >
          <span />
          {phaseLabel(
            collection.phase,
          )}
        </div>
      </header>

      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">
            GOOGLE TRENDS MVP
          </p>
          <h1>
            Güvenilir veriyi topla,
            doğrula ve kanıtıyla sakla.
          </h1>
          <p className="hero-description">
            Yapılandırılmış sorgu kümeleri sırayla işlenir. Her ham CSV,
            doğrulama sonucu ve kaynak bilgisi uygulamaya ait çalışma
            klasöründe korunur.
          </p>
        </div>

        <div className="configuration-card">
          <div>
            <span>Ülke</span>
            <strong>Türkiye</strong>
          </div>
          <div>
            <span>Tarih aralığı</span>
            <strong>
              {requestedDateRange ===
              null
                ? 'Geçerli tarih seçin'
                : `${requestedDateRange.requested_date_start} — ${requestedDateRange.requested_date_end}`}
            </strong>
          </div>
          <div>
            <span>Arama türü</span>
            <strong>Web Search</strong>
          </div>
          <div>
            <span>Kategori</span>
            <strong>All Categories</strong>
          </div>
        </div>
      </section>

      {errorMessage && (
        <div
          className="inline-alert danger"
          role="alert"
        >
          <strong>İşlem tamamlanamadı</strong>
          <span>{errorMessage}</span>
          <button
            type="button"
            className="alert-close"
            onClick={() =>
              setErrorMessage(null)
            }
            aria-label="Hata mesajını kapat"
          >
            ×
          </button>
        </div>
      )}

      {collection.phase ===
        'MANUAL_ACTION_REQUIRED' && (
        <div
          className="inline-alert manual"
          role="status"
        >
          <strong>
            Google penceresinde işlem gerekli
          </strong>
          <span>
            Açık sağlayıcı penceresindeki güvenlik veya oturum adımını
            kendiniz tamamlayın. Uygulama CAPTCHA, 2FA veya hız sınırını
            aşmaya çalışmaz.
          </span>
        </div>
      )}

      {collection.export.status ===
        'COMPLETED' && (
        <div
          className="inline-alert success"
          role="status"
        >
          <strong>
            Veri paketi hazır
          </strong>
          <span>
            {collection.export
              .normalized_row_count}{' '}
            normalize satır ile CSV paketi ve XLSX çalışma kitabı
            uygulama çalışma klasöründe oluşturuldu.
          </span>
        </div>
      )}

      {collection.export.status ===
        'FAILED' && (
        <div
          className="inline-alert danger"
          role="alert"
        >
          <strong>
            Yapılandırılmış çıktı oluşturulamadı
          </strong>
          <span>
            Kabul edilmiş ham kanıt korunuyor.{' '}
            {collection.export.error}
          </span>
        </div>
      )}

      <section className="dashboard-grid">
        <article className="panel run-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                AKTİF ÇALIŞMA
              </p>
              <h2>
                Toplama kontrolü
              </h2>
            </div>
            <span className="run-id">
              {compactRunId(
                collection.run_id ??
                  collection.recovery
                    .run_id,
              )}
            </span>
          </div>

          <div className="period-controls">
            <div className="period-preset-field">
              <span className="period-control-label">
                Dönem
              </span>
              <div
                className="period-preset-options"
                role="group"
                aria-label="Dönem"
              >
                {GOOGLE_TRENDS_PERIOD_PRESETS.map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="period-preset-button"
                      aria-pressed={
                        periodPreset ===
                        preset
                      }
                      disabled={
                        isActive ||
                        pendingAction !==
                          null
                      }
                      onClick={() =>
                        setPeriodPreset(
                          preset,
                        )
                      }
                    >
                      {
                        GOOGLE_TRENDS_PERIOD_LABELS[
                          preset
                        ]
                      }
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="period-details">
              <label className="period-reference">
                <span>
                  Bitiş / Referans Tarihi
                </span>
                <input
                  type="date"
                  value={referenceDate}
                  disabled={
                    isActive ||
                    pendingAction !==
                      null
                  }
                  onChange={(event) =>
                    setReferenceDate(
                      event.target.value,
                    )
                  }
                />
              </label>

              <div className="period-preview">
                <span>
                  Kesin tarih aralığı
                </span>
                <strong
                  data-testid="period-range-preview"
                >
                  {requestedDateRange ===
                  null
                    ? 'Geçerli tarih seçin'
                    : `${requestedDateRange.requested_date_start} — ${requestedDateRange.requested_date_end}`}
                </strong>
              </div>
            </div>
          </div>

          <div className="progress-copy">
            <strong>
              {completedGroups} /{' '}
              {collection.total_groups}{' '}
              küme tamamlandı
            </strong>
            <span>
              {collection.current_group_id
                ? `${collection.current_group_id} işleniyor`
                : collection.message ??
                  'Yeni bir çalışma başlatmaya hazır.'}
            </span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Toplama ilerlemesi"
          >
            <span
              style={{
                width: `${progress}%`,
              }}
            />
          </div>

          <div className="primary-actions">
            <button
              type="button"
              className="primary-button"
              disabled={
                !bootstrapReady ||
                selectedGroupIds.length ===
                  0 ||
                requestedDateRange ===
                  null ||
                isActive ||
                pendingAction !== null
              }
              onClick={() =>
                void runAction(
                  'START',
                  () =>
                    window.roofroom
                      .startCollection({
                        query_group_ids:
                          selectedGroupIds,
                        period: {
                          period_preset:
                            periodPreset,
                          reference_date:
                            referenceDate,
                        },
                      }),
                )
              }
            >
              {pendingAction === 'START'
                ? 'Başlatılıyor…'
                : 'Toplamayı Başlat'}
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={
                !isActive ||
                collection.phase ===
                  'CANCELLING' ||
                pendingAction !== null
              }
              onClick={() =>
                void runAction(
                  'CANCEL',
                  () =>
                    window.roofroom
                      .cancelCollection(),
                )
              }
            >
              {pendingAction === 'CANCEL'
                ? 'İptal ediliyor…'
                : 'İptal Et'}
            </button>
          </div>

          <div className="secondary-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={
                !collection.recovery
                  .can_resume ||
                isActive ||
                pendingAction !== null
              }
              onClick={() =>
                void runAction(
                  'RESUME',
                  () =>
                    window.roofroom
                      .resumeCollection(),
                )
              }
            >
              Önceki Çalışmaya Devam Et
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={
                !collection.recovery
                  .can_retry ||
                isActive ||
                pendingAction !== null
              }
              onClick={() =>
                void runAction(
                  'RETRY',
                  () =>
                    window.roofroom
                      .retryFailedCollection(),
                )
              }
            >
              Başarısız İşi Yeniden Dene
            </button>
          </div>
        </article>

        <aside className="panel summary-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                YAPILANDIRMA
              </p>
              <h2>
                Sorgu havuzu
              </h2>
            </div>
          </div>
          <dl className="summary-list">
            <div>
              <dt>Küme</dt>
              <dd>
                {selectedGroupIds.length} /{' '}
                {config?.groups.length ?? 0}
              </dd>
            </div>
            <div>
              <dt>Keyword</dt>
              <dd>{queryCount}</dd>
            </div>
            <div>
              <dt>Kaynak durumu</dt>
              <dd>
                {bootstrapReady
                  ? 'HAZIR'
                  : 'HATA'}
              </dd>
            </div>
            <div>
              <dt>Uygulama</dt>
              <dd>
                v{appState.applicationInfo.version}
              </dd>
            </div>
            <div>
              <dt>Çıktı</dt>
              <dd>
                {collection.export.status}
              </dd>
            </div>
          </dl>
          <div className="group-selector">
            <div className="group-selector-heading">
              <span>Toplanacak kümeler</span>
              <button
                type="button"
                disabled={
                  isActive ||
                  config === null
                }
                onClick={() =>
                  setSelectedGroupIds(
                    selectedGroupIds.length ===
                      config?.groups.length
                      ? []
                      : config?.groups.map(
                          (group) =>
                            group.query_group_id,
                        ) ?? [],
                  )
                }
              >
                {selectedGroupIds.length ===
                config?.groups.length
                  ? 'Tümünü kaldır'
                  : 'Tümünü seç'}
              </button>
            </div>
            <div className="group-options">
              {config?.groups.map(
                (group) => (
                  <label
                    key={group.query_group_id}
                  >
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.includes(
                        group.query_group_id,
                      )}
                      disabled={isActive}
                      onChange={() =>
                        toggleGroup(
                          group.query_group_id,
                        )
                      }
                    />
                    <span>
                      <strong>
                        {group.query_group_id}
                      </strong>
                      <small>
                        {group.query_group_name}{' '}
                        · {group.queries.length} keyword
                      </small>
                      <span className="query-terms">
                        {group.queries.join(' · ')}
                      </span>
                    </span>
                  </label>
                ),
              )}
            </div>
          </div>
          <div className="folder-actions">
            <button
              type="button"
              className="folder-button output-button"
              disabled={
                pendingAction !== null
              }
              onClick={() =>
                void runAction(
                  'OPEN_FOLDER',
                  () =>
                    window.roofroom
                      .openLatestExport(),
                )
              }
            >
              Son Veri Paketini Aç
            </button>
            <button
              type="button"
              className="folder-button"
              disabled={
                pendingAction !== null
              }
              onClick={() =>
                void runAction(
                  'OPEN_FOLDER',
                  () =>
                    window.roofroom
                      .openDataFolder(),
                )
              }
            >
              Teknik Çalışma Arşivini Aç
            </button>
            <button
              type="button"
              className="folder-button"
              disabled={
                pendingAction !== null ||
                isActive
              }
              onClick={() =>
                void runAction(
                  'OPEN_CONFIG',
                  () =>
                    window.roofroom
                      .openConfigFolder(),
                )
              }
            >
              Keyword Dosyasını Düzenle
            </button>
          </div>
          <p className="storage-note">
            Son veri paketi düğmesi en yeni XLSX dosyasını Finder’da
            seçer. rr_ ile başlayan klasörler değiştirilmeyen teknik
            çalışma kimlikleridir. Keyword dosyasındaki değişiklikler
            uygulama yeniden açıldığında yüklenir.
          </p>
        </aside>
      </section>

      <section className="panel jobs-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">
              SONUÇLAR
            </p>
            <h2>
              Sorgu kümeleri
            </h2>
          </div>
          <span className="result-count">
            {collection.jobs.length}{' '}
            kayıt
          </span>
        </div>

        {collection.jobs.length === 0 ? (
          <div className="empty-state">
            <div>01</div>
            <h3>
              Henüz toplama sonucu yok
            </h3>
            <p>
              Başlatıldığında kümeler sırayla toplanacak; her biri kendi
              doğrulama ve artifact durumuyla burada görünecek.
            </p>
          </div>
        ) : (
          <div className="job-grid">
            {collection.jobs.map(
              (job) => (
                <article
                  className={`job-card ${jobTone(job)}`}
                  key={job.query_group_id}
                >
                  <div className="job-card-heading">
                    <strong>
                      {job.query_group_id}
                    </strong>
                    <span>
                      {job.validation_status}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>İşlem</dt>
                      <dd>
                        {job.execution_status}
                      </dd>
                    </div>
                    <div>
                      <dt>Artifact</dt>
                      <dd>
                        {job.artifact_state ??
                          'YOK'}
                      </dd>
                    </div>
                    <div>
                      <dt>Deneme</dt>
                      <dd>
                        {job.attempt_number ??
                          '—'}
                      </dd>
                    </div>
                  </dl>
                  {job.error_code && (
                    <p className="job-error">
                      {job.error_code}
                    </p>
                  )}
                </article>
              ),
            )}
          </div>
        )}
      </section>

      <footer>
        <span>
          Yerel öncelikli · Kanıt korumalı · Modüler kaynak mimarisi
        </span>
        <span>
          {appState.applicationInfo.platform} /{' '}
          {appState.applicationInfo.architecture}
        </span>
      </footer>
    </main>
  );
}
