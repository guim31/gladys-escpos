// -----------------------------------------------------------------------------
// The manifest and the code agree: defaults, keys of the action, scene action,
// trigger and widget, versions, and the Gladys version the fields require.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTION_KEY, SCENE_ACTION_KEY, SCENE_TRIGGER_KEYS } from '../src/app.js';
import { DEFAULT_CONFIG, PAPER_WIDTHS } from '../src/config.js';
import { CODE_PAGE_KEYS } from '../src/escpos/codepages.js';
import { TITLE_STYLES } from '../src/escpos/encoder.js';
import { WIDGET_KEY } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const field = (key) => manifest.config_schema.find((entry) => entry.key === key);
const values = (entry) => entry.options.map((option) => option.value);

test('version, image and cover agree', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-escpos:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-escpos/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['local']);
});

test('the defaults of the configuration are those of the code', () => {
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    if (key !== 'printers') {
      assert.deepEqual(field(key).default, value, key);
    }
  }
  assert.deepEqual(values(field('paper_width')).sort(), Object.keys(PAPER_WIDTHS).sort());
  assert.deepEqual(values(field('code_page')).sort(), [...CODE_PAGE_KEYS].sort());
});

test('the keys of the action, scene action, trigger and widget are those of the code', () => {
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    [ACTION_KEY],
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key),
    [SCENE_ACTION_KEY],
  );
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key),
    SCENE_TRIGGER_KEYS,
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key),
    [WIDGET_KEY],
  );
  const style = manifest.scene_actions[0].fields.find((entry) => entry.key === 'title_style');
  assert.deepEqual(values(style).sort(), Object.keys(TITLE_STYLES).sort());
});

test('a scene action requires only the printer and the text', () => {
  const required = manifest.scene_actions[0].fields.filter((entry) => entry.required);
  assert.deepEqual(
    required.map((entry) => entry.key),
    ['printer', 'message'],
  );
});

test('widget buttons with a form need Gladys 5.2.0', () => {
  assert.equal(manifest.gladys_version, '>=5.2.0');
});
