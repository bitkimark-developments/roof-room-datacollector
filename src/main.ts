import {
  app,
  BrowserWindow,
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
import { initializeDatabase } from './main/storage/database';
import {
  IPC_CHANNELS,
  type ApplicationInfo,
} from './shared/application-info';
import type {
  BootstrapStatus,
  QueryConfigLoadStatus,
} from './shared/bootstrap-status';

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
      queryGroupIds:
        unknown,
    ) => {
      assertTrustedIpcSender(
        event,
      );

      if (
        !Array.isArray(
          queryGroupIds,
        ) ||
        queryGroupIds.length <
          1 ||
        !queryGroupIds.every(
          (groupId) =>
            typeof groupId ===
              'string' &&
            groupId.trim().length >
              0,
        )
      ) {
        throw new Error(
          'Collection start requires one or more query group IDs.',
        );
      }

      return requireController()
        .start(
          queryGroupIds,
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

    if (
      queryConfig.status ===
        'READY' &&
      database.status ===
        'READY'
    ) {
      googleTrendsController =
        createGoogleTrendsDesktopController({
          directories,
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
