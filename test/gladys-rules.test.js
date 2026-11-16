// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// configurations (one printer, several with ports and IPv6, each language).
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code. Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const PRINTERS = '192.0.2.10, 192.0.2.11:9101; printer.local\n[2001:db8::20]:9100';
const scenarios = ['fr', 'en', 'de', 'es'].map((language) => ({
  label: language,
  config: { printers: PRINTERS, language },
}));

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    // add: false: no printer to reach, only the published devices are checked.
    const { gladys, app } = await createWorld({ config: scenario.config, add: false });
    try {
      const devices = gladys.fake.discoveredDevices;
      assert.equal(devices.length, 4);
      assert.equal(new Set(devices.map((device) => device.external_id)).size, 4);
      for (const device of devices) {
        const where = device.name;
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(table.poll_frequencies_ms.includes(device.poll_frequency), where);
        }
        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(pair.label_en && pair.label_fr && pair.icon, `${at}: couple without label`);
          assert.equal(typeof feature.min, 'number', `${at}: min`);
          assert.equal(typeof feature.max, 'number', `${at}: max`);
          assert.ok(Number.isFinite(feature.min) && Number.isFinite(feature.max), at);
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only`);
          assert.equal(typeof feature.has_feedback, 'boolean', `${at}: has_feedback`);
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }
          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name`);
          names.add(feature.name);
        }
      }
    } finally {
      await app.stop();
    }
  });
}

test('the external ids are frozen: printer:<host>-<port>:<feature>', async () => {
  const { gladys, app } = await createWorld({ config: { printers: PRINTERS }, add: false });
  await app.stop();
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.external_id),
    [
      'ext:test-integration:printer:192-0-2-10-9100',
      'ext:test-integration:printer:192-0-2-11-9101',
      'ext:test-integration:printer:printer-local-9100',
      'ext:test-integration:printer:2001-db8-20-9100',
    ],
  );
  assert.deepEqual(
    gladys.fake.discoveredDevices[0].features.map((feature) =>
      feature.external_id.split(':').at(-1),
    ),
    ['online', 'paper_low', 'paper_out', 'status', 'tickets'],
  );
});
