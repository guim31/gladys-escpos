// -----------------------------------------------------------------------------
// Integration configuration: defaults (mirroring the manifest `config_schema`)
// and normalization, so the rest of the code never deals with `undefined`.
// -----------------------------------------------------------------------------

import { CODE_PAGE_KEYS } from './escpos/codepages.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Characters per line in the normal font (font A, 12 × 24 dots).
export const PAPER_WIDTHS = {
  58: 32,
  80: 48,
  '80_42': 42,
};

export const DEFAULT_PORT = 9100;

export const DEFAULT_CONFIG = {
  printers: '',
  paper_width: '80',
  code_page: 'cp858',
  cut: true,
  status_query: true,
  language: 'fr',
};

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

/**
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = raw ?? {};
  return {
    printers: typeof config.printers === 'string' ? config.printers : DEFAULT_CONFIG.printers,
    paper_width: Object.hasOwn(PAPER_WIDTHS, String(config.paper_width))
      ? String(config.paper_width)
      : DEFAULT_CONFIG.paper_width,
    code_page: CODE_PAGE_KEYS.includes(config.code_page)
      ? config.code_page
      : DEFAULT_CONFIG.code_page,
    cut: bool(config.cut, DEFAULT_CONFIG.cut),
    status_query: bool(config.status_query, DEFAULT_CONFIG.status_query),
    language: LANGUAGES.includes(config.language) ? config.language : DEFAULT_CONFIG.language,
  };
}

/** Characters per line of the configured paper. */
export const columnsOf = (config) => PAPER_WIDTHS[config.paper_width];

/**
 * Parse the printer list: addresses separated by commas, semicolons, spaces or
 * line breaks, each `host` or `host:port` (IPv6 between brackets).
 * @param {string} list
 * @returns {{ targets: { host: string, port: number }[], invalid: string[] }}
 */
export function parsePrinters(list) {
  const targets = [];
  const invalid = [];
  const seen = new Set();
  for (const entry of String(list ?? '').split(/[\s,;]+/)) {
    const raw = entry.trim().replace(/^(tcp|socket|raw):\/\//i, '');
    if (raw === '') {
      continue;
    }
    const match =
      raw.match(/^\[([0-9a-f:.]+)\](?::(\d+))?$/i) ??
      raw.match(/^([a-z0-9][a-z0-9.-]*)(?::(\d+))?$/i);
    const port = match?.[2] === undefined ? DEFAULT_PORT : Number(match[2]);
    if (!match || !Number.isInteger(port) || port < 1 || port > 65535) {
      invalid.push(raw);
      continue;
    }
    const host = match[1].toLowerCase();
    const key = `${host}:${port}`;
    if (!seen.has(key)) {
      seen.add(key);
      targets.push({ host, port });
    }
  }
  return { targets, invalid };
}
