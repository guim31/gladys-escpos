// -----------------------------------------------------------------------------
// The TCP side, against fake printers on the loopback: real-time status
// decoding, a printer that never answers the status, a refused connection,
// paper out, and the queue that keeps one operation per printer at a time.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAPER, PrinterQueue, exchange, parseStatus } from '../src/escpos/printer.js';
import { PRINTER_STATES, closedPort, startPrinter } from './helpers/world.js';

const timeouts = { connect: 1000, status: 300, send: 2000 };

test('DLE EOT answers: ready, paper low, paper out, cover open, garbage', () => {
  assert.deepEqual(parseStatus(PRINTER_STATES.ready), {
    answered: true,
    paper: PAPER.OK,
    coverOpen: false,
    error: false,
  });
  assert.equal(parseStatus(PRINTER_STATES.paper_low).paper, PAPER.LOW);
  assert.equal(parseStatus(PRINTER_STATES.paper_out).paper, PAPER.OUT);
  assert.equal(parseStatus(PRINTER_STATES.cover_open).coverOpen, true);
  // Error bit of DLE EOT 2.
  assert.equal(parseStatus([0x52, 0x12]).error, true);
  // Bytes that are not status bytes (an ASB report, text): not answered.
  assert.equal(parseStatus([0x41, 0x42]).answered, false);
  assert.equal(parseStatus([0x12]).answered, false);
  assert.equal(parseStatus([]).paper, PAPER.UNKNOWN);
});

test('a status check reads the answer and sends no job', async (t) => {
  const printer = await startPrinter('paper_low');
  t.after(() => printer.close());
  const status = await exchange(
    { host: '127.0.0.1', port: printer.port },
    { query: true, timeouts },
  );
  assert.equal(status.paper, PAPER.LOW);
  assert.deepEqual(printer.jobs, []);
});

test('a printer that never answers the status: unknown, and the job still goes', async (t) => {
  const printer = await startPrinter('silent');
  t.after(() => printer.close());
  const status = await exchange(
    { host: '127.0.0.1', port: printer.port },
    { query: true, payload: Buffer.from('hello'), timeouts },
  );
  assert.equal(status.answered, false);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(printer.jobs.map(String), ['hello']);
});

test('beforeSend can cancel the job (paper out): nothing reaches the printer', async (t) => {
  const printer = await startPrinter('paper_out');
  t.after(() => printer.close());
  await assert.rejects(
    exchange(
      { host: '127.0.0.1', port: printer.port },
      {
        query: true,
        payload: Buffer.from('lost'),
        timeouts,
        beforeSend: (status) => {
          if (status.paper === PAPER.OUT) {
            throw Object.assign(new Error('out'), { kind: 'paper_out' });
          }
        },
      },
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(printer.jobs, []);
});

test('nothing listening: "unreachable"', async () => {
  const port = await closedPort();
  await assert.rejects(exchange({ host: '127.0.0.1', port }, { timeouts }), {
    kind: 'unreachable',
  });
});

test('an address that does not answer at all: "unreachable" after the connect timeout', async () => {
  // A socket that never connects, without touching the network.
  const { EventEmitter } = await import('node:events');
  const connect = () =>
    Object.assign(new EventEmitter(), { destroy() {}, setNoDelay() {}, write() {}, end() {} });
  await assert.rejects(
    exchange({ host: '192.0.2.10', port: 9100 }, { connect, timeouts: { connect: 50 } }),
    { kind: 'unreachable' },
  );
});

test('the queue runs the operations of one printer one after the other', async () => {
  const queue = new PrinterQueue();
  const order = [];
  const slow = (label, ms) => () =>
    new Promise((resolve) =>
      setTimeout(() => {
        order.push(label);
        resolve(label);
      }, ms),
    );
  const first = queue.run('a', slow('a1', 30));
  const failing = queue.run('a', () => Promise.reject(new Error('x')));
  const second = queue.run('a', slow('a2', 1));
  const other = queue.run('b', slow('b1', 1));
  await Promise.all([first, second, other, failing.catch(() => {})]);
  assert.deepEqual(order, ['b1', 'a1', 'a2']);
});

test('a printer that accepts then closes: not printed, an error', async (t) => {
  const net = await import('node:net');
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    sockets.forEach((socket) => socket.destroy());
    server.close();
  });
  // With the status query only: without it, the job is already in the kernel
  // when the close arrives, and TCP cannot tell it was never read.
  await assert.rejects(
    exchange(
      { host: '127.0.0.1', port: server.address().port },
      { query: true, payload: Buffer.from('x'), timeouts },
    ),
    { kind: 'error' },
  );
});
