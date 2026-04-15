export interface ParsedMessageReference {
  id?: string;
  text?: string;
  roomJid?: string;
}

export const parseMessageReference = (
  rawValue: unknown
): ParsedMessageReference | null => {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};
