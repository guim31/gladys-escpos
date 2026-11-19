// -----------------------------------------------------------------------------
// One Gladys device per printer of the configuration.
//
// The platform id is the address the user typed (host and port): an ESC/POS
// printer reports no serial number over the raw port. Its features:
//   - online      input/binary   1 = the printer accepts a connection
//   - paper_low   input/binary   1 = the near-end sensor sees the end of the roll
//   - paper_out   input/binary   1 = no paper (printing stopped)
//   - status      text/text      ready, paper, cover, error, unreachable
//   - tickets     counter-sensor tickets printed by Gladys on it
// paper_low and paper_out are only published when the printer answers the
// real-time status (DLE EOT); `status` then says the paper is not reported.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { DEFAULT_PORT } from './config.js';
import { PAPER } from './escpos/printer.js';
import { DEVICE_NAME, FEATURE_NAMES, STATUS_TEXT } from './texts.js';

export const DEVICE_TYPE = 'printer';
export const POLL_FREQUENCY_MS = DEVICE_POLL_FREQUENCIES.EVERY_MINUTES;
export const PARAMS = { HOST: 'HOST', PORT: 'PORT' };

/** `192.0.2.10:9100` -> `192-0-2-10-9100`: only [a-z0-9-] in the id. */
export const platformId = ({ host, port }) =>
  `${host}-${port}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const idsOf = (gladys, target) => gladys.externalIds(DEVICE_TYPE, platformId(target));

export const addressOf = ({ host, port }) => {
  const shown = host.includes(':') ? `[${host}]` : host;
  return port === DEFAULT_PORT ? shown : `${shown}:${port}`;
};

const binary = (name, externalId) => ({
  name,
  external_id: externalId,
  category: DEVICE_FEATURE_CATEGORIES.INPUT,
  type: DEVICE_FEATURE_TYPES.INPUT.BINARY,
  min: 0,
  max: 1,
  read_only: true,
  has_feedback: false,
  keep_history: true,
});

/**
 * @param {object} gladys
 * @param {{ host: string, port: number }} target
 * @param {string} language
 */
export function buildDevice(gladys, target, language) {
  const ids = idsOf(gladys, target);
  return {
    name: `${DEVICE_NAME[language]} ${addressOf(target)}`,
    external_id: ids.device,
    model: 'ESC/POS',
    should_poll: true,
    poll_frequency: POLL_FREQUENCY_MS,
    params: [
      { name: PARAMS.HOST, value: target.host },
      { name: PARAMS.PORT, value: String(target.port) },
    ],
    features: [
      binary(FEATURE_NAMES.online[language], ids.feature('online')),
      binary(FEATURE_NAMES.paper_low[language], ids.feature('paper_low')),
      binary(FEATURE_NAMES.paper_out[language], ids.feature('paper_out')),
      {
        name: FEATURE_NAMES.status[language],
        external_id: ids.feature('status'),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        min: 0,
        max: 0,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: FEATURE_NAMES.tickets[language],
        external_id: ids.feature('tickets'),
        category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
        min: 0,
        max: 1000000,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    ],
  };
}

/** Is this Gladys device one of ours? */
export const isPrinterDevice = (gladys, device) =>
  typeof device?.external_id === 'string' &&
  device.external_id.startsWith(gladys.externalId(`${DEVICE_TYPE}:`)) &&
  device.external_id.split(':').length === 4;

/** The address of a created device, from its params. */
export function targetOf(device) {
  const param = (name) => device?.params?.find((entry) => entry.name === name)?.value;
  const host = param(PARAMS.HOST);
  const port = Number(param(PARAMS.PORT) ?? DEFAULT_PORT);
  if (typeof host !== 'string' || host === '' || !Number.isInteger(port)) {
    return null;
  }
  return { host, port };
}

/**
 * Key of the `STATUS_TEXT` describing a sample.
 * @param {{ online: boolean, status?: { answered: boolean, paper: string, coverOpen: boolean, error: boolean } }} sample
 */
export function statusKey(sample) {
  if (!sample.online) {
    return 'offline';
  }
  const status = sample.status;
  if (!status?.answered) {
    return 'unknown';
  }
  if (status.paper === PAPER.OUT) {
    return 'paper_out';
  }
  if (status.coverOpen) {
    return 'cover_open';
  }
  if (status.error) {
    return 'error';
  }
  return status.paper === PAPER.LOW ? 'paper_low' : 'ready';
}

/**
 * States of one sample (and of the ticket counter).
 * @returns {{ device_feature_external_id: string, state?: number, text?: string }[]}
 */
export function buildStates(gladys, target, sample, { language, tickets }) {
  const ids = idsOf(gladys, target);
  const states = [
    { device_feature_external_id: ids.feature('online'), state: sample.online ? 1 : 0 },
    {
      device_feature_external_id: ids.feature('status'),
      text: STATUS_TEXT[statusKey(sample)][language],
    },
  ];
  if (sample.online && sample.status?.answered) {
    states.push(
      {
        device_feature_external_id: ids.feature('paper_low'),
        state: sample.status.paper === PAPER.LOW || sample.status.paper === PAPER.OUT ? 1 : 0,
      },
      {
        device_feature_external_id: ids.feature('paper_out'),
        state: sample.status.paper === PAPER.OUT ? 1 : 0,
      },
    );
  }
  if (tickets !== undefined) {
    states.push({ device_feature_external_id: ids.feature('tickets'), state: tickets });
  }
  return states;
}
