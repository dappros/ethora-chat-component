export const getTintedColor = (hex: string, amount: number = 0.2) => {
  if (hex.startsWith("#")) {
    hex = hex.slice(1);
  }

  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((x) => x + x)
      .join("");
  }

  const num = parseInt(hex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  const tintedR = Math.round(r + (255 - r) * amount);
  const tintedG = Math.round(g + (255 - g) * amount);
  const tintedB = Math.round(b + (255 - b) * amount);

  const tintedHex = `#${((1 << 24) + (tintedR << 16) + (tintedG << 8) + tintedB)
    .toString(16)
    .slice(1)
    .toUpperCase()}`;

  return tintedHex;
};
