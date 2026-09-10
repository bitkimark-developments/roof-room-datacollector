export interface ApiResponse { status: number; body: unknown; }
export type ApiRequester = (request: { url: string; method: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> }) => Promise<ApiResponse>;
export const requireApiObject = (value: unknown, context: string): Record<string, unknown> => { if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${context} must be an object.`); return value as Record<string, unknown>; };
export const requireNumberOrNull = (value: unknown, context: string): number | null => { if (value === null || value === undefined || value === '') return null; const n = typeof value === 'number' ? value : Number(value); if (!Number.isFinite(n)) throw new Error(`${context} must be numeric or null.`); return n; };
export const requireArray = (value: unknown, context: string): unknown[] => { if (!Array.isArray(value)) throw new Error(`${context} must be an array.`); return value; };
