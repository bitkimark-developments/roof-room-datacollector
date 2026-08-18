import {
  appendFile,
  mkdir,
} from 'node:fs/promises';
import * as path from 'node:path';

import type {
  ApplicationDirectories,
} from '../../shared/bootstrap-status';
import {
  LOG_LEVELS,
  type StructuredLogInput,
  type StructuredLogRecord,
  type StructuredLogSink,
} from '../../shared/logging';
import {
  sanitizeLogContext,
} from './log-redaction';

const RUN_ID_PATTERN =
  /^rr_\d{8}T\d{9}Z_[0-9a-f]{6}$/;

const LEVEL_SET =
  new Set<string>(LOG_LEVELS);

const requireRunId = (
  runId: string,
): string => {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(
      `Invalid filesystem-safe run_id for logging: ${runId}`,
    );
  }

  return runId;
};

const requireEventName = (
  event: string,
): string => {
  if (
    event.trim().length === 0 ||
    /[\r\n\0]/.test(event)
  ) {
    throw new Error(
      'Log event must be non-empty and single-line.',
    );
  }

  return event;
};

const requireLevel = (
  level: string,
): StructuredLogRecord['level'] => {
  if (!LEVEL_SET.has(level)) {
    throw new Error(
      `Unsupported log level: ${level}`,
    );
  }

  return level as StructuredLogRecord['level'];
};

const assertInside = (
  parent: string,
  candidate: string,
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
    'Log path escaped the configured runs root.',
  );
};

export interface StructuredLoggerOptions {
  now?: () => Date;
  filename?: string;
}

export class StructuredLogger
  implements StructuredLogSink
{
  private readonly runsRoot: string;
  private readonly now: () => Date;
  private readonly filename: string;
  private writeChain:
    Promise<void> = Promise.resolve();

  constructor(
    directories: ApplicationDirectories,
    options: StructuredLoggerOptions = {},
  ) {
    this.runsRoot = path.resolve(
      directories.runs,
    );
    this.now =
      options.now ??
      (() => new Date());
    this.filename =
      options.filename ??
      'events.jsonl';

    if (
      this.filename !==
        path.basename(this.filename) ||
      this.filename.includes('\0') ||
      !this.filename.endsWith('.jsonl')
    ) {
      throw new Error(
        'Structured log filename must be a safe .jsonl basename.',
      );
    }
  }

  async write(
    input: StructuredLogInput,
  ): Promise<void> {
    const record =
      this.createRecord(input);

    const line =
      `${JSON.stringify(record)}\n`;

    const logPath =
      this.getRunLogPath(
        input.run_id,
      );

    this.writeChain =
      this.writeChain.then(
        async () => {
          await mkdir(
            path.dirname(logPath),
            {
              recursive: true,
            },
          );

          await appendFile(
            logPath,
            line,
            {
              encoding: 'utf8',
            },
          );
        },
      );

    return this.writeChain;
  }

  getRunLogPath(
    runIdInput: string,
  ): string {
    const runId =
      requireRunId(runIdInput);

    const runRoot = path.resolve(
      this.runsRoot,
      runId,
    );

    assertInside(
      this.runsRoot,
      runRoot,
    );

    const logDirectory =
      path.resolve(
        runRoot,
        'logs',
      );

    assertInside(
      runRoot,
      logDirectory,
    );

    const logPath = path.resolve(
      logDirectory,
      this.filename,
    );

    assertInside(
      logDirectory,
      logPath,
    );

    return logPath;
  }

  private createRecord(
    input: StructuredLogInput,
  ): StructuredLogRecord {
    return {
      timestamp:
        this.now().toISOString(),
      level: requireLevel(
        input.level,
      ),
      event: requireEventName(
        input.event,
      ),
      run_id: requireRunId(
        input.run_id,
      ),
      job_id:
        input.job_id ?? null,
      attempt_id:
        input.attempt_id ?? null,
      context:
        sanitizeLogContext(
          input.context,
        ),
    };
  }
}
