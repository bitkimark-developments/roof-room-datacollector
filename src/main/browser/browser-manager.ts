import {
  mkdir,
} from 'node:fs/promises';
import * as path from 'node:path';

import type {
  ApplicationDirectories,
} from '../../shared/bootstrap-status';
import type {
  BrowserManagerState,
  BrowserUnexpectedCloseEvent,
} from '../../shared/browser';

const PROFILE_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type BrowserManagerErrorCode =
  | 'INVALID_PROFILE_ID'
  | 'ACTIVE_PROFILE_CONFLICT'
  | 'LAUNCH_FAILED';

export class BrowserManagerError extends Error {
  constructor(
    public readonly code: BrowserManagerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BrowserManagerError';
  }
}

export interface ManagedBrowserResponse {
  status(): number;

  headerValue(
    name: string,
  ): Promise<string | null>;
}

export type ManagedBrowserRole =
  | 'button'
  | 'menuitem'
  | 'option'
  | 'searchbox'
  | 'textbox';

export interface ManagedBrowserLocator {
  innerText(
    options?: {
      timeout?: number;
    },
  ): Promise<string>;

  click(
    options?: {
      timeout?: number;
    },
  ): Promise<void>;

  fill(
    value: string,
    options?: {
      timeout?: number;
    },
  ): Promise<void>;

  press(
    key: string,
    options?: {
      timeout?: number;
    },
  ): Promise<void>;

  locator(
    selector: string,
  ): ManagedBrowserLocator;

  getByRole(
    role: ManagedBrowserRole,
    options?: {
      name?: string;
    },
  ): ManagedBrowserLocator;

  count(): Promise<number>;
}

export interface ManagedBrowserDownload {
  suggestedFilename(): string;

  saveAs(
    destinationPath: string,
  ): Promise<void>;

  failure(): Promise<string | null>;
}

export interface ManagedBrowserPage {
  goto(
    url: string,
    options: {
      waitUntil: 'domcontentloaded';
      timeout: number;
    },
  ): Promise<ManagedBrowserResponse | null>;

  title(): Promise<string>;

  locator(
    selector: string,
  ): ManagedBrowserLocator;

  getByRole(
    role: ManagedBrowserRole,
    options?: {
      name?: string;
    },
  ): ManagedBrowserLocator;

  getByText(
    text: string,
    options?: {
      exact?: boolean;
    },
  ): ManagedBrowserLocator;

  waitForEvent(
    event: 'download',
    options?: {
      timeout?: number;
    },
  ): Promise<ManagedBrowserDownload>;

  close(): Promise<void>;
}

export interface ManagedPersistentBrowserContext {
  close(): Promise<void>;

  pages(): ManagedBrowserPage[];

  newPage(): Promise<ManagedBrowserPage>;

  on(
    event: 'close',
    listener: () => void,
  ): unknown;
}

export interface PersistentBrowserLaunchOptions {
  headless: boolean;
  acceptDownloads: boolean;
}

export interface PersistentBrowserLauncher {
  launchPersistentContext(
    userDataDir: string,
    options: PersistentBrowserLaunchOptions,
  ): Promise<ManagedPersistentBrowserContext>;
}

export interface BrowserSession {
  profile_id: string;
  user_data_dir: string;
  context: ManagedPersistentBrowserContext;
}

export interface BrowserOpenOptions {
  headless?: boolean;
  accept_downloads?: boolean;
}

export interface BrowserManagerOptions {
  now?: () => Date;
  onUnexpectedClose?: (
    event: BrowserUnexpectedCloseEvent,
  ) => void;
}

interface ActiveBrowserSession {
  session: BrowserSession;
  intentional_close: boolean;
}

interface OpeningBrowserSession {
  profile_id: string;
  user_data_dir: string;
  promise: Promise<BrowserSession>;
}

const assertInside = (
  parent: string,
  candidate: string,
  context: string,
): void => {
  const relative = path.relative(
    parent,
    candidate,
  );

  if (
    relative === '' ||
    (
      !relative.startsWith(
        `..${path.sep}`,
      ) &&
      relative !== '..' &&
      !path.isAbsolute(relative)
    )
  ) {
    return;
  }

  throw new Error(
    `${context} escapes its configured root.`,
  );
};

const requireProfileId = (
  profileId: string,
): string => {
  if (!PROFILE_ID_PATTERN.test(profileId)) {
    throw new BrowserManagerError(
      'INVALID_PROFILE_ID',
      `Invalid browser profile ID: ${profileId}`,
    );
  }

  return profileId;
};

const toLaunchFailureMessage = (
  profileId: string,
  error: unknown,
): string =>
  `Failed to launch persistent browser profile ${profileId}: ${
    error instanceof Error
      ? error.message
      : 'unknown browser launch error'
  }`;

export class BrowserManager {
  private readonly appDataRoot: string;
  private readonly profilesRoot: string;
  private readonly now: () => Date;
  private readonly onUnexpectedClose:
    | ((
        event: BrowserUnexpectedCloseEvent,
      ) => void)
    | undefined;

  private active:
    | ActiveBrowserSession
    | null = null;

  private opening:
    | OpeningBrowserSession
    | null = null;

  constructor(
    directories: ApplicationDirectories,
    private readonly launcher:
      PersistentBrowserLauncher,
    options: BrowserManagerOptions = {},
  ) {
    this.appDataRoot = path.resolve(
      directories.app_data_root,
    );

    this.profilesRoot = path.resolve(
      directories.browser_profiles,
    );

    assertInside(
      this.appDataRoot,
      this.profilesRoot,
      'Browser profiles root',
    );

    this.now =
      options.now ??
      (() => new Date());

    this.onUnexpectedClose =
      options.onUnexpectedClose;
  }

  getState(): BrowserManagerState {
    if (this.active) {
      return {
        status: 'OPEN',
        profile_id:
          this.active.session.profile_id,
        user_data_dir:
          this.active.session.user_data_dir,
      };
    }

    if (this.opening) {
      return {
        status: 'OPENING',
        profile_id:
          this.opening.profile_id,
        user_data_dir:
          this.opening.user_data_dir,
      };
    }

    return {
      status: 'IDLE',
      profile_id: null,
      user_data_dir: null,
    };
  }

  getProfilePath(
    profileIdInput: string,
  ): string {
    const profileId =
      requireProfileId(
        profileIdInput,
      );

    const profilePath = path.resolve(
      this.profilesRoot,
      profileId,
    );

    assertInside(
      this.profilesRoot,
      profilePath,
      'Browser profile path',
    );

    return profilePath;
  }

  async openProfile(
    profileIdInput: string,
    options: BrowserOpenOptions = {},
  ): Promise<BrowserSession> {
    const profileId =
      requireProfileId(
        profileIdInput,
      );

    if (this.active) {
      if (
        this.active.session.profile_id ===
        profileId
      ) {
        return this.active.session;
      }

      throw new BrowserManagerError(
        'ACTIVE_PROFILE_CONFLICT',
        `Browser profile ${this.active.session.profile_id} is already active; close it before opening ${profileId}.`,
      );
    }

    if (this.opening) {
      if (
        this.opening.profile_id ===
        profileId
      ) {
        return this.opening.promise;
      }

      throw new BrowserManagerError(
        'ACTIVE_PROFILE_CONFLICT',
        `Browser profile ${this.opening.profile_id} is already opening; wait for it to finish before opening ${profileId}.`,
      );
    }

    const userDataDir =
      this.getProfilePath(
        profileId,
      );

    const launchPromise =
      this.launchProfile(
        profileId,
        userDataDir,
        options,
      );

    this.opening = {
      profile_id: profileId,
      user_data_dir: userDataDir,
      promise: launchPromise,
    };

    try {
      return await launchPromise;
    } finally {
      if (
        this.opening?.promise ===
        launchPromise
      ) {
        this.opening = null;
      }
    }
  }

  async close(): Promise<void> {
    if (this.opening) {
      try {
        await this.opening.promise;
      } catch {
        // Launch errors have already been surfaced to
        // the caller that initiated the open request.
      }
    }

    const active = this.active;

    if (!active) {
      return;
    }

    active.intentional_close = true;

    try {
      await active.session.context.close();
    } finally {
      if (this.active === active) {
        this.active = null;
      }
    }
  }

  private async launchProfile(
    profileId: string,
    userDataDir: string,
    options: BrowserOpenOptions,
  ): Promise<BrowserSession> {
    await mkdir(
      userDataDir,
      {
        recursive: true,
      },
    );

    let context:
      ManagedPersistentBrowserContext;

    try {
      context =
        await this.launcher
          .launchPersistentContext(
            userDataDir,
            {
              // Headed mode is the default so manual
              // authentication remains possible.
              headless:
                options.headless ??
                false,
              acceptDownloads:
                options.accept_downloads ??
                true,
            },
          );
    } catch (error: unknown) {
      throw new BrowserManagerError(
        'LAUNCH_FAILED',
        toLaunchFailureMessage(
          profileId,
          error,
        ),
      );
    }

    const session: BrowserSession = {
      profile_id: profileId,
      user_data_dir: userDataDir,
      context,
    };

    const active: ActiveBrowserSession = {
      session,
      intentional_close: false,
    };

    this.active = active;

    context.on(
      'close',
      () => {
        if (this.active !== active) {
          return;
        }

        this.active = null;

        if (
          !active.intentional_close
        ) {
          this.onUnexpectedClose?.({
            profile_id:
              session.profile_id,
            user_data_dir:
              session.user_data_dir,
            occurred_at:
              this.now().toISOString(),
          });
        }
      },
    );

    return session;
  }
}
