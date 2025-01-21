import { sha256 } from 'js-sha256';

export function nameToColor(name: string): {
  backgroundColor: string;
} | null {
  const avatarColors = [
    '#86d1ee',
    '#badfff',
    '#E2F4FB',
    '#B1E1D9',
    '#B8F1C4',
    '#E0FFBE',
    '#D3C2F1',
    '#EEE6F9',
    '#E7BDE6',
    '#FEBDD1',
    '#FFEBEE',
    '#F1DCB6',
    '#FFE0B6',
    '#E8E4C9',
    '#F5F2BC',
  ];

  if (!name) {
    return { backgroundColor: 'transparent' };
  }

  return {
    backgroundColor:
      avatarColors[
        parseInt(sha256(name).slice(0, 2), 16) % avatarColors.length
      ],
  };
}
