/**
 * Repairs file names the backend returns as UTF-8 bytes read as Latin-1
 * (the classic multer/busboy `originalname` problem): "Список.pdf" arrives
 * as "Ð¡Ð¿Ð¸ÑÐ¾Ðº.pdf".
 *
 * Pure and conservative: a name is only replaced when every character fits
 * in one byte, the bytes decode as strict UTF-8, the result differs, holds
 * no replacement or control characters and contains at least one letter
 * outside basic Latin. A correct name is returned untouched.
 */

const hasMultiByteSignature = (value: string): boolean =>
  // UTF-8 lead bytes C2-F4 followed by a continuation byte 80-BF.
  /[Â-ô][\u0080-¿]/.test(value);

const looksLikePercentEncoded = (value: string): boolean =>
  /%[0-9A-Fa-f]{2}/.test(value);

// C0 controls, DEL and the C1 range, checked per UTF-16 code unit.
const hasControlChars = (value: string): boolean => {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
};

// Any code unit above ASCII (same as the former [^\u0000-\u007F] test).
const hasNonAscii = (value: string): boolean => /[\u0080-\uFFFF]/.test(value);

const decodeLatin1AsUtf8 = (value: string): string | null => {
  if (typeof TextDecoder === 'undefined') return null;
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code > 0xff) return null;
    bytes[i] = code;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

const isPlausibleRepair = (original: string, repaired: string): boolean =>
  repaired !== original &&
  !repaired.includes('�') &&
  !hasControlChars(repaired) &&
  // Must contain a letter from a non-Latin-1 script or a real accented
  // letter, otherwise the "fix" is just noise.
  hasNonAscii(repaired) &&
  /\p{L}/u.test(repaired);

const tryPercentDecode = (value: string): string => {
  if (!looksLikePercentEncoded(value)) return value;
  try {
    const decoded = decodeURIComponent(value);
    return hasControlChars(decoded) || decoded.includes('�') ? value : decoded;
  } catch {
    return value;
  }
};

export const repairFilenameEncoding = (name: string): string => {
  if (typeof name !== 'string' || name === '') return name;

  let current = name;

  // Percent-encoded names ("%D0%A1...") first; they may also be mojibake
  // after decoding, so run the byte repair on the result.
  const unescaped = tryPercentDecode(current);
  if (unescaped !== current && hasNonAscii(unescaped)) {
    current = unescaped;
  }

  if (!hasMultiByteSignature(current)) return current;

  const repaired = decodeLatin1AsUtf8(current);
  if (repaired !== null && isPlausibleRepair(current, repaired)) return repaired;
  return current;
};
