// -----------------------------------------------------------------------------
// Test world: the SDK fake Gladys, the integration, and fake ESC/POS printers
// (TCP servers on the loopback) that record the bytes of every job and answer
// the real-time status like a printer in the chosen state.
// -----------------------------------------------------------------------------

import net from 'node:net';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerIntegration } from '../../src/app.js';
import { STATUS_QUERY } from '../../src/escpos/printer.js';
import { CounterStore } from '../../src/store.js';

// Answers to DLE EOT 2 then DLE EOT 4, as a printer in this state sends them.
export const PRINTER_STATES = {
  ready: [0x12, 0x12],
  paper_low: [0x12, 0x1e],
  paper_out: [0x32, 0x72],
  cover_open: [0x16, 0x12],
  silent: [],
};

export const FIXED_NOW = new Date('2026-11-16T08:30:00');

/** A fake printer on 127.0.0.1. */
export async function startPrinter(state = 'ready') {
  const printer = { state, jobs: [], connections: 0 };
  const server = net.createServer((socket) => {
    printer.connections += 1;
    let bytes = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      bytes = Buffer.concat([bytes, chunk]);
      // Status queries are answered at once, and not part of the job.
      while (bytes.subarray(0, STATUS_QUERY.length).equals(STATUS_QUERY)) {
        bytes = bytes.subarray(STATUS_QUERY.length);
        socket.write(Buffer.from(PRINTER_STATES[printer.state]));
      }
    });
    socket.on('end', () => {
      if (bytes.length > 0) {
        printer.jobs.push(bytes);
      }
      socket.end();
    });
    socket.on('error', () => {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  printer.port = server.address().port;
  printer.address = `127.0.0.1:${printer.port}`;
  printer.close = () => new Promise((resolve) => server.close(resolve));
  return printer;
}

/** A port nothing listens on. */
export async function closedPort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] integration config (printers filled by the caller)
 * @param {boolean} [options.add] add every discovered printer in Gladys
 * @param {() => Date} [options.now]
 */
export async function createWorld({ config = {}, add = true, now = () => FIXED_NOW } = {}) {
  const gladys = createFakeGladys({ config });
  const timers = [];
  const store = new CounterStore({ file: null, now });
  const app = registerIntegration(gladys, {
    now,
    store,
    timeouts: { connect: 1000, status: 300, send: 2000 },
    setTimer: (fn, ms) => {
      const timer = { fn, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      if (timer) {
        timer.cleared = true;
      }
    },
  });
  await gladys.connect();
  if (add) {
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(device);
    }
  }
  /** Run the pending loop timer, as if a minute had passed. */
  const tick = async () => {
    const timer = timers.filter((candidate) => !candidate.cleared).pop();
    timer.cleared = true;
    await timer.fn();
  };
  return { gladys, fake: gladys.fake, app, store, timers, tick };
}
