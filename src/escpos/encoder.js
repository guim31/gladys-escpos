// -----------------------------------------------------------------------------
// ESC/POS ticket builder: text in, printer bytes out.
//
// Written by hand on purpose (a few commands, no dependency): ESC @, ESC t,
// ESC a, ESC E, GS !, GS ( k for the QR code, ESC d and GS V. Every command
// is in the Epson ESC/POS reference and understood by the clones.
//
// The text never reaches the printer as is: it is reduced to the bytes of the
// selected code page, so a scene variable can never inject a command (every
// control character is dropped), and a character missing from the table is
// replaced by its closest spelling (’ -> ', € -> EUR, œ -> oe, é -> e) before
// falling back to "?".
// -----------------------------------------------------------------------------

import { CODE_PAGES } from './codepages.js';

const ESC = 0x1b;
const GS = 0x1d;

export const COMMANDS = {
  INIT: [ESC, 0x40],
  // International character set USA: # $ @ [ \ ] ^ ` { | } ~ as in ASCII.
  CHARSET_USA: [ESC, 0x52, 0x00],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  SIZE_NORMAL: [GS, 0x21, 0x00],
  SIZE_TALL: [GS, 0x21, 0x01],
  SIZE_LARGE: [GS, 0x21, 0x11],
  // Feed to the cutting position, then a partial cut (one point left).
  CUT: [GS, 0x56, 0x42, 0x00],
};

/** Feed n lines (ESC d n). */
const feed = (lines) => [ESC, 0x64, lines];

// Characters most code pages lack, spelled with what they have. Applied only
// when the selected table has no byte for the character.
const REPLACEMENTS = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '′': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '«': '"',
  '»': '"',
  '–': '-',
  '—': '-',
  '−': '-',
  '…': '...',
  '•': '*',
  '€': 'EUR',
  œ: 'oe',
  Œ: 'OE',
  æ: 'ae',
  Æ: 'AE',
  ß: 'ss',
  '™': 'TM',
  '©': '(c)',
  '®': '(R)',
  '°': 'o',
};

// Spaces that are not ASCII (no-break, narrow no-break used by French
// typography, thin, ideographic...) become a plain space.
const SPACES = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;
// Line separators kept as line breaks; every other control character goes.
const LINE_BREAKS = /\r\n|\r|\u2028|\u2029|\u0085/g;
// eslint-disable-next-line no-control-regex
const CONTROLS =
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff\u00ad\ufe00-\ufe0f]/g;

/** Unicode -> byte map of one code page. */
const maps = new Map();
function byteMap(codePage) {
  if (!maps.has(codePage)) {
    const map = new Map();
    const table = CODE_PAGES[codePage]?.high ?? '';
    [...table].forEach((char, index) => {
      if (char !== '\u0000') {
        map.set(char, 0x80 + index);
      }
    });
    maps.set(codePage, map);
  }
  return maps.get(codePage);
}

/**
 * Clean a user text: line breaks unified (the literal two characters "\n" of a
 * single-line scene field count as one), tabs and exotic spaces as spaces,
 * control characters removed.
 * @param {unknown} text
 * @returns {string}
 */
export function cleanText(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/\\n/g, '\n')
    .replace(LINE_BREAKS, '\n')
    .replace(/\t/g, ' ')
    .replace(SPACES, ' ')
    .replace(CONTROLS, '');
}

/**
 * Spell one character with the bytes of the code page.
 * @returns {number[]} one or more bytes, never a control byte
 */
function encodeChar(char, map) {
  const code = char.codePointAt(0);
  if (code >= 0x20 && code < 0x7f) {
    return [code];
  }
  if (map.has(char)) {
    return [map.get(char)];
  }
  if (REPLACEMENTS[char] !== undefined) {
    return [...REPLACEMENTS[char]].flatMap((part) => encodeChar(part, map));
  }
  // An accented letter the table lacks: its base letter (Ő -> O).
  const base = char.normalize('NFD').replace(/\p{M}/gu, '');
  if (base !== char && base.length > 0) {
    return [...base].flatMap((part) => encodeChar(part, map));
  }
  return [0x3f]; // "?"
}

/**
 * Encode one line (no line break inside) for the code page.
 * @param {string} line
 * @param {string} codePage key of CODE_PAGES
 * @returns {{ bytes: number[], unknown: number }} `unknown`: characters printed as "?"
 */
export function encodeLine(line, codePage) {
  const map = byteMap(codePage);
  const bytes = [];
  let unknown = 0;
  for (const char of line) {
    const encoded = encodeChar(char, map);
    if (encoded.length === 1 && encoded[0] === 0x3f && char !== '?') {
      unknown += 1;
    }
    bytes.push(...encoded);
  }
  return { bytes, unknown };
}

/**
 * Word-wrap encoded bytes at `columns` (one byte = one column on a printer in
 * a single-byte code page). A word longer than a line is cut.
 * @param {number[]} bytes one line, without line break
 * @param {number} columns
 * @returns {number[][]}
 */
const trimSpaces = (bytes) => {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0x20) {
    end -= 1;
  }
  return bytes.slice(0, end);
};

export function wrapBytes(bytes, columns) {
  const lines = [];
  let rest = bytes;
  while (rest.length > columns) {
    let cut = rest.lastIndexOf(0x20, columns);
    if (cut <= 0) {
      cut = columns;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    } else {
      lines.push(trimSpaces(rest.slice(0, cut)));
      rest = rest.slice(cut + 1);
      while (rest[0] === 0x20) {
        rest = rest.slice(1);
      }
    }
  }
  lines.push(rest);
  return lines;
}

/** Encode and wrap a multi-line text. */
function textLines(text, codePage, columns) {
  let unknown = 0;
  const lines = cleanText(text)
    .split('\n')
    .flatMap((line) => {
      const encoded = encodeLine(line.trimEnd(), codePage);
      unknown += encoded.unknown;
      return wrapBytes(encoded.bytes, columns);
    });
  return { lines, unknown };
}

// QR code: model 2, error correction M. The data is sent as UTF-8 bytes (a
// URL is ASCII anyway); the printers store at most a few hundred bytes.
export const QR_MAX_BYTES = 500;

/** GS ( k commands that store and print a QR code. */
export function qrCommands(data, moduleSize) {
  const payload = [...Buffer.from(data, 'utf8')];
  const length = payload.length + 3;
  return [
    ...[GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00], // model 2
    ...[GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize], // module size in dots
    ...[GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31], // error correction M
    ...[GS, 0x28, 0x6b, length & 0xff, length >> 8, 0x31, 0x50, 0x30, ...payload], // store
    ...[GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30], // print
  ];
}

export const TITLE_STYLES = {
  large: { size: COMMANDS.SIZE_LARGE, widthFactor: 2 },
  tall: { size: COMMANDS.SIZE_TALL, widthFactor: 1 },
  bold: { size: COMMANDS.SIZE_NORMAL, widthFactor: 1 },
};

/**
 * Build a whole ticket.
 * @param {object} ticket
 * @param {string} [ticket.title]
 * @param {'large'|'tall'|'bold'} [ticket.titleStyle]
 * @param {string} [ticket.date] already formatted
 * @param {string} ticket.message
 * @param {string} [ticket.qr]
 * @param {object} options
 * @param {number} options.columns characters per line in the normal font
 * @param {string} options.codePage key of CODE_PAGES
 * @param {boolean} options.cut
 * @returns {{ bytes: Buffer, lines: number, unknown: number }}
 */
export function buildTicket(ticket, { columns, codePage, cut }) {
  const out = [...COMMANDS.INIT, ...COMMANDS.CHARSET_USA];
  const escT = CODE_PAGES[codePage]?.escT;
  if (escT !== null && escT !== undefined) {
    out.push(ESC, 0x74, escT);
  }
  let lineCount = 0;
  let unknown = 0;
  const pushLines = (lines) => {
    for (const line of lines) {
      out.push(...line, 0x0a);
      lineCount += 1;
    }
  };

  const title = cleanText(ticket.title).trim();
  if (title !== '') {
    const style = TITLE_STYLES[ticket.titleStyle] ?? TITLE_STYLES.large;
    const encoded = textLines(title, codePage, Math.floor(columns / style.widthFactor));
    unknown += encoded.unknown;
    out.push(...COMMANDS.ALIGN_CENTER, ...COMMANDS.BOLD_ON, ...style.size);
    pushLines(encoded.lines);
    out.push(...COMMANDS.SIZE_NORMAL, ...COMMANDS.BOLD_OFF);
  }
  if (ticket.date) {
    out.push(...COMMANDS.ALIGN_CENTER);
    const encoded = textLines(ticket.date, codePage, columns);
    unknown += encoded.unknown;
    pushLines(encoded.lines);
  }
  if (title !== '' || ticket.date) {
    out.push(...COMMANDS.ALIGN_LEFT);
    pushLines([new Array(columns).fill(0x2d)]); // a row of dashes
  }

  out.push(...COMMANDS.ALIGN_LEFT);
  const body = textLines(ticket.message, codePage, columns);
  unknown += body.unknown;
  pushLines(body.lines);

  // Real-time commands (DLE DC4: open the drawer, power off) run even inside
  // the data of another command: the QR content loses its controls too.
  const qr = cleanText(ticket.qr).replace(/\n/g, ' ').trim();
  if (qr !== '') {
    out.push(0x0a, ...COMMANDS.ALIGN_CENTER, ...qrCommands(qr, columns >= 42 ? 6 : 4));
    out.push(...COMMANDS.ALIGN_LEFT);
  }

  if (cut) {
    out.push(...feed(3), ...COMMANDS.CUT);
  } else {
    // No cutter: enough paper out to tear the ticket off above the text.
    out.push(...feed(5));
  }
  return { bytes: Buffer.from(out), lines: lineCount, unknown };
}
