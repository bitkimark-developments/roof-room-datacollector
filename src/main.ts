import { app, BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { ensureApplicationDirectories } from './main/app/application-directories';
import {
  ensureExternalQueryConfig,
  loadQueryConfig,
} from './main/config/query-config-loader';
import { SourceRegistry } from './main/core/source-registry';
import { GoogleTrendsSource } from './main/sources/google-trends/google-trends-source';
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
): void => {
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
};

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 820,
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
    sourceRegistry.register(new GoogleTrendsSource());

    // Prove the Core lookup path uses the stable machine ID.
    sourceRegistry.get('google-trends');

    const sourceSummaries = await sourceRegistry.getSummaries({
      query_config_ready: queryConfig.status === 'READY',
    });

    return {
      directories,
      query_config: queryConfig,
      source_registry: {
        status: 'READY',
        sources: sourceSummaries,
      },
    };
  };

app.whenReady().then(async () => {
  const bootstrapStatus = await initializeBootstrapStatus();

  registerIpcHandlers(bootstrapStatus);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
