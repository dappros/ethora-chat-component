export const nanoToMs = (number: string): number => {
  return +number.slice(0, 13) || null;
};
