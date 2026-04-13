export const safeJsonParse = <T>(
  rawValue: unknown,
  fallback: T
): T => {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
};
