import type { TaskPackageWindow } from '../../shared/task-package';

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

const parseDateOnly = (value: string, field: string): number => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`${field} must be a YYYY-MM-DD date.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const normalized = new Date(timestamp).toISOString().slice(0, 10);
  if (normalized !== value) throw new Error(`${field} must be a valid calendar date.`);
  return timestamp;
};

const formatDateOnly = (timestamp: number): string =>
  new Date(timestamp).toISOString().slice(0, 10);

export const countCalendarDays = (window: TaskPackageWindow): number => {
  const start = parseDateOnly(window.start, 'window.start');
  const end = parseDateOnly(window.end, 'window.end');
  if (start > end) throw new Error('Task Package window start must not be after end.');
  return Math.floor((end - start) / DAY_MILLISECONDS) + 1;
};

export const lastCompleteCalendarDays = (
  reference_date: string,
  day_count: number,
): TaskPackageWindow => {
  const reference = parseDateOnly(reference_date, 'reference_date');
  if (!Number.isInteger(day_count) || day_count <= 0) {
    throw new Error('day_count must be a positive integer.');
  }
  const end = reference - DAY_MILLISECONDS;
  const start = end - ((day_count - 1) * DAY_MILLISECONDS);
  return { start: formatDateOnly(start), end: formatDateOnly(end) };
};

export const gapDays = (
  previous: TaskPackageWindow,
  current: TaskPackageWindow,
): number => {
  if (countCalendarDays(previous) <= 0 || countCalendarDays(current) <= 0) {
    throw new Error('Task Package windows must contain calendar days.');
  }
  const previousEnd = parseDateOnly(previous.end, 'previous.end');
  const currentStart = parseDateOnly(current.start, 'current.start');
  if (previousEnd >= currentStart) {
    throw new Error('Previous Task Package window must end before current window; overlap is forbidden.');
  }
  return Math.floor((currentStart - previousEnd) / DAY_MILLISECONDS) - 1;
};
