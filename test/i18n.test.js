// -----------------------------------------------------------------------------
// Every text Gladys shows exists in English, French, German and Spanish: the
// manifest, the tables of the code, the documentation (same sections in the
// four files). German says "du", never the polite "Sie".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import * as TEXTS from '../src/texts.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 400,
  message: 200,
  featureName: 40,
  widget: 24,
  status: 40,
};
const sorted = (keys) => [...keys].sort();

function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    if (typeof text !== 'string' || text.trim() === '') {
      found.push(`${path}.${lang} is empty`);
      continue;
    }
    if (text.length > max) {
      found.push(`${path}.${lang} has ${text.length} characters (${max} at most)`);
    }
    if (lang === 'de' && POLITE_GERMAN.test(text)) {
      found.push(`${path}.${lang} uses the polite form: "${text}"`);
    }
  }
  return found;
}

function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    if (['label', 'description', 'placeholder'].includes(key)) {
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : MAX[key];
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

test('the configuration offers the four languages, French by default', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  const field = manifest.config_schema.find((entry) => entry.key === 'language');
  assert.deepEqual(
    field.options.map((option) => option.value),
    LANGS,
  );
  assert.equal(field.default, 'fr');
});

test('every text of the manifest is in the four languages, within the limits', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 60, `only ${texts.length} texts found`);
  assert.deepEqual(
    texts.flatMap(({ path, value, max }) => problems(value, path, max)),
    [],
  );
});

test('every table of the code is in the four languages', () => {
  const limits = {
    FEATURE_NAMES: MAX.featureName,
    DEVICE_NAME: MAX.featureName,
    STATUS_TEXT: MAX.status,
    WIDGET_TEXT: MAX.widget,
  };
  const long = new Set(['empty', 'missing', 'title', 'message']);
  const found = [];
  for (const name of [
    'FEATURE_NAMES',
    'STATUS_TEXT',
    'ERROR_TEXT',
    'CONNECTION_TEXT',
    'TEST_TICKET',
    'ACTION_TEXT',
    'WIDGET_TEXT',
  ]) {
    for (const [key, value] of Object.entries(TEXTS[name])) {
      const max = name === 'WIDGET_TEXT' && long.has(key) ? 300 : (limits[name] ?? MAX.message);
      found.push(...problems(value, `${name}.${key}`, max));
    }
  }
  found.push(...problems(TEXTS.DEVICE_NAME, 'DEVICE_NAME', MAX.featureName));
  assert.deepEqual(found, []);
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: '', es: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'Wählen Sie', es: 'a' }, 'x', 60).length, 1);
  assert.deepEqual(problems({ en: 'a', fr: 'a', de: 'Siebenschläfer', es: 'a' }, 'x', 60), []);
  const forgotten = structuredClone(manifest);
  delete forgotten.scene_actions[0].fields[1].label.de;
  assert.equal(
    manifestTexts(forgotten).flatMap(({ path, value, max }) => problems(value, path, max)).length,
    1,
  );
});

test('the four documentation files have the same sections', async () => {
  const headings = {};
  for (const lang of LANGS) {
    const text = await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8');
    assert.ok(text.length >= 1500, `docs/${lang}.md is too short`);
    headings[lang] = text.match(/^#{1,3} /gm);
    if (lang === 'de') {
      assert.doesNotMatch(text, POLITE_GERMAN, 'docs/de.md uses the polite form');
    }
  }
  for (const lang of LANGS) {
    assert.deepEqual(
      headings[lang],
      headings.en,
      `docs/${lang}.md sections differ from docs/en.md`,
    );
  }
});
