// -----------------------------------------------------------------------------
// Talking to a printer over TCP (raw port 9100, "JetDirect"/"AppSocket").
//
// One connection per operation, closed right after: a ticket printer serves
// one client at a time, and a connection kept open would block the others
// (a till, a phone app). The operations on one printer are queued, so a
// status check never interleaves with a ticket.
//
// Status: the real-time commands DLE EOT 2 (offline cause) and DLE EOT 4
// (paper roll sensor) answer one byte each, even while the printer is busy or
// offline. Many cheap printers, and some interfaces, never answer: the status
// is then "unknown", which is not an error — the printer was reachable.
// -----------------------------------------------------------------------------

import net from 'node:net';

export const CONNECT_TIMEOUT_MS = 5000;
export const STATUS_TIMEOUT_MS = 1500;
export const SEND_TIMEOUT_MS = 15_000;
export const CLOSE_GRACE_MS = 500;

export const STATUS_QUERY = Buffer.from([0x10, 0x04, 0x02, 0x10, 0x04, 0x04]);

export const PAPER = { OK: 'ok', LOW: 'low', OUT: 'out', UNKNOWN: 'unknown' };

/** Failure of a printer operation, with a kind the texts translate. */
export class PrinterError extends Error {
  /**
   * @param {'unreachable'|'timeout'|'paper_out'|'cover_open'|'error'} kind
   * @param {string} message
   */
  constructor(kind, message) {
    super(message);
    this.name = 'PrinterError';
    this.kind = kind;
  }
}

// A status byte always has bit 1 and bit 4 set, bit 0 and bit 7 clear.
const isStatusByte = (byte) => (byte & 0x93) === 0x12;

/**
 * Decode the answers to STATUS_QUERY.
 * @param {number[]} bytes what the printer sent back (0, 1 or 2 bytes)
 * @returns {{ answered: boolean, paper: string, coverOpen: boolean, error: boolean }}
 */
export function parseStatus(bytes) {
  const [offline, paper] = bytes;
  if (!isStatusByte(offline ?? 0) || !isStatusByte(paper ?? 0)) {
    return { answered: false, paper: PAPER.UNKNOWN, coverOpen: false, error: false };
  }
  let level = PAPER.OK;
  if (paper & 0x60 || offline & 0x20) {
    level = PAPER.OUT;
  } else if (paper & 0x0c) {
    level = PAPER.LOW;
  }
  return {
    answered: true,
    paper: level,
    coverOpen: Boolean(offline & 0x04),
    error: Boolean(offline & 0x40),
  };
}

const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'EPIPE',
]);

function toPrinterError(err) {
  if (err instanceof PrinterError) {
    return err;
  }
  if (UNREACHABLE_CODES.has(err?.code)) {
    return new PrinterError('unreachable', `${err.code}`);
  }
  return new PrinterError('error', err?.message ?? String(err));
}

/**
 * Open a connection, optionally query the status, optionally send a job.
 * @param {{ host: string, port: number }} target
 * @param {object} options
 * @param {boolean} [options.query] send STATUS_QUERY and wait for the answer
 * @param {(status: ReturnType<typeof parseStatus>) => void} [options.beforeSend]
 *   called with the status before the job is sent; throwing cancels the job
 * @param {Buffer} [options.payload] the job
 * @param {typeof net.connect} [options.connect]
 * @param {{ connect?: number, status?: number, send?: number }} [options.timeouts]
 * @returns {Promise<ReturnType<typeof parseStatus>>}
 */
export function exchange(target, options = {}) {
  const { query = false, beforeSend, payload, connect = net.connect, timeouts = {} } = options;
  const connectTimeout = timeouts.connect ?? CONNECT_TIMEOUT_MS;
  const statusTimeout = timeouts.status ?? STATUS_TIMEOUT_MS;
  const sendTimeout = timeouts.send ?? SEND_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const received = [];
    let settled = false;
    let timer = null;
    let status = parseStatus([]);
    let waitingStatus = null;

    const socket = connect({ host: target.host, port: target.port });
    socket.setNoDelay?.(true);

    const finish = (err) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners('data');
      socket.destroy();
      if (err) {
        reject(toPrinterError(err));
      } else {
        resolve(status);
      }
    };
    const arm = (ms, kind, message) => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(new PrinterError(kind, message)), ms);
    };

    socket.on('error', (err) => finish(err));
    socket.on('data', (chunk) => {
      received.push(...chunk);
      if (waitingStatus && received.length >= 2) {
        waitingStatus();
      }
    });

    const send = () => {
      if (!payload) {
        finish();
        return;
      }
      arm(sendTimeout, 'timeout', 'The printer did not take the ticket in time');
      // end() flushes the job then half-closes. Done when the printer closes
      // too, or shortly after the flush for those that keep the connection
      // open: closing at once could reset a connection with bytes in flight.
      socket.once('close', () => finish());
      socket.end(payload, () => {
        clearTimeout(timer);
        timer = setTimeout(() => finish(), CLOSE_GRACE_MS);
      });
    };

    arm(connectTimeout, 'unreachable', `No answer from ${target.host}:${target.port}`);
    socket.once('connect', () => {
      if (!query) {
        send();
        return;
      }
      const afterStatus = () => {
        if (waitingStatus === null || settled) {
          return; // answered and timed out at once: the first one wins
        }
        waitingStatus = null;
        status = parseStatus(received.slice(0, 2));
        try {
          beforeSend?.(status);
        } catch (err) {
          finish(err);
          return;
        }
        send();
      };
      waitingStatus = afterStatus;
      clearTimeout(timer);
      timer = setTimeout(afterStatus, statusTimeout);
      socket.write(STATUS_QUERY);
    });
  });
}

/**
 * Serializes the operations per printer (host:port).
 */
export class PrinterQueue {
  constructor() {
    this.tails = new Map();
  }

  /**
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} operation
   * @returns {Promise<T>}
   */
  run(key, operation) {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    const tail = current.catch(() => {});
    this.tails.set(key, tail);
    tail.then(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    });
    return current;
  }
}
