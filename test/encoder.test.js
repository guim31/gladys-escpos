// -----------------------------------------------------------------------------
// The ESC/POS bytes: accents in each code page, what no table has, control
// characters of a scene variable, line wrapping, title, QR code and cut.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE_PAGES } from '../src/escpos/codepages.js';
import {
  COMMANDS,
  buildTicket,
  cleanText,
  encodeLine,
  qrCommands,
  wrapBytes,
} from '../src/escpos/encoder.js';

const bytesOf = (text, codePage) => encodeLine(text, codePage).bytes;
const contains = (haystack, needle) => Buffer.from(haystack).includes(Buffer.from(needle));
const options = { columns: 48, codePage: 'cp858', cut: true };

test('French, German and Spanish letters map to the bytes of PC858', () => {
  // Reference bytes of IBM code page 858 (Python codecs, Epson table 19).
  assert.deepEqual(bytesOf('éèàçù', 'cp858'), [0x82, 0x8a, 0x85, 0x87, 0x97]);
  assert.deepEqual(bytesOf('ÉÀÇ', 'cp858'), [0x90, 0xb7, 0x80]);
  assert.deepEqual(bytesOf('äöüß', 'cp858'), [0x84, 0x94, 0x81, 0xe1]);
  assert.deepEqual(bytesOf('ñ¿¡', 'cp858'), [0xa4, 0xa8, 0xad]);
  assert.deepEqual(bytesOf('€', 'cp858'), [0xd5]);
  assert.deepEqual(bytesOf('«»°', 'cp858'), [0xae, 0xaf, 0xf8]);
});

test('each code page has its own bytes, and spells what it lacks', () => {
  assert.deepEqual(bytesOf('é€œ', 'wpc1252'), [0xe9, 0x80, 0x9c]);
  // PC850 has no euro sign (PC858 replaced the dotless i with it).
  assert.deepEqual(bytesOf('€', 'cp850'), [...Buffer.from('EUR')]);
  // PC437 has é but not À: its base letter.
  assert.deepEqual(bytesOf('éÀ', 'cp437'), [0x82, 0x41]);
  // No table at all: plain ASCII.
  assert.deepEqual(bytesOf('Crème brûlée, œuf', 'ascii'), [...Buffer.from('Creme brulee, oeuf')]);
});

test('typography and characters outside every table never print garbage', () => {
  const { bytes, unknown } = encodeLine('L’été… « 21 °C » – ok 🙂 中', 'cp858');
  assert.equal(Buffer.from(bytes).toString('latin1').length, bytes.length);
  assert.ok(bytes.every((byte) => byte >= 0x20));
  assert.equal(unknown, 2); // the emoji and the Chinese character
  assert.ok(contains(bytes, [0x4c, 0x27, 0x82])); // L'é
  assert.ok(contains(bytes, Buffer.from('...')));
});

test('a scene variable cannot inject printer commands', () => {
  const evil = 'A\u001b@\u001dV\u0000B\u0010\u0004\u0001C\u007f';
  const bytes = bytesOf(cleanText(evil), 'cp858');
  assert.deepEqual(Buffer.from(bytes).toString('latin1'), 'A@VBC');
  const ticket = buildTicket({ message: evil }, options).bytes;
  // The only ESC and GS bytes are the integration's own commands.
  const body = ticket.subarray(ticket.indexOf(Buffer.from([0x1b, 0x61, 0x00])) + 3);
  assert.equal(body.toString('latin1').split('\n')[0], 'A@VBC');
});

test('line breaks: real ones, \\r\\n and the two characters \\n of a scene field', () => {
  assert.equal(cleanText('a\r\nb\\nc\rd\u2028e\tf'), 'a\nb\nc\nd\ne f');
  assert.equal(cleanText('a\u202f:\u00a0b'), 'a : b');
});

test('word wrap at the column count, long words cut', () => {
  const lines = wrapBytes([...Buffer.from('one two three four')], 9).map((line) =>
    Buffer.from(line).toString(),
  );
  assert.deepEqual(lines, ['one two', 'three', 'four']);
  const long = wrapBytes([...Buffer.from('abcdefghijkl')], 5).map((line) =>
    Buffer.from(line).toString(),
  );
  assert.deepEqual(long, ['abcde', 'fghij', 'kl']);
});

test('a ticket: init, code page, centred large title, dashes, text, cut', () => {
  const { bytes, lines } = buildTicket(
    { title: 'Courses', titleStyle: 'large', date: 'lundi', message: 'Lait\nPain' },
    options,
  );
  assert.deepEqual([...bytes.subarray(0, 8)], [0x1b, 0x40, 0x1b, 0x52, 0x00, 0x1b, 0x74, 19]);
  assert.ok(
    contains(bytes, [...COMMANDS.ALIGN_CENTER, ...COMMANDS.BOLD_ON, ...COMMANDS.SIZE_LARGE]),
  );
  assert.ok(contains(bytes, '-'.repeat(48)));
  assert.ok(contains(bytes, 'Lait\nPain\n'));
  assert.deepEqual([...bytes.subarray(-7)], [0x1b, 0x64, 3, ...COMMANDS.CUT]);
  assert.equal(lines, 5);
});

test('a large title wraps at half the columns', () => {
  const { bytes } = buildTicket(
    { title: 'x'.repeat(30), message: 'y' },
    { ...options, columns: 32 },
  );
  assert.ok(contains(bytes, `${'x'.repeat(16)}\n${'x'.repeat(14)}\n`));
});

test('without cutter, the paper is fed out instead of cut', () => {
  const { bytes } = buildTicket({ message: 'x' }, { ...options, cut: false });
  assert.deepEqual([...bytes.subarray(-3)], [0x1b, 0x64, 5]);
  assert.ok(!contains(bytes, COMMANDS.CUT));
});

test('ASCII mode sends no ESC t', () => {
  const { bytes } = buildTicket({ message: 'x' }, { ...options, codePage: 'ascii' });
  assert.ok(!contains(bytes, [0x1b, 0x74]));
});

test('QR code: GS ( k store and print, length in two bytes', () => {
  const data = 'https://example.com/' + 'a'.repeat(300);
  const commands = Buffer.from(qrCommands(data, 6));
  const store = commands.indexOf(Buffer.from([0x31, 0x50, 0x30])) - 5; // fn 80: store
  const length = commands[store + 3] + commands[store + 4] * 256;
  assert.equal(length, data.length + 3);
  assert.ok(commands.includes(Buffer.from(data)));
  assert.deepEqual([...commands.subarray(-8)], [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);
});

test('the code page tables have 128 entries and the expected ESC t numbers', () => {
  for (const [key, page] of Object.entries(CODE_PAGES)) {
    if (key !== 'ascii') {
      assert.equal([...page.high].length, 128, key);
    }
  }
  assert.deepEqual(
    Object.fromEntries(Object.entries(CODE_PAGES).map(([key, page]) => [key, page.escT])),
    { cp437: 0, cp850: 2, cp858: 19, wpc1252: 16, ascii: null },
  );
});

// Bytes recorded by a fake printer container from the integration image (see
// test/fixtures/tickets/render.py, which decodes and renders them as
// test/fixtures/rendered-tickets.png): the encoder must keep producing them.
test('the recorded tickets are produced byte for byte', async () => {
  const { readFile } = await import('node:fs/promises');
  const fixture = (name) => readFile(new URL(`./fixtures/tickets/${name}`, import.meta.url));
  const full = buildTicket(
    {
      title: 'Liste de courses',
      titleStyle: 'large',
      date: 'lundi 16 novembre 2026 à 17:09',
      message:
        'Lait demi-écrémé\\nPain complet\\nCafé, thé, crème brûlée\\nÀ prendre : œufs, 2 € de pâté « maison »\\nGrüße aus München, ¿qué tal? ñandú\\nHors table : 🙂 中文 ≠ ✓',
      qr: 'https://gladysassistant.com',
    },
    options,
  );
  assert.deepEqual(full.bytes, await fixture('ready-01.bin'));
  const tall = buildTicket(
    { title: 'Bonjour la famille', titleStyle: 'tall', message: 'Je rentre à 19 h.\\nBisous' },
    options,
  );
  assert.deepEqual(tall.bytes, await fixture('ready-02.bin'));
});

test('decomposed accents, soft hyphens and emoji variation selectors', () => {
  // "Cafe" + combining acute accent, as macOS and some APIs send it.
  assert.equal(cleanText('Cafe\u0301 ok'), 'Caf\u00e9 ok');
  assert.equal(cleanText('ab\u00adcd'), 'abcd');
  assert.equal(encodeLine(cleanText('\u2764\ufe0f'), 'cp858').unknown, 1);
});

test('the QR code content loses its control characters (no DLE DC4 to the printer)', () => {
  const { bytes } = buildTicket({ message: 'x', qr: 'a\u0010\u0014\u0001\u0000\u0005b' }, options);
  assert.ok(!bytes.includes(Buffer.from([0x10, 0x14])));
  assert.ok(bytes.includes(Buffer.from('ab')));
});

test('wrapped lines neither end nor start with spaces', () => {
  const lines = wrapBytes([...Buffer.from('aaa  bbb')], 4).map((line) =>
    Buffer.from(line).toString(),
  );
  assert.deepEqual(lines, ['aaa', 'bbb']);
  const indented = wrapBytes([...Buffer.from('  xxxxxxxx')], 5).map((line) =>
    Buffer.from(line).toString(),
  );
  assert.ok(
    indented.every((line) => line.trim() !== ''),
    JSON.stringify(indented),
  );
});
