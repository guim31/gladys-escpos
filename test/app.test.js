// -----------------------------------------------------------------------------
// The integration against the SDK fake Gladys and fake printers: discovery,
// sampling by the container's own loop, the scene action, the test action,
// the widget, the failure trigger and quiet logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { FAILURE_EVENT_INTERVAL_MS, SAMPLING_MS } from '../src/app.js';
import { STATUS_TEXT } from '../src/texts.js';
import { FIXED_NOW, closedPort, createWorld, startPrinter } from './helpers/world.js';

async function oneprinter(t, state = 'ready', config = {}) {
  const printer = await startPrinter(state);
  t.after(() => printer.close());
  const world = await createWorld({ config: { printers: printer.address, ...config } });
  t.after(() => world.app.stop());
  const device = world.gladys.devices[0];
  const feature = (key) => `${device.external_id}:${key}`;
  return { printer, world, device, feature };
}

const job = (printer) => printer.jobs.at(-1).toString('latin1');

test('one device per address, added devices sampled at once', async (t) => {
  const { world, device, feature } = await oneprinter(t);
  assert.equal(world.fake.discoveredDevices.length, 1);
  assert.match(device.name, /^Imprimante de tickets 127\.0\.0\.1:\d+$/);
  assert.equal(world.fake.lastState(feature('online')), 1);
  assert.equal(world.fake.lastState(feature('paper_out')), 0);
  assert.equal(world.fake.lastState(feature('paper_low')), 0);
  assert.equal(world.fake.lastState(feature('status')), STATUS_TEXT.ready.fr);
  assert.equal(world.fake.lastState(feature('tickets')), 0);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('the container samples every minute by itself, without onPoll', async (t) => {
  const { printer, world, feature } = await oneprinter(t);
  assert.ok(world.app.isLoopArmed());
  assert.equal(world.timers.at(-1).ms, SAMPLING_MS);
  printer.state = 'paper_low';
  await world.tick();
  // Sampled 0 s ago by the fixed clock: skipped, nothing changed.
  assert.equal(world.fake.lastState(feature('paper_low')), 0);
});

test('the loop picks up a change once the clock moves', async (t) => {
  const printer = await startPrinter('ready');
  t.after(() => printer.close());
  let now = FIXED_NOW;
  const world = await createWorld({ config: { printers: printer.address }, now: () => now });
  t.after(() => world.app.stop());
  const id = world.gladys.devices[0].external_id;
  printer.state = 'paper_out';
  now = new Date(FIXED_NOW.getTime() + SAMPLING_MS);
  await world.tick();
  assert.equal(world.fake.lastState(`${id}:paper_out`), 1);
  assert.equal(world.fake.lastState(`${id}:status`), STATUS_TEXT.paper_out.fr);
  assert.ok(world.fake.widgetRefreshes.length > 0);
  assert.ok(world.app.isLoopArmed(), 'the loop re-arms itself');
});

test('a printer that does not answer the status: reachable, paper not reported', async (t) => {
  const { world, feature } = await oneprinter(t, 'silent');
  assert.equal(world.fake.lastState(feature('online')), 1);
  assert.equal(world.fake.lastState(feature('status')), STATUS_TEXT.unknown.fr);
  assert.equal(world.fake.lastState(feature('paper_out')), undefined);
});

test('an unreachable printer: online 0, status "Injoignable"', async (t) => {
  const port = await closedPort();
  const world = await createWorld({ config: { printers: `127.0.0.1:${port}` } });
  t.after(() => world.app.stop());
  const id = world.gladys.devices[0].external_id;
  assert.equal(world.fake.lastState(`${id}:online`), 0);
  assert.equal(world.fake.lastState(`${id}:status`), STATUS_TEXT.offline.fr);
});

test('scene action: the ticket reaches the printer, the counter goes up', async (t) => {
  const { printer, world, device, feature } = await oneprinter(t);
  const ack = await world.fake.sceneAction('print_ticket', {
    printer: device.external_id,
    title: 'Liste de courses',
    title_style: 'large',
    message: 'Lait\\nPain complet\\nCafé',
    print_date: true,
    qr_code: 'https://example.com/liste',
  });
  assert.equal(ack.success, true);
  assert.deepEqual(ack.data, { outputs: { ticket_number: 1 } });
  const bytes = job(printer);
  assert.ok(bytes.includes('Liste de courses'));
  assert.ok(bytes.includes('Lait\nPain complet\nCaf\x82\n'));
  assert.ok(bytes.includes('https://example.com/liste'));
  assert.ok(bytes.includes('lundi 16 novembre 2026'));
  assert.ok(bytes.endsWith('\x1dVB\x00'));
  assert.equal(world.fake.lastState(feature('tickets')), 1);
  assert.equal(world.store.get(device.external_id).today, 1);
});

test('scene action failures are red (thrown), and fire print_failed once per 15 minutes', async (t) => {
  const printer = await startPrinter('paper_out');
  t.after(() => printer.close());
  let now = FIXED_NOW;
  const world = await createWorld({ config: { printers: printer.address }, now: () => now });
  t.after(() => world.app.stop());
  const device = world.gladys.devices[0];

  const ack = await world.fake.sceneAction('print_ticket', {
    printer: device.external_id,
    message: 'x',
  });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /plus de papier/);
  assert.deepEqual(printer.jobs, []);
  assert.equal(world.fake.sceneEvents.length, 1);
  assert.deepEqual(world.fake.sceneEvents[0], {
    key: 'print_failed',
    data: {
      printer: device.external_id,
      printer_name: device.name,
      reason: 'paper_out',
      error: "L'imprimante n'a plus de papier : rien n'a été envoyé.",
    },
  });

  await world.fake.sceneAction('print_ticket', { printer: device.external_id, message: 'x' });
  assert.equal(world.fake.sceneEvents.length, 1, 'throttled');
  now = new Date(FIXED_NOW.getTime() + FAILURE_EVENT_INTERVAL_MS);
  await world.fake.sceneAction('print_ticket', { printer: device.external_id, message: 'x' });
  assert.equal(world.fake.sceneEvents.length, 2);
});

test('scene action: cover open, unknown printer, empty text, QR too long', async (t) => {
  const { world, device } = await oneprinter(t, 'cover_open');
  let ack = await world.fake.sceneAction('print_ticket', {
    printer: device.external_id,
    message: 'x',
  });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /capot/);
  ack = await world.fake.sceneAction('print_ticket', {
    printer: 'ext:test-integration:printer:nope',
    message: 'x',
  });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /Découverte/);
  ack = await world.fake.sceneAction('print_ticket', {
    printer: device.external_id,
    message: '  ',
  });
  assert.equal(ack.success, false);
  assert.equal(ack.error.fr, 'Rien à imprimer : le message est vide.');
  ack = await world.fake.sceneAction('print_ticket', {
    printer: device.external_id,
    message: 'x',
    qr_code: 'a'.repeat(501),
  });
  assert.equal(ack.success, false);
  assert.match(ack.error.de, /QR-Code/);
});

test('scene action on an unreachable printer', async (t) => {
  const port = await closedPort();
  const world = await createWorld({ config: { printers: `127.0.0.1:${port}` } });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('print_ticket', {
    printer: world.gladys.devices[0].external_id,
    message: 'x',
  });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /ne répond pas/);
  assert.equal(world.fake.sceneEvents[0].data.reason, 'unreachable');
});

test('a very long text is cut at 4000 characters and wrapped at 32 columns', async (t) => {
  const { printer, world, device } = await oneprinter(t, 'ready', { paper_width: '58' });
  const ack = await world.fake.sceneAction('print_ticket', {
    printer: device.external_id,
    message: 'mot '.repeat(2000),
  });
  assert.equal(ack.success, true);
  const lines = job(printer)
    .split('\n')
    .filter((line) => line.startsWith('mot'));
  assert.ok(lines.every((line) => line.length <= 32));
  assert.ok(lines.join(' ').length <= 4010);
});

test('test_print: green on success, red with the failing printer', async (t) => {
  const printer = await startPrinter('ready');
  t.after(() => printer.close());
  const port = await closedPort();
  const world = await createWorld({ config: { printers: printer.address } });
  t.after(() => world.app.stop());
  let ack = await world.fake.action('test_print', {});
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /^Imprimé sur 127\.0\.0\.1:/);
  const bytes = job(printer);
  assert.ok(bytes.includes('Ticket de test'));
  assert.ok(bytes.includes('\x85\x83\x84\x87\x82\x8a')); // àâäçéè in PC858

  await world.fake.configUpdated({ printers: `${printer.address}, 127.0.0.1:${port}` });
  ack = await world.fake.action('test_print', {});
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, new RegExp(`127\\.0\\.0\\.1:${port} : L'imprimante ne répond pas`));

  await world.fake.configUpdated({ printers: '' });
  ack = await world.fake.action('test_print', {});
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /Aucune imprimante/);
});

test('invalid addresses are reported in the connection status', async () => {
  const world = await createWorld({
    config: { printers: 'bad_host!, 192.0.2.10:99999' },
    add: false,
  });
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /bad_host!, 192\.0\.2\.10:99999/);
  await world.app.stop();
});

test('widget: one printer with counters, status and the two buttons; their actions', async (t) => {
  const { printer, world, device } = await oneprinter(t);
  await world.fake.sceneAction('print_ticket', { printer: device.external_id, message: 'x' });
  const ack = await world.fake.widgetGet('ticket_printer', { settings: {}, language: 'fr' });
  assert.equal(ack.success, true);
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  const [today, total, status, print, test] = ack.data.content.components;
  assert.equal(today.value, 1);
  assert.equal(total.value, 1);
  assert.deepEqual(status.items[0].value, STATUS_TEXT.ready.fr);
  assert.equal(print.action.key, 'print_note');
  assert.equal(test.action.key, 'print_test');

  const typed = await world.fake.widgetAction(
    'ticket_printer',
    'print_note',
    { printer: device.external_id },
    { values: { title: 'Mot', message: 'À tout à l’heure' } },
  );
  assert.equal(typed.success, true);
  assert.ok(job(printer).includes("\xb7 tout \x85 l'heure"));

  const empty = await world.fake.widgetAction(
    'ticket_printer',
    'print_note',
    { printer: device.external_id },
    { values: { message: '' } },
  );
  assert.equal(empty.success, false);
  assert.ok(empty.error.fr);

  const tested = await world.fake.widgetAction('ticket_printer', 'print_test', {
    printer: device.external_id,
  });
  assert.equal(tested.success, true);
  assert.equal(world.store.get(device.external_id).total, 3);

  const hidden = await world.fake.widgetGet('ticket_printer', {
    settings: { show_print_button: false, show_test_button: false },
    language: 'de',
  });
  assert.equal(
    hidden.data.content.components.filter((component) => component.type === 'button').length,
    0,
  );
});

test('widget: empty, missing printer, and several printers without buttons', async (t) => {
  const a = await startPrinter('ready');
  const b = await startPrinter('paper_low');
  t.after(() => Promise.all([a.close(), b.close()]));
  const none = await createWorld({ config: { printers: a.address }, add: false });
  let ack = await none.fake.widgetGet('ticket_printer', { language: 'es' });
  assert.match(ack.data.content.components[0].text.es, /Descubrimiento/);
  await none.app.stop();

  const world = await createWorld({ config: { printers: `${a.address} ${b.address}` } });
  t.after(() => world.app.stop());
  ack = await world.fake.widgetGet('ticket_printer', {
    settings: { printer: 'gone' },
    language: 'en',
  });
  assert.match(ack.data.content.components[0].text.en, /no longer exists/);
  ack = await world.fake.widgetGet('ticket_printer', { language: 'en' });
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  const status = ack.data.content.components.find((component) => component.type === 'status');
  assert.deepEqual(
    status.items.map((item) => item.value),
    [STATUS_TEXT.ready.en, STATUS_TEXT.paper_low.en],
  );
  assert.equal(
    ack.data.content.components.filter((component) => component.type === 'button').length,
    0,
  );
});

test('the widget shows the name given in Gladys', async (t) => {
  const { world, device } = await oneprinter(t);
  await world.fake.deviceUpdated({ ...device, name: 'Cuisine' });
  const ack = await world.fake.widgetGet('ticket_printer', { language: 'fr' });
  assert.equal(
    ack.data.content.components.find((c) => c.type === 'status').items[0].label,
    'Cuisine',
  );
});

test('onPoll is a fallback that skips a printer sampled less than 30 s ago', async (t) => {
  const { printer, world, device } = await oneprinter(t);
  const before = printer.connections;
  assert.deepEqual(await world.fake.poll(device), { success: true });
  assert.equal(printer.connections, before);
});

test('a normal cycle writes nothing at info level', async (t) => {
  const printer = await startPrinter('ready');
  t.after(() => printer.close());
  let now = FIXED_NOW;
  const world = await createWorld({ config: { printers: printer.address }, now: () => now });
  t.after(() => world.app.stop());
  const written = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk, ...rest) => {
    written.push(String(chunk));
    return original.call(process.stdout, chunk, ...rest);
  };
  try {
    now = new Date(FIXED_NOW.getTime() + SAMPLING_MS);
    await world.tick();
    now = new Date(FIXED_NOW.getTime() + 2 * SAMPLING_MS);
    await world.tick();
  } finally {
    process.stdout.write = original;
  }
  assert.deepEqual(
    written.filter((line) => line.includes('[INFO]')),
    [],
  );
});

test('a busy single-client printer (accepts, then closes) stays reachable', async (t) => {
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
  const world = await createWorld({ config: { printers: `127.0.0.1:${server.address().port}` } });
  t.after(() => world.app.stop());
  const id = world.gladys.devices[0].external_id;
  assert.equal(world.fake.lastState(`${id}:online`), 1);
  assert.equal(world.fake.lastState(`${id}:status`), STATUS_TEXT.unknown.fr);
  const ack = await world.fake.sceneAction('print_ticket', { printer: id, message: 'x' });
  assert.equal(ack.success, false);
});
