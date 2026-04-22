const MILLISECONDS_LOWER_BOUND = 1e11;
const MICROSECONDS_UPPER_BOUND = 1e14;
const NANOS_UPPER_BOUND = 1e17;

export const normalizeTimestampValue = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < MILLISECONDS_LOWER_BOUND) return value * 1000; // seconds -> milliseconds
  if (value > NANOS_UPPER_BOUND) return Math.floor(value / 1_000_000); // nanoseconds -> milliseconds
  if (value > MICROSECONDS_UPPER_BOUND) return Math.floor(value / 1000); // microseconds -> milliseconds
  return value; // already milliseconds
};

export const getTimestampFromUnknown = (value: unknown): number => {
  if (value == null) return 0;

  if (value instanceof Date) {
    const ts = value.getTime();
    return Number.isFinite(ts) && ts > 0 ? ts : 0;
  }

  if (typeof value === 'number') {
    return normalizeTimestampValue(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;

    if (/^\d+$/.test(trimmed)) {
      return normalizeTimestampValue(Number(trimmed));
    }

    const parsedDate = new Date(trimmed).getTime();
    if (Number.isFinite(parsedDate) && parsedDate > 0) return parsedDate;

    const numericChunk = trimmed.match(/\d{10,}/)?.[0];
    if (numericChunk) {
      return normalizeTimestampValue(Number(numericChunk));
    }
  }

  return 0;
};

