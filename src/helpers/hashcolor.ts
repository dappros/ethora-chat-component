export function nameToColor(name: string): {
  backgroundColor: string;
  textColor: string;
} {
  /**
   * Generate a consistent background color and readable text color from a string.
   *
   * @param name - The string to generate the color for (e.g., username).
   * @returns An object with `backgroundColor` and `textColor`.
   */

  if(!name) {
    return { backgroundColor: "transparent", textColor: "" };
  }
  // Generate a hash code from the name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Convert the hash code to a valid hex background color
  let backgroundColor = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff; // Extract 8 bits
    backgroundColor += ('00' + value.toString(16)).slice(-2); // Convert to hex
  }

  // Calculate brightness using the YIQ formula
  const r = parseInt(backgroundColor.slice(1, 3), 16);
  const g = parseInt(backgroundColor.slice(3, 5), 16);
  const b = parseInt(backgroundColor.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  // Use white text for dark backgrounds and black text for light backgrounds
  const textColor = brightness > 128 ? '#000000' : '#FFFFFF';

  return { backgroundColor, textColor };
}
