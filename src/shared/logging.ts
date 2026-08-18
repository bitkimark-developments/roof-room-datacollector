export const LOG_LEVELS = [
  'DEBUG',
  'INFO',
  'WARN',
  'ERROR',
] as const;

export type LogLevel =
  (typeof LOG_LEVELS)[number];

export type LogJsonScalar =
  | string
  | number
  | boolean
  | null;

export type LogJsonValue =
  | LogJsonScalar
  | LogJsonValue[]
  | {
      [key: string]: LogJsonValue;
    };

export interface StructuredLogInput {
  level: LogLevel;
  event: string;
  run_id: string;
  job_id?: string | null;
  attempt_id?: string | null;
  context?: Record<string, unknown>;
}

export interface StructuredLogRecord {
  timestamp: string;
  level: LogLevel;
  event: string;
  run_id: string;
  job_id: string | null;
  attempt_id: string | null;
  context: {
    [key: string]: LogJsonValue;
  };
}

export interface StructuredLogSink {
  write(
    input: StructuredLogInput,
  ): Promise<void>;
}
