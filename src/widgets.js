// -----------------------------------------------------------------------------
// Dashboard widget `ticket_printer`: status of the printers and tickets of the
// day; for one printer, two buttons: print a note typed on the dashboard (a
// form behind the tap, Gladys 5.2+) and a test ticket. Built from the last
// samples: rendering never connects to a printer.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { statusKey } from './device.js';
import { STATUS_TEXT, WIDGET_TEXT } from './texts.js';

export const WIDGET_KEY = 'ticket_printer';
export const WIDGET_ACTION = { PRINT: 'print_note', TEST: 'print_test' };

const STATUS_COLOR = {
  ready: WIDGET_COLORS.SUCCESS,
  paper_low: WIDGET_COLORS.WARNING,
  unknown: WIDGET_COLORS.INFO,
  paper_out: WIDGET_COLORS.DANGER,
  cover_open: WIDGET_COLORS.DANGER,
  error: WIDGET_COLORS.DANGER,
  offline: WIDGET_COLORS.DANGER,
};

const cut = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function statusItem(device, sample, language) {
  const key = sample && sample.online !== undefined ? statusKey(sample) : null;
  return {
    label: cut(device.name ?? device.external_id, 40),
    value: key ? STATUS_TEXT[key][language] : '—',
    color: key ? STATUS_COLOR[key] : WIDGET_COLORS.NEUTRAL,
  };
}

/**
 * @param {object} input
 * @param {object[]} input.devices the created printers (Gladys names)
 * @param {{ printer?: string, show_print_button?: boolean, show_test_button?: boolean }} input.settings
 * @param {string} input.language
 * @param {Map<string, object>} input.samples last sample per device external_id
 * @param {(id: string) => { total: number, today: number }} input.counters
 */
export function buildWidgetContent({ devices, settings, language, samples, counters }) {
  const lang = ['en', 'fr', 'de', 'es'].includes(language) ? language : 'en';
  const chosen = typeof settings.printer === 'string' && settings.printer !== '';
  const shown = chosen
    ? devices.filter((device) => device.external_id === settings.printer)
    : devices.slice(0, 10);
  if (shown.length === 0) {
    return {
      ttl_seconds: 300,
      components: [
        {
          type: 'text',
          text: chosen && devices.length > 0 ? WIDGET_TEXT.missing : WIDGET_TEXT.empty,
        },
      ],
    };
  }
  const counts = shown.map((device) => counters(device.external_id));
  const sum = (key) => counts.reduce((total, count) => total + count[key], 0);
  const components = [
    { type: 'value', label: WIDGET_TEXT.today, value: sum('today'), icon: 'file-text' },
    { type: 'value', label: WIDGET_TEXT.total, value: sum('total'), icon: 'printer' },
    {
      type: 'status',
      items: shown.map((device) => statusItem(device, samples.get(device.external_id), lang)),
    },
  ];
  if (shown.length === 1) {
    const printer = shown[0].external_id;
    if (settings.show_print_button !== false) {
      components.push({
        type: 'button',
        label: WIDGET_TEXT.print,
        icon: 'edit-3',
        style: 'secondary',
        action: {
          key: WIDGET_ACTION.PRINT,
          params: { printer },
          fields: [
            { key: 'title', type: 'string', required: false, label: WIDGET_TEXT.title },
            { key: 'message', type: 'string', required: true, label: WIDGET_TEXT.message },
          ],
        },
      });
    }
    if (settings.show_test_button !== false) {
      components.push({
        type: 'button',
        label: WIDGET_TEXT.test,
        icon: 'printer',
        style: 'secondary',
        action: { key: WIDGET_ACTION.TEST, params: { printer } },
      });
    }
  }
  return { ttl_seconds: 60, components };
}
