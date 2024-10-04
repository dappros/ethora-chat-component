export const isDateBefore = (date1: string, date2: string): boolean => {
  return new Date(date1) < new Date(date2);
};
export const isDateAfter = (date1: string, date2: string): boolean => {
  return new Date(date1) > new Date(date2);
};

export const getHighResolutionTimestamp = () => {
  const milliseconds = Date.now();
  const microseconds = Math.floor(performance.now() * 10);
  return `${milliseconds}${microseconds.toString().padStart(6, "0")}`;
};
