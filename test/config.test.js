import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parsePrinters } from '../src/config.js';

test('the printer list: separators, ports, IPv6, schemes, duplicates, invalid entries', () => {
  assert.deepEqual(
    parsePrinters(
      ' 192.0.2.10,192.0.2.10:9100 ;Printer.LOCAL:9101\n[2001:db8::1] tcp://192.0.2.12 ',
    ),
    {
      targets: [
        { host: '192.0.2.10', port: 9100 },
        { host: 'printer.local', port: 9101 },
        { host: '2001:db8::1', port: 9100 },
        { host: '192.0.2.12', port: 9100 },
      ],
      invalid: [],
    },
  );
  assert.deepEqual(parsePrinters('x:0, y:70000, http://a/b, -bad').invalid, [
    'x:0',
    'y:70000',
    'http://a/b',
    '-bad',
  ]);
  assert.deepEqual(parsePrinters(undefined), { targets: [], invalid: [] });
});

test('normalization falls back to the defaults on unknown values', () => {
  assert.deepEqual(
    normalizeConfig({ paper_width: 58, code_page: 'koi8', cut: 'yes', language: 'it' }),
    {
      printers: '',
      paper_width: '58',
      code_page: 'cp858',
      cut: true,
      status_query: true,
      language: 'fr',
    },
  );
  assert.equal(normalizeConfig(null).paper_width, '80');
});
