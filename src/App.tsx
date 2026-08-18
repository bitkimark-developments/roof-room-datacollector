import { useEffect, useMemo, useState } from 'react';

import type { ApplicationInfo } from './shared/application-info';
import type { BootstrapStatus } from './shared/bootstrap-status';

interface AppState {
  applicationInfo: ApplicationInfo;
  bootstrapStatus: BootstrapStatus;
}

export function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [ipcError, setIpcError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      window.roofroom.getApplicationInfo(),
      window.roofroom.getBootstrapStatus(),
    ])
      .then(([applicationInfo, bootstrapStatus]) => {
        if (active) {
          setAppState({
            applicationInfo,
            bootstrapStatus,
          });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setIpcError(
          error instanceof Error ? error.message : 'Unknown IPC error',
        );
      });

    return () => {
      active = false;
    };
  }, []);

  const queryCount = useMemo(() => {
    if (
      !appState ||
      appState.bootstrapStatus.query_config.status !== 'READY'
    ) {
      return 0;
    }

    return appState.bootstrapStatus.query_config.config.groups.reduce(
      (total, group) => total + group.queries.length,
      0,
    );
  }, [appState]);

  const ipcStatus = ipcError
    ? 'ERROR'
    : appState
      ? 'READY'
      : 'LOADING';

  const queryConfigStatus =
    appState?.bootstrapStatus.query_config.status ?? 'LOADING';

  const firstGroup =
    appState?.bootstrapStatus.query_config.status === 'READY'
      ? appState.bootstrapStatus.query_config.config.groups[0]
      : null;

  return (
    <main className="app-shell">
      <section className="status-card">
        <p className="eyebrow">M1 · Application Skeleton</p>

        <h1>RoofRoom Data Collector</h1>

        <p className="description">
          Local-first data collection, validation, provenance, and export.
        </p>

        <div className="status-row">
          <span>React renderer</span>
          <strong>READY</strong>
        </div>

        <div className="status-row">
          <span>Typed IPC bridge</span>
          <strong>{ipcStatus}</strong>
        </div>

        <div className="status-row">
          <span>Application directories</span>
          <strong>{appState ? 'READY' : 'LOADING'}</strong>
        </div>

        <div className="status-row">
          <span>YAML QueryConfig</span>
          <strong>{queryConfigStatus}</strong>
        </div>

        {appState && (
          <dl className="application-info">
            <div>
              <dt>Application</dt>
              <dd>
                {appState.applicationInfo.name}{' '}
                {appState.applicationInfo.version}
              </dd>
            </div>

            <div>
              <dt>Runtime</dt>
              <dd>
                Electron {appState.applicationInfo.electronVersion}
              </dd>
            </div>

            <div>
              <dt>Platform</dt>
              <dd>
                {appState.applicationInfo.platform} /{' '}
                {appState.applicationInfo.architecture}
              </dd>
            </div>

            <div>
              <dt>App data</dt>
              <dd>
                {appState.bootstrapStatus.directories.app_data_root}
              </dd>
            </div>
          </dl>
        )}

        {appState?.bootstrapStatus.query_config.status ===
          'READY' && (
          <dl className="application-info">
            <div>
              <dt>Config source</dt>
              <dd>
                {
                  appState.bootstrapStatus.query_config.config
                    .source_id
                }
              </dd>
            </div>

            <div>
              <dt>Config version</dt>
              <dd>
                {
                  appState.bootstrapStatus.query_config.config
                    .config_version
                }
              </dd>
            </div>

            <div>
              <dt>Query groups</dt>
              <dd>
                {
                  appState.bootstrapStatus.query_config.config.groups
                    .length
                }
              </dd>
            </div>

            <div>
              <dt>Queries</dt>
              <dd>{queryCount}</dd>
            </div>

            {firstGroup && (
              <div>
                <dt>Order proof</dt>
                <dd>
                  {firstGroup.query_group_id}: {' '}
                  {firstGroup.queries.join(' → ')}
                </dd>
              </div>
            )}
          </dl>
        )}

        {appState?.bootstrapStatus.query_config.status ===
          'ERROR' && (
          <p className="error-message">
            QueryConfig error:{' '}
            {appState.bootstrapStatus.query_config.error}
          </p>
        )}

        {ipcError && (
          <p className="error-message">
            IPC error: {ipcError}
          </p>
        )}
      </section>
    </main>
  );
}
