export const handleCopyClick = (string: string) => {
  navigator.clipboard.writeText(string);
};
