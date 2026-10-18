export interface PatternInfo {
  id: string;
  label: string;
  /** Moving patterns are shown with a motion marker on their thumbnail. */
  scrolling: boolean;
  /** Patterns that strobe or flash; the UI asks for confirmation before showing them. */
  flashing: boolean;
}

const labels: Record<string, string> = {
  brompton: 'Brompton',
  red: 'Red',
  green: 'Green',
  blue: 'Blue',
  cyan: 'Cyan',
  magenta: 'Magenta',
  yellow: 'Yellow',
  white: 'White',
  black: 'Black',
  grid: 'Grid',
  checkerboard: 'Checkerboard',
  'colour-bars': 'Colour bars',
  gradient: 'Gradient',
  strobe: 'Strobe',
  'smpte-bars': 'SMPTE bars',
  'custom-colour': 'Custom colour',
  custom: 'Custom',
  'forty-five-degree-grid': '45° grid',
  'custom-gradient': 'Custom gradient',
};

export function patternInfo(id: string): PatternInfo {
  const scrolling = id.startsWith('scrolling-');
  const base = scrolling ? id.slice('scrolling-'.length) : id;
  return {
    id,
    label: labels[base] ?? base.replace(/-/g, ' '),
    scrolling,
    flashing: base === 'strobe',
  };
}
