import { useEffect, useState } from 'react';

import type { ApplicationInfo } from './shared/application-info';

export function App() {
  const [applicationInfo, setApplicationInfo] =
    useState<ApplicationInfo | null>(null);

  const [ipcError, setIpcError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    window.roofroom
      .getApplicationInfo()
      .then((info) => {
        if (active) {
          setApplicationInfo(info);
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

  const ipcStatus = ipcError
    ? 'ERROR'
    : applicationInfo
      ? 'READY'
      : 'LOADING';

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

        {applicationInfo && (
          <dl className="application-info">
            <div>
              <dt>Application</dt>
              <dd>
                {applicationInfo.name} {applicationInfo.version}
              </dd>
            </div>

            <div>
              <dt>Runtime</dt>
              <dd>
                Electron {applicationInfo.electronVersion}
              </dd>
            </div>

            <div>
              <dt>Platform</dt>
              <dd>
                {applicationInfo.platform} /{' '}
                {applicationInfo.architecture}
              </dd>
            </div>
          </dl>
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
