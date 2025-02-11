export function getNumberFromString(value: string): number | null {
  if (!value) return null;
  const num = Number(value.trim());
  return isNaN(num) ? null : num;
}
