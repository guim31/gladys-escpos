// -----------------------------------------------------------------------------
// Ticket counters, kept in /data (the only writable place of the container) so
// they survive a restart or an update: per printer, the total and today's.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'escpos:store' });

export const STORE_FILE = '/data/tickets.json';

/** Local calendar day (the container gets the Gladys time zone in TZ). */
export const dayOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export class CounterStore {
  /**
   * @param {{ file?: string | null, now?: () => Date }} [options] `file: null` keeps everything in memory
   */
  constructor({ file = STORE_FILE, now = () => new Date() } = {}) {
    this.file = file;
    this.now = now;
    this.counters = {};
    this.saving = Promise.resolve();
  }

  async load() {
    if (!this.file) {
      return;
    }
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      this.counters = data && typeof data.counters === 'object' ? data.counters : {};
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Ticket counters not read, starting from zero: ${err.message}`);
      }
      this.counters = {};
    }
  }

  /** @returns {{ total: number, today: number }} */
  get(id) {
    const entry = this.counters[id];
    if (!entry) {
      return { total: 0, today: 0 };
    }
    return { total: entry.total, today: entry.day === dayOf(this.now()) ? entry.today : 0 };
  }

  /** Count one printed ticket; returns the new counts. */
  increment(id) {
    const today = dayOf(this.now());
    const entry = this.counters[id] ?? { total: 0, today: 0, day: today };
    entry.total += 1;
    entry.today = entry.day === today ? entry.today + 1 : 1;
    entry.day = today;
    this.counters[id] = entry;
    this.save();
    return this.get(id);
  }

  /** Writes one after the other, through a temporary file (never half a file). */
  save() {
    if (!this.file) {
      return this.saving;
    }
    const content = JSON.stringify({ counters: this.counters });
    this.saving = this.saving.then(async () => {
      try {
        await mkdir(path.dirname(this.file), { recursive: true });
        await writeFile(`${this.file}.tmp`, content);
        await rename(`${this.file}.tmp`, this.file);
      } catch (err) {
        logger.warn(`Ticket counters not saved: ${err.message}`);
      }
    });
    return this.saving;
  }
}
