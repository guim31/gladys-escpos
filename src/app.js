// -----------------------------------------------------------------------------
// Wiring of the integration: every SDK handler, registered on a Gladys client.
//
// index.js passes the real `new GladysIntegration()`; the tests pass the fake
// Gladys of the SDK with a fake printer (a TCP server on the loopback), a
// fixed clock and an in-memory counter store.
//
// - Discovery: one device per address of the configuration.
// - Sampling: every created printer is checked once a minute by the
//   container's own timer (Gladys 5.2.0 never polls a device created without
//   should_poll, GladysAssistant/Gladys#3198); onPoll stays as a fallback and
//   skips a printer checked less than 30 s ago.
// - Printing: the scene action `print_ticket`, the action `test_print` and
//   the widget buttons. Every failure is thrown (red in Gladys); a failed
//   scene print also fires `print_failed`, at most once per printer every
//   15 minutes, so a scene answering it with another print cannot loop.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { columnsOf, normalizeConfig, parsePrinters } from './config.js';
import {
  addressOf,
  buildDevice,
  buildStates,
  isPrinterDevice,
  platformId,
  statusKey,
  targetOf,
} from './device.js';
import { QR_MAX_BYTES, buildTicket } from './escpos/encoder.js';
import { PrinterError, PrinterQueue, exchange } from './escpos/printer.js';
import { CounterStore } from './store.js';
import {
  ACTION_TEXT,
  ActionFailure,
  CONNECTION_TEXT,
  ERROR_TEXT,
  SAMPLE_CHARACTERS,
  TEST_TICKET,
  fill,
} from './texts.js';
import { WIDGET_ACTION, WIDGET_KEY, buildWidgetContent } from './widgets.js';

const logger = createLogger({ name: 'escpos' });

export const ACTION_KEY = 'test_print';
export const SCENE_ACTION_KEY = 'print_ticket';
export const TRIGGER_KEY = 'print_failed';
export const SCENE_TRIGGER_KEYS = [TRIGGER_KEY];

export const SAMPLING_MS = 60_000;
export const ON_POLL_SKIP_MS = SAMPLING_MS / 2;
export const FAILURE_EVENT_INTERVAL_MS = 15 * 60 * 1000;
// An unchanged state is sent again after this long, so Gladys never shows
// "no recent value" on a printer that stays ready for days.
export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
// What a scene variable may push into one ticket: a long text is cut there.
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_TITLE_CHARS = 200;

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** The date line of a ticket, in the configured language and the Gladys time zone. */
export function formatDate(date, language) {
  return new Intl.DateTimeFormat(LOCALES[language], {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}

const errorKind = (err) => (err instanceof PrinterError ? err.kind : 'error');
const errorText = (err) => ERROR_TEXT[errorKind(err)] ?? ERROR_TEXT.error;

/**
 * @param {object} gladys GladysIntegration, or the SDK fake in tests
 * @param {object} [deps] test seams
 * @param {Function} [deps.connect] net.connect replacement
 * @param {object} [deps.timeouts] printer timeouts (connect, status, send)
 * @param {() => Date} [deps.now]
 * @param {CounterStore} [deps.store]
 * @param {typeof setTimeout} [deps.setTimer]
 * @param {typeof clearTimeout} [deps.clearTimer]
 */
export function registerIntegration(gladys, deps = {}) {
  const {
    connect,
    timeouts,
    now = () => new Date(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = deps;
  const store = deps.store ?? new CounterStore({ now });
  const loaded = store.load();
  const queue = new PrinterQueue();

  let config = normalizeConfig();
  let timer = null;
  let generation = 0;
  const samples = new Map(); // device external_id -> { online, status, at }
  const lastFailureEvent = new Map(); // device external_id -> time
  const offline = new Set(); // printers whose last check failed (logged once)

  const ourDevices = () =>
    (gladys.devices ?? []).filter((device) => isPrinterDevice(gladys, device));
  const keyOf = (target) => platformId(target);

  function refreshWidget() {
    try {
      gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh not requested: ${err.message}`);
    }
  }

  async function publish(states) {
    try {
      await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    } catch (err) {
      logger.warn(`States not published: ${err.message}`);
    }
  }

  function noteReachability(device, online, err) {
    const name = device.name ?? device.external_id;
    if (!online && !offline.has(device.external_id)) {
      offline.add(device.external_id);
      logger.warn(`${name} does not answer (${err?.message}); checking silently until it is back`);
    } else if (online && offline.delete(device.external_id)) {
      logger.info(`${name} answers again`);
    }
  }

  /** Remember a sample, publish what changed, nudge the widget on a change of status. */
  async function record(device, target, sample) {
    const previous = samples.get(device.external_id);
    samples.set(device.external_id, { ...sample, at: now().getTime() });
    await loaded;
    await publish(
      buildStates(gladys, target, sample, {
        language: config.language,
        tickets: store.get(device.external_id).total,
      }),
    );
    if (!previous || statusKey(previous) !== statusKey(sample)) {
      refreshWidget();
    }
  }

  /** Check one created printer. Never throws. */
  async function sample(device) {
    const target = targetOf(device);
    if (!target) {
      logger.debug(`${device.external_id}: no address in the device params`);
      return;
    }
    samples.set(device.external_id, {
      ...(samples.get(device.external_id) ?? {}),
      at: now().getTime(),
    });
    let result;
    try {
      const status = await queue.run(keyOf(target), () =>
        exchange(target, { query: config.status_query, connect, timeouts }),
      );
      result = { online: true, status };
      noteReachability(device, true);
    } catch (err) {
      if (err instanceof PrinterError && err.kind === 'error') {
        // It answered, then closed: busy with another client (a till), so
        // reachable, its paper unknown this time.
        result = { online: true, status: { answered: false } };
        noteReachability(device, true);
      } else {
        result = { online: false };
        noteReachability(device, false, err);
      }
    }
    await record(device, target, result);
  }

  async function sampleAll({ skipRecent = false } = {}) {
    for (const device of ourDevices()) {
      const last = samples.get(device.external_id)?.at;
      if (skipRecent && last !== undefined && now().getTime() - last < ON_POLL_SKIP_MS) {
        continue;
      }
      await sample(device);
    }
  }

  function stopLoop() {
    generation += 1;
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
  }

  function startLoop() {
    stopLoop();
    const current = generation;
    const tick = () => {
      timer = setTimer(async () => {
        timer = null;
        await sampleAll({ skipRecent: true }).catch((err) => logger.error('Sampling failed', err));
        if (current === generation) {
          tick();
        }
      }, SAMPLING_MS);
      timer?.unref?.();
    };
    tick();
  }

  // --- Printing ----------------------------------------------------------------

  /**
   * Print one ticket on a created printer, or on an address of the configuration.
   * @returns {Promise<{ total: number, today: number }>} the counters after it
   * @throws {PrinterError}
   */
  async function printOn(device, target, ticket) {
    const { bytes, unknown } = buildTicket(ticket, {
      columns: columnsOf(config),
      codePage: config.code_page,
      cut: config.cut,
    });
    let status;
    try {
      status = await queue.run(keyOf(target), () =>
        exchange(target, {
          query: config.status_query,
          payload: bytes,
          connect,
          timeouts,
          beforeSend: (answer) => {
            // Paper out or cover open: the printer would keep the job and
            // print it hours later, or drop it. Say it now instead.
            if (answer.paper === 'out') {
              throw new PrinterError('paper_out', 'Out of paper');
            }
            if (answer.coverOpen) {
              throw new PrinterError('cover_open', 'Cover open');
            }
          },
        }),
      );
    } catch (err) {
      if (device) {
        const reachable = err.kind === 'paper_out' || err.kind === 'cover_open';
        noteReachability(device, reachable, err);
        await record(
          device,
          target,
          reachable
            ? {
                online: true,
                status: {
                  answered: true,
                  paper: err.kind === 'paper_out' ? 'out' : 'ok',
                  coverOpen: err.kind === 'cover_open',
                  error: false,
                },
              }
            : { online: false },
        );
      }
      throw err;
    }
    await loaded;
    const id = device?.external_id ?? gladys.externalIds('printer', platformId(target)).device;
    const counts = store.increment(id);
    if (unknown > 0) {
      logger.debug(`${unknown} character(s) printed as "?" (not in ${config.code_page})`);
    }
    if (device) {
      noteReachability(device, true);
      await record(device, target, { online: true, status });
    }
    return counts;
  }

  function findDevice(externalId) {
    const device = ourDevices().find((candidate) => candidate.external_id === externalId);
    const target = device && targetOf(device);
    if (!target) {
      throw new ActionFailure(ERROR_TEXT.unknown_printer);
    }
    return { device, target };
  }

  /** Validate and shape the fields of a ticket. */
  function ticketOf(fields) {
    let message = String(fields?.message ?? '');
    if (message.trim() === '') {
      throw new ActionFailure(ERROR_TEXT.empty);
    }
    if ([...message].length > MAX_MESSAGE_CHARS) {
      message = `${[...message].slice(0, MAX_MESSAGE_CHARS).join('')}…`;
    }
    const qr = String(fields?.qr_code ?? '').trim();
    if (Buffer.byteLength(qr, 'utf8') > QR_MAX_BYTES) {
      throw new ActionFailure(ERROR_TEXT.qr_too_long);
    }
    return {
      title: [...String(fields?.title ?? '')].slice(0, MAX_TITLE_CHARS).join(''),
      titleStyle: fields?.title_style,
      date: fields?.print_date === true ? formatDate(now(), config.language) : undefined,
      message,
      qr,
    };
  }

  async function fireFailure(device, err) {
    const last = lastFailureEvent.get(device.external_id);
    if (last !== undefined && now().getTime() - last < FAILURE_EVENT_INTERVAL_MS) {
      return;
    }
    lastFailureEvent.set(device.external_id, now().getTime());
    try {
      await gladys.publishSceneEvent(TRIGGER_KEY, {
        printer: device.external_id,
        printer_name: device.name ?? '',
        reason: errorKind(err),
        error: errorText(err)[config.language],
      });
    } catch (error) {
      logger.warn(`Trigger ${TRIGGER_KEY} not fired: ${error.message}`);
    }
  }

  const testTicket = () => ({
    title: TEST_TICKET.title[config.language],
    titleStyle: 'large',
    date: formatDate(now(), config.language),
    message: `${TEST_TICKET.message[config.language]}\n\n${TEST_TICKET.characters[config.language]}\n${SAMPLE_CHARACTERS}`,
    qr: 'https://gladysassistant.com',
  });

  // --- Handlers ------------------------------------------------------------------

  gladys.onSceneAction(SCENE_ACTION_KEY, async (fields) => {
    const { device, target } = findDevice(fields?.printer);
    const ticket = ticketOf(fields);
    try {
      const counts = await printOn(device, target, ticket);
      logger.info(`Ticket printed on ${device.name ?? addressOf(target)} (scene)`);
      return { ticket_number: counts.total };
    } catch (err) {
      logger.warn(
        `Scene ticket not printed on ${device.name ?? addressOf(target)}: ${err.message}`,
      );
      await fireFailure(device, err);
      throw new ActionFailure(errorText(err));
    }
  });

  gladys.onAction(ACTION_KEY, async () => {
    const { targets, invalid } = parsePrinters(config.printers);
    if (targets.length === 0) {
      throw new ActionFailure(
        invalid.length > 0
          ? fill(CONNECTION_TEXT.invalid, { list: invalid.join(', ') })
          : ERROR_TEXT.no_printer,
      );
    }
    const printed = [];
    const failed = [];
    for (const target of targets) {
      const device = ourDevices().find(
        (candidate) =>
          candidate.external_id === gladys.externalIds('printer', platformId(target)).device,
      );
      try {
        await printOn(device, target, testTicket());
        printed.push(addressOf(target));
      } catch (err) {
        failed.push(
          fill(ACTION_TEXT.failed, { printer: addressOf(target), error: errorText(err) }),
        );
      }
    }
    logger.info(`Test ticket: ${printed.length} printed, ${failed.length} failed`);
    if (failed.length > 0) {
      throw new ActionFailure(
        Object.fromEntries(
          Object.keys(ERROR_TEXT.error).map((lang) => [
            lang,
            failed.map((text) => text[lang]).join(' '),
          ]),
        ),
      );
    }
    return fill(ACTION_TEXT.printed, { printers: printed.join(', ') });
  });

  gladys.onWidgetGet(WIDGET_KEY, async ({ settings, language }) => {
    await loaded;
    return buildWidgetContent({
      devices: ourDevices(),
      settings: settings ?? {},
      language,
      samples,
      counters: (id) => store.get(id),
    });
  });

  gladys.onWidgetAction(WIDGET_KEY, async (actionKey, params, context) => {
    const { device, target } = findDevice(params?.printer);
    const name = device.name ?? addressOf(target);
    let ticket;
    if (actionKey === WIDGET_ACTION.TEST) {
      ticket = testTicket();
    } else if (actionKey === WIDGET_ACTION.PRINT) {
      ticket = ticketOf({ ...context?.values, title_style: 'tall', print_date: true });
    } else {
      throw new ActionFailure(ERROR_TEXT.error);
    }
    try {
      await printOn(device, target, ticket);
    } catch (err) {
      throw new ActionFailure(errorText(err));
    }
    logger.info(`Ticket printed on ${name} (widget)`);
    return fill(ACTION_TEXT.printed, { printers: name });
  });

  gladys.onPoll(async (device) => {
    if (!isPrinterDevice(gladys, device)) {
      return;
    }
    const last = samples.get(device.external_id)?.at;
    if (last !== undefined && now().getTime() - last < ON_POLL_SKIP_MS) {
      return;
    }
    await sample(device);
  });

  gladys.onDeviceCreated(async (device) => {
    if (!isPrinterDevice(gladys, device)) {
      return;
    }
    // Everything again: Gladys dropped the states sent before the creation.
    await sample(device);
    refreshWidget();
  });
  gladys.onDeviceUpdated(async () => refreshWidget());
  gladys.onDeviceDeleted(async () => refreshWidget());

  async function publishDevices() {
    const { targets, invalid } = parsePrinters(config.printers);
    await gladys.publishDiscoveredDevices(
      targets.map((target) => buildDevice(gladys, target, config.language)),
    );
    if (invalid.length > 0) {
      logger.warn(`Invalid printer addresses ignored: ${invalid.join(', ')}`);
      await gladys.setConnectionStatus(
        false,
        fill(CONNECTION_TEXT.invalid, { list: invalid.join(', ') }),
      );
    } else if (targets.length === 0) {
      await gladys.setConnectionStatus(true, CONNECTION_TEXT.no_printer);
    } else {
      await gladys.setConnectionStatus(true);
    }
    return targets.length;
  }

  gladys.onScanRequest(async () => {
    await publishDevices();
  });

  gladys.onConfigUpdated(async (raw) => {
    config = normalizeConfig(raw);
    logger.info('Configuration updated');
    await publishDevices();
    await sampleAll();
    startLoop();
  });

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      const count = await publishDevices();
      logger.info(`${count} printer(s) configured, ${ourDevices().length} added in Gladys`);
      await sampleAll();
      startLoop();
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, CONNECTION_TEXT.init_failed).catch(() => {});
    }
  });

  gladys.on('disconnected', () => stopLoop());

  return {
    stop: async () => {
      stopLoop();
      await store.saving;
    },
    isLoopArmed: () => timer !== null,
  };
}
