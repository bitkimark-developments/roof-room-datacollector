import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
} from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { ensureApplicationDirectories } from './main/app/application-directories';
import {
  createGoogleTrendsDesktopController,
} from './main/app/google-trends-desktop-controller-factory';
import type {
  GoogleTrendsDesktopController,
} from './main/app/google-trends-desktop-controller';
import {
  findLatestExportWorkbook,
} from './main/app/application-file-access';
import {
  ensureExternalQueryConfig,
  loadQueryConfig,
} from './main/config/query-config-loader';
import { SourceRegistry } from './main/core/source-registry';
import {
  createGoogleTrendsRuntime,
  type GoogleTrendsRuntime,
} from './main/sources/google-trends/google-trends-runtime';
import {
  initializeDatabase,
  MIGRATION_COMPATIBILITY_WORKSPACE_ID,
  getDatabasePath,
} from './main/storage/database';
import { StateRepository } from './main/storage/state-repository';
import { ElectronSafeStorageCredentialStore } from './main/core/electron-safe-storage-credential-store';
import { ReadinessRegistry } from './main/core/readiness-registry';
import { DesktopExecutionService } from './main/app/desktop-execution-service';
import { createProductionCollectionRuntime } from './main/app/production-collection-runtime';
import { StructuredLogger } from './main/logging/structured-logger';
import { DesktopMultiSourceController } from './main/app/desktop-multisource-controller';
import { SUPPORTED_DESKTOP_SOURCE_IDS } from './shared/desktop-multisource';
import {
  IPC_CHANNELS,
  type ApplicationInfo,
  type DesktopInputFileSelectionResult,
} from './shared/application-info';
import type {
  BootstrapStatus,
  QueryConfigLoadStatus,
} from './shared/bootstrap-status';
import {
  normalizeGoogleTrendsCollectionStartRequest,
} from './shared/google-trends-period';
import { isDesktopRunDraft, type DesktopRunDraft } from './shared/desktop-multisource';
import type { RunDraftOrigin } from './shared/collection-configuration';

if (started) {
  app.quit();
}

let googleTrendsRuntime:
  GoogleTrendsRuntime | null =
  null;

let googleTrendsController:
  GoogleTrendsDesktopController | null =
  null;

let googleTrendsShutdownPromise:
  Promise<void> | null =
    null;

let desktopMultiSourceController: DesktopMultiSourceController | null = null;
let desktopRepository: StateRepository | null = null;
let desktopExecutionService: DesktopExecutionService | null = null;

const isTrustedIpcSender = (event: IpcMainInvokeEvent): boolean => {
  const frame = event.senderFrame;

  if (!frame) {
    return false;
  }

  try {
    const senderUrl = new URL(frame.url);
    const mainDocumentUrl = new URL(event.sender.getURL());

    if (senderUrl.href !== mainDocumentUrl.href) {
      return false;
    }

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      const developmentOrigin = new URL(
        MAIN_WINDOW_VITE_DEV_SERVER_URL,
      ).origin;

      return senderUrl.origin === developmentOrigin;
    }

    return senderUrl.protocol === 'file:';
  } catch {
    return false;
  }
};

const assertTrustedIpcSender = (
  event: IpcMainInvokeEvent,
): void => {
  if (!isTrustedIpcSender(event)) {
    throw new Error(
      'Rejected IPC request from an untrusted sender.',
    );
  }
};

const registerIpcHandlers = (
  bootstrapStatus: BootstrapStatus,
  controller:
    GoogleTrendsDesktopController | null,
  desktopController: DesktopMultiSourceController | null = desktopMultiSourceController,
): void => {
  const requireController =
    (): GoogleTrendsDesktopController => {
      if (controller === null) {
        throw new Error(
          'Google Trends collection is unavailable because application bootstrap is not ready.',
        );
      }

      return controller;
    };

  ipcMain.handle(
    IPC_CHANNELS.GET_APPLICATION_INFO,
    (event): ApplicationInfo => {
      assertTrustedIpcSender(event);

      return {
        name: app.getName(),
        version: app.getVersion(),
        platform: process.platform,
        architecture: process.arch,
        electronVersion: process.versions.electron,
      };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_BOOTSTRAP_STATUS,
    (event): BootstrapStatus => {
      assertTrustedIpcSender(event);
      return bootstrapStatus;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_COLLECTION_STATE,
    (event) => {
      assertTrustedIpcSender(
        event,
      );

      return requireController()
        .getState();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.START_COLLECTION,
    (
      event,
      request:
        unknown,
    ) => {
      assertTrustedIpcSender(
        event,
      );

      const normalizedRequest =
        normalizeGoogleTrendsCollectionStartRequest(
          request,
        );

      return requireController()
        .start(
          normalizedRequest
            .query_group_ids,
          normalizedRequest
            .period,
        );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RESUME_COLLECTION,
    (event) => {
      assertTrustedIpcSender(
        event,
      );

      return requireController()
        .resume();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RETRY_FAILED_COLLECTION,
    (event) => {
      assertTrustedIpcSender(
        event,
      );

      return requireController()
        .retryFailed();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CANCEL_COLLECTION,
    async (event) => {
      assertTrustedIpcSender(
        event,
      );

      return requireController()
        .cancel();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.OPEN_DATA_FOLDER,
    async (event): Promise<void> => {
      assertTrustedIpcSender(
        event,
      );

      const errorMessage =
        await shell.openPath(
          bootstrapStatus
            .directories.runs,
        );

      if (errorMessage.length > 0) {
        throw new Error(
          `Teknik çalışma arşivi açılamadı: ${errorMessage}`,
        );
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.OPEN_LATEST_EXPORT,
    async (event): Promise<void> => {
      assertTrustedIpcSender(
        event,
      );

      const workbookPath =
        await findLatestExportWorkbook(
          bootstrapStatus
            .directories,
        );

      if (workbookPath === null) {
        throw new Error(
          'Henüz açılabilecek tamamlanmış bir veri paketi yok.',
        );
      }

      shell.showItemInFolder(
        workbookPath,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.OPEN_CONFIG_FOLDER,
    async (event): Promise<void> => {
      assertTrustedIpcSender(
        event,
      );

      const errorMessage =
        await shell.openPath(
          bootstrapStatus
            .query_config
            .config_path,
        );

      if (errorMessage.length > 0) {
        throw new Error(
          `Keyword yapılandırma dosyası açılamadı: ${errorMessage}`,
        );
      }
    },
  );

  const requireDesktopController = (): DesktopMultiSourceController => {
    if (desktopController === null) throw new Error('Generalized desktop collection is unavailable because application bootstrap is not ready.');
    return desktopController;
  };

  ipcMain.handle(
    IPC_CHANNELS.DESKTOP_SELECT_INPUT_FILE,
    async (
      event,
      input: unknown,
    ): Promise<DesktopInputFileSelectionResult> => {
      assertTrustedIpcSender(
        event,
      );

      if (
        typeof input !== 'object'
        || input === null
        || Array.isArray(input)
      ) {
        throw new Error(
          'Desktop input-file request must be an object.',
        );
      }

      const value = input as {
        input_kind?: unknown;
      };

      if (
        value.input_kind !==
        'IKAS_PRODUCTS_XLSX'
      ) {
        throw new Error(
          'Desktop input-file kind is unsupported.',
        );
      }

      const result =
        await dialog.showOpenDialog({
          title:
            'Select İkas Products XLSX',
          properties: [
            'openFile',
          ],
          filters: [
            {
              name:
                'Excel Workbook',
              extensions: [
                'xlsx',
              ],
            },
          ],
        });

      if (
        result.canceled
        || result.filePaths.length
          === 0
      ) {
        return {
          canceled:
            true,
          file_path:
            null,
          file_name:
            null,
        };
      }

      const filePath =
        result.filePaths[0];

      return {
        canceled:
          false,
        file_path:
          filePath,
        file_name:
          path.basename(
            filePath,
          ),
      };
    },
  );

  ipcMain.handle(IPC_CHANNELS.DESKTOP_WORKSPACES, (event) => {
    assertTrustedIpcSender(event);
    return requireDesktopController().getWorkspaceView();
  });
  ipcMain.handle(IPC_CHANNELS.DESKTOP_PRESETS, (event, workspaceId: unknown) => {
    assertTrustedIpcSender(event);
    if (typeof workspaceId !== 'string' || workspaceId.trim().length === 0) throw new Error('workspace_id must be a non-empty string.');
    return requireDesktopController().listPresets(workspaceId);
  });
  ipcMain.handle(
    IPC_CHANNELS.DESKTOP_CREATE_PRESET,
    (event, input: unknown) => {
      assertTrustedIpcSender(event);

      if (
        typeof input !== 'object'
        || input === null
      ) {
        throw new Error(
          'Desktop preset input must be an object.',
        );
      }

      const value = input as {
        workspace_id?: unknown;
        preset_name?: unknown;
        reusable_configuration?: unknown;
      };

      if (
        typeof value.workspace_id !== 'string'
        || typeof value.preset_name !== 'string'
        || typeof value.reusable_configuration !== 'object'
        || value.reusable_configuration === null
        || Array.isArray(value.reusable_configuration)
      ) {
        throw new Error(
          'Desktop preset input is invalid.',
        );
      }

      return requireDesktopController().createPreset({
        workspace_id: value.workspace_id,
        preset_name: value.preset_name,
        reusable_configuration:
          value.reusable_configuration as import('./shared/collection-configuration').ReusableCollectionConfiguration,
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DESKTOP_DELETE_PRESET,
    (event, input: unknown) => {
      assertTrustedIpcSender(event);

      if (typeof input !== 'object' || input === null) {
        throw new Error('Desktop preset delete input must be an object.');
      }

      const value = input as {
        workspace_id?: unknown;
        preset_id?: unknown;
      };

      if (
        typeof value.workspace_id !== 'string'
        || typeof value.preset_id !== 'string'
        || !value.workspace_id.trim()
        || !value.preset_id.trim()
      ) {
        throw new Error('Desktop preset delete input is invalid.');
      }

      requireDesktopController().deletePreset(
        value.workspace_id,
        value.preset_id,
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.DESKTOP_CREATE_DRAFT, (event, input: unknown) => {
    assertTrustedIpcSender(event);
    if (typeof input !== 'object' || input === null) throw new Error('Desktop draft input must be an object.');
    const value = input as { workspace_id?: unknown; origin?: unknown };
    if (typeof value.workspace_id !== 'string' || typeof value.origin !== 'object' || value.origin === null) throw new Error('Desktop draft input is invalid.');
    return requireDesktopController().createDraft({ workspace_id: value.workspace_id, origin: value.origin as RunDraftOrigin });
  });
  ipcMain.handle(IPC_CHANNELS.DESKTOP_REVIEW_DRAFT, (event, draft: unknown) => {
    assertTrustedIpcSender(event);
    if (!isDesktopRunDraft(draft)) throw new Error('Desktop draft payload is invalid.');
    return requireDesktopController().reviewDraft(draft as DesktopRunDraft);
  });
  ipcMain.handle(IPC_CHANNELS.DESKTOP_START_DRAFT, (event, draft: unknown) => {
    assertTrustedIpcSender(event);
    if (!isDesktopRunDraft(draft)) throw new Error('Desktop draft payload is invalid.');
    return requireDesktopController().startDraft(draft as DesktopRunDraft);
  });
  ipcMain.handle(IPC_CHANNELS.DESKTOP_RUN_STATE, (event, runId: unknown) => {
    assertTrustedIpcSender(event);
    if (typeof runId !== 'string' || runId.trim().length === 0) throw new Error('run_id must be a non-empty string.');
    return requireDesktopController().getRunState(runId);
  });
  ipcMain.handle(IPC_CHANNELS.DESKTOP_RETRY_FAILED, (event, runId: unknown) => {
    assertTrustedIpcSender(event);
    if (typeof runId !== 'string' || runId.trim().length === 0) throw new Error('run_id must be a non-empty string.');
    return requireDesktopController().retryFailed(runId);
  });
  ipcMain.handle(IPC_CHANNELS.DESKTOP_EXPORT, (event, input: unknown) => {
    assertTrustedIpcSender(event);
    if (typeof input !== 'object' || input === null) throw new Error('Export input must be an object.');
    const value = input as { run_id?: unknown; mode?: unknown };
    if (typeof value.run_id !== 'string' || (value.mode !== 'ALL' && value.mode !== 'SUCCESSFUL_ONLY')) throw new Error('Export input is invalid.');
    return requireDesktopController().exportRun(value.run_id, value.mode);
  });
};

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
      ),
    );
  }
};

const loadQueryConfigStatus = async (
  configPath: string,
): Promise<QueryConfigLoadStatus> => {
  try {
    const config = await loadQueryConfig(configPath);

    return {
      status: 'READY',
      config_path: configPath,
      config,
    };
  } catch (error: unknown) {
    return {
      status: 'ERROR',
      config_path: configPath,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown query configuration error.',
    };
  }
};

const initializeBootstrapStatus =
  async (): Promise<BootstrapStatus> => {
    const directories = await ensureApplicationDirectories();

    const configPath = await ensureExternalQueryConfig(
      directories,
      app.getAppPath(),
    );

    const queryConfig = await loadQueryConfigStatus(configPath);

    const sourceRegistry = new SourceRegistry();

    const runtime =
      createGoogleTrendsRuntime(
        directories,
      );

    googleTrendsRuntime =
      runtime;

    sourceRegistry.register(
      runtime.source,
    );

    sourceRegistry.get('google-trends');

    const sourceSummaries = await sourceRegistry.getSummaries({
      query_config_ready: queryConfig.status === 'READY',
    });

    const database = initializeDatabase(directories);

    if (database.status === 'READY') {
      desktopRepository = new StateRepository(getDatabasePath(directories));
      const credentialStore = new ElectronSafeStorageCredentialStore(
        `${directories.app_data_root}/credentials`,
      );
      const readinessRegistry = new ReadinessRegistry(desktopRepository, credentialStore);
      for (const sourceId of SUPPORTED_DESKTOP_SOURCE_IDS) {
        readinessRegistry.register(
          sourceId,
          ({
            connection,
            credential_available,
            source_config,
          }) => {
            if (sourceId === 'ikas-products') {
              const runFilePath =
                typeof source_config.file_path === 'string'
                && source_config.file_path.trim().length > 0;

              const workspaceFilePath =
                typeof connection?.safe_metadata.file_path === 'string'
                && connection.safe_metadata.file_path.trim().length > 0;

              return runFilePath || workspaceFilePath
                ? 'READY'
                : 'FILE_REQUIRED';
            }

            if (!connection) {
              return 'CONFIGURATION_REQUIRED';
            }

            if (
              connection.credential_ref
              && !credential_available
            ) {
              return 'CONNECTION_REQUIRED';
            }

            if (
              sourceId === 'bitkimark-sitemap'
              && typeof connection.safe_metadata.sitemap_url !== 'string'
            ) {
              return 'CONFIGURATION_REQUIRED';
            }

            return 'READY';
          },
        );
      }
      desktopMultiSourceController = new DesktopMultiSourceController({
        repository: desktopRepository,
        readiness: {
          getReadiness: async (
            workspace_id,
            source_id,
            source_config,
          ) =>
            readinessRegistry.getReadiness(
              workspace_id,
              source_id,
              source_config,
            ),
        },
        application_version: app.getVersion(),
        package_directory: directories.runs,
        execute_run: async (run_id) => {
          if (!desktopExecutionService) throw new Error('Core execution is unavailable.');
          await desktopExecutionService.execute(run_id);
        },
      });
      const productionRuntime = createProductionCollectionRuntime({
        repository: desktopRepository,
        credentialStore,
        directories,
        googleTrendsSource: runtime.source,
        logger: new StructuredLogger(directories),
      });
      desktopExecutionService = new DesktopExecutionService(productionRuntime.orchestrator);
    }

    if (
      queryConfig.status ===
        'READY' &&
      database.status ===
        'READY'
    ) {
      googleTrendsController =
        createGoogleTrendsDesktopController({
          directories,
          workspace_id:
            MIGRATION_COMPATIBILITY_WORKSPACE_ID,
          query_config:
            queryConfig.config,
          source:
            runtime.source,
          application_version:
            app.getVersion(),
          close_browser:
            () =>
              runtime.browser_manager
                .close(),
        });
    }

    return {
      directories,
      query_config: queryConfig,
      source_registry: {
        status: 'READY',
        sources: sourceSummaries,
      },
      database,
    };
  };

app.whenReady().then(async () => {
  const bootstrapStatus = await initializeBootstrapStatus();

  registerIpcHandlers(
    bootstrapStatus,
    googleTrendsController,
    desktopMultiSourceController,
  );
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', (event) => {
  if (
    googleTrendsShutdownPromise !==
    null
  ) {
    event.preventDefault();
    return;
  }

  const runtime =
    googleTrendsRuntime;

  const controller =
    googleTrendsController;

  if (runtime === null) {
    desktopRepository?.close();
    return;
  }

  event.preventDefault();

  // Clear the active runtime before re-entering app.quit() after
  // asynchronous persistent-browser shutdown. The second before-quit
  // event can then continue normally.
  googleTrendsRuntime =
    null;
  googleTrendsController =
    null;

  googleTrendsShutdownPromise =
    (async (): Promise<void> => {
      if (controller !== null) {
        const state =
          controller.getState();

        if (
          state.phase ===
            'RUNNING' ||
          state.phase ===
            'CANCELLING'
        ) {
          await controller.cancel();
        }

        await controller.waitForIdle();
      }

      await runtime.browser_manager
        .close();
      desktopRepository?.close();
    })()
      .catch(
        (): void => {
          // Shutdown failure must not trap Electron in a quit loop.
          console.error(
            'Google Trends browser runtime shutdown failed.',
          );
        },
      )
      .finally((): void => {
        googleTrendsShutdownPromise =
          null;
        app.quit();
      });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
