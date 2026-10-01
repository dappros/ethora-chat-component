export const nanoToMs = (number?: string | number | null): number => {
  if (number === undefined || number === null) return null;
  return +String(number).slice(0, 13) || null;
};
