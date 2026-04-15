export const formatError = (error: unknown, fallback = 'unknown'): string => {
  if (error instanceof Error) {
    return error.stack || error.message || fallback;
  }
  if (typeof error === 'string') return error || fallback;
  try {
    const json = JSON.stringify(error);
    return json || fallback;
  } catch {
    return fallback;
  }
};
