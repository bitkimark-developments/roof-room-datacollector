import { app } from 'electron';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ApplicationDirectories } from '../../shared/bootstrap-status';

export const ensureApplicationDirectories =
  async (): Promise<ApplicationDirectories> => {
    const appDataRoot = path.join(app.getPath('userData'), 'app-data');

    const directories: ApplicationDirectories = {
      app_data_root: appDataRoot,
      config: path.join(appDataRoot, 'config'),
      data: path.join(appDataRoot, 'data'),
      runs: path.join(appDataRoot, 'data', 'runs'),
      database: path.join(appDataRoot, 'database'),
      browser_profiles: path.join(appDataRoot, 'browser-profiles'),
      logs: path.join(appDataRoot, 'logs'),
    };

    await Promise.all(
      Object.values(directories).map((directory) =>
        mkdir(directory, { recursive: true }),
      ),
    );

    app.setAppLogsPath(directories.logs);

    return directories;
  };
