import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';

import type {
  SecretIngressPort,
  SecretIngressPurpose,
  SecretIngressResult,
} from '../core/secret-ingress';

const OSA_SCRIPT_PATH = '/usr/bin/osascript' as const;
const PROCESS_TIMEOUT_MS = 120000 as const;
const MAX_OUTPUT_BYTES = 1024 as const;
const CANCEL_SENTINEL = 'ROOFROOM_SECRET_CANCELLED';
const SUBMITTED_PREFIX = 'ROOFROOM_SECRET_SUBMITTED:';

const PROMPT_COPY: Record<SecretIngressPurpose, string> = {
  SERPAPI_API_KEY: 'Enter the SerpApi API key for RoofRoom.',
  GOOGLE_OAUTH_CLIENT_ID: 'Enter the Google OAuth Client ID for RoofRoom.',
  GOOGLE_OAUTH_CLIENT_SECRET: 'Enter the Google OAuth Client Secret for RoofRoom.',
};

const promptScript = (purpose: SecretIngressPurpose): string => `try
  set promptResult to display dialog "${PROMPT_COPY[purpose]}" ¬
    default answer "" ¬
    buttons {"Cancel", "Continue"} ¬
    default button "Continue" ¬
    cancel button "Cancel" ¬
    with title "RoofRoom Data Collector" ¬
    with hidden answer
  return "${SUBMITTED_PREFIX}" & (text returned of promptResult)
on error number -128
  return "${CANCEL_SENTINEL}"
end try`;

export interface OsaScriptProcessResult {
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  stderr_bytes: number;
  timed_out: boolean;
  overflowed: boolean;
}

export interface OsaScriptRunRequest {
  executable: '/usr/bin/osascript';
  argv: readonly [];
  shell: false;
  script: string;
  timeout_ms: 120000;
  max_output_bytes: 1024;
}

export type RunOsaScript = (
  request: OsaScriptRunRequest,
) => Promise<OsaScriptProcessResult>;

type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: {
    shell: false;
    stdio: ['pipe', 'pipe', 'pipe'];
  },
) => ChildProcessWithoutNullStreams;

const fixedProcessError = (): Error => new Error(
  'The native secret-ingress process is unavailable.',
);

export const createRunOsaScript = (
  spawnProcess: SpawnProcess = spawn,
): RunOsaScript => async (request) => new Promise((resolve, reject) => {
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnProcess(request.executable, [], {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    reject(fixedProcessError());
    return;
  }

  let settled = false;
  let terminated = false;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  const stdoutChunks: Buffer[] = [];

  const terminate = (): void => {
    if (terminated) return;
    terminated = true;
    try {
      child.kill('SIGTERM');
    } catch {
      // Process termination remains a fixed safe outcome.
    }
  };

  const timeoutState: { timer?: NodeJS.Timeout } = {};
  const settle = (
    result: OsaScriptProcessResult | Error,
    rejectResult = false,
  ): void => {
    if (settled) return;
    settled = true;
    if (timeoutState.timer !== undefined) clearTimeout(timeoutState.timer);
    if (rejectResult) {
      reject(result);
      return;
    }
    resolve(result as OsaScriptProcessResult);
  };

  const overflow = (): void => {
    if (settled) return;
    terminate();
    settle({
      exit_code: null,
      signal: null,
      stdout: Buffer.concat(stdoutChunks),
      stderr_bytes: stderrBytes,
      timed_out: false,
      overflowed: true,
    });
  };

  child.stdout.on('data', (chunk: Buffer | string) => {
    if (settled) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (stdoutBytes + bytes.length > request.max_output_bytes) {
      overflow();
      return;
    }
    stdoutBytes += bytes.length;
    stdoutChunks.push(bytes);
  });
  child.stderr.on('data', (chunk: Buffer | string) => {
    if (settled) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (stderrBytes + bytes.length > request.max_output_bytes) {
      stderrBytes += bytes.length;
      overflow();
      return;
    }
    stderrBytes += bytes.length;
  });
  child.once('error', () => {
    terminate();
    settle(fixedProcessError(), true);
  });
  child.stdin.once('error', () => {
    terminate();
    settle(fixedProcessError(), true);
  });
  child.once('close', (exitCode, signal) => {
    settle({
      exit_code: exitCode,
      signal,
      stdout: Buffer.concat(stdoutChunks),
      stderr_bytes: stderrBytes,
      timed_out: false,
      overflowed: false,
    });
  });

  timeoutState.timer = setTimeout(() => {
    if (settled) return;
    terminate();
    settle({
      exit_code: null,
      signal: null,
      stdout: Buffer.concat(stdoutChunks),
      stderr_bytes: stderrBytes,
      timed_out: true,
      overflowed: false,
    });
  }, request.timeout_ms);

  child.stdin.end(request.script);
});

const removeOneTerminalLineEnding = (value: string): string => (
  value.endsWith('\r\n')
    ? value.slice(0, -2)
    : value.endsWith('\n')
      ? value.slice(0, -1)
      : value
);

export class MacOsascriptSecretIngress implements SecretIngressPort {
  constructor(
    private readonly runOsaScript: RunOsaScript = createRunOsaScript(),
  ) {}

  async requestSecret(
    input: { purpose: SecretIngressPurpose },
  ): Promise<SecretIngressResult> {
    if (!Object.hasOwn(PROMPT_COPY, input.purpose)) {
      return { status: 'FAILED', code: 'INVALID_OUTPUT' };
    }

    let processResult: OsaScriptProcessResult;
    try {
      processResult = await this.runOsaScript({
        executable: OSA_SCRIPT_PATH,
        argv: [],
        shell: false,
        script: promptScript(input.purpose),
        timeout_ms: PROCESS_TIMEOUT_MS,
        max_output_bytes: MAX_OUTPUT_BYTES,
      });
    } catch {
      return { status: 'FAILED', code: 'PROCESS_UNAVAILABLE' };
    }

    if (processResult.timed_out) {
      return { status: 'FAILED', code: 'TIMED_OUT' };
    }
    if (processResult.overflowed) {
      return { status: 'FAILED', code: 'OUTPUT_LIMIT_EXCEEDED' };
    }
    if (processResult.exit_code !== 0 || processResult.signal !== null) {
      return { status: 'FAILED', code: 'PROCESS_FAILED' };
    }
    const output = removeOneTerminalLineEnding(
      processResult.stdout.toString('utf8'),
    );
    if (output === CANCEL_SENTINEL) return { status: 'CANCELLED' };
    if (!output.startsWith(SUBMITTED_PREFIX)) {
      return { status: 'FAILED', code: 'INVALID_OUTPUT' };
    }
    const secret = output.slice(SUBMITTED_PREFIX.length);
    if (secret.includes('\n') || secret.includes('\r')) {
      return { status: 'FAILED', code: 'INVALID_OUTPUT' };
    }
    return { status: 'SUBMITTED', secret };
  }
}
