/**
 * Converts a server-list MOTD (chat component JSON or legacy §-coded text)
 * into plain styled segments, so the renderer can show colours and
 * formatting without ever rendering server-supplied HTML.
 */
import type { MotdLine, MotdSegment } from '../../types/api/serverStatus';

type Style = Omit<MotdSegment, 'text'>;

/** Index in this list = legacy §0 to §f code. */
const LEGACY_PALETTE: [name: string, hex: string][] = [
  ['black', '#000000'],
  ['dark_blue', '#0000AA'],
  ['dark_green', '#00AA00'],
  ['dark_aqua', '#00AAAA'],
  ['dark_red', '#AA0000'],
  ['dark_purple', '#AA00AA'],
  ['gold', '#FFAA00'],
  ['gray', '#AAAAAA'],
  ['dark_gray', '#555555'],
  ['blue', '#5555FF'],
  ['green', '#55FF55'],
  ['aqua', '#55FFFF'],
  ['red', '#FF5555'],
  ['light_purple', '#FF55FF'],
  ['yellow', '#FFFF55'],
  ['white', '#FFFFFF'],
];
const LEGACY_CODES = '0123456789abcdef';
const NAMED_COLORS = new Map(LEGACY_PALETTE);
const FORMAT_KEYS = ['bold', 'italic', 'underlined', 'strikethrough', 'obfuscated'] as const;
const LEGACY_FORMATS: Record<string, (typeof FORMAT_KEYS)[number]> = {
  l: 'bold',
  o: 'italic',
  n: 'underlined',
  m: 'strikethrough',
  k: 'obfuscated',
};

const MAX_CHARS = 400;
const MAX_LINES = 4;
const MAX_DEPTH = 16;

const resolveColor = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  return NAMED_COLORS.get(value);
};

/** Splits text containing § codes into segments, starting from `base` style. */
const parseLegacy = (text: string, base: Style, out: MotdSegment[]): void => {
  let style: Style = { ...base };
  let buffer = '';
  const flush = () => {
    if (buffer) out.push({ text: buffer, ...style });
    buffer = '';
  };

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '§' && i + 1 < text.length) {
      const code = text[++i].toLowerCase();
      flush();
      const colorIndex = LEGACY_CODES.indexOf(code);
      if (colorIndex !== -1) {
        // In legacy formatting a colour code also clears bold/italic/etc.
        style = { color: LEGACY_PALETTE[colorIndex][1] };
      } else if (code === 'r') {
        style = { ...base };
      } else if (LEGACY_FORMATS[code]) {
        style = { ...style, [LEGACY_FORMATS[code]]: true };
      }
      continue;
    }
    buffer += text[i];
  }
  flush();
};

const walk = (node: unknown, inherited: Style, out: MotdSegment[], depth: number): void => {
  if (depth > MAX_DEPTH) return;

  if (typeof node === 'string') {
    parseLegacy(node, inherited, out);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, inherited, out, depth + 1));
    return;
  }
  if (!node || typeof node !== 'object') return;

  const component = node as Record<string, unknown>;
  const style: Style = { ...inherited };
  const color = resolveColor(component.color);
  if (color) style.color = color;
  for (const key of FORMAT_KEYS) {
    if (typeof component[key] === 'boolean') style[key] = component[key] as boolean;
  }

  if (typeof component.text === 'string') parseLegacy(component.text, style, out);
  if (Array.isArray(component.extra)) {
    component.extra.forEach((child) => walk(child, style, out, depth + 1));
  }
};

export const parseMotd = (description: unknown): MotdLine[] => {
  const segments: MotdSegment[] = [];
  walk(description, {}, segments, 0);

  const lines: MotdLine[] = [[]];
  let chars = 0;
  for (const segment of segments) {
    segment.text.split('\n').forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (!part || chars >= MAX_CHARS) return;
      const text = part.slice(0, MAX_CHARS - chars);
      chars += text.length;
      lines[lines.length - 1].push({ ...segment, text });
    });
  }

  return lines
    .filter((line) => line.some((segment) => segment.text.trim()))
    .slice(0, MAX_LINES);
};

/** Removes legacy § formatting codes from plain strings (player names, version). */
export const stripFormatting = (text: string): string => text.replace(/§./g, '');
