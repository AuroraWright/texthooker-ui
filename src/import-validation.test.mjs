import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./import-validation.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { isImportedData, isImportedSettings, isImportedPreset } = await import(
	`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
const defaults = { fontSize$: 24, windowTitle$: '', enablePaste$: false, replacements$: [] };
const data = {
	'bannou-texthooker-timeValue': 0,
	'bannou-texthooker-userNotes': '',
	'bannou-texthooker-lineData': [{ id: 'line', text: '日本語' }],
	'bannou-texthooker-actionHistory': [[{ id: 'deleted', text: '文章', index: 0 }]],
};
const preset = { name: 'Saved', settings: { fontSize$: 28 } };
const settings = { currentSettings: defaults, settingPresets: [preset], lastSettingsPreset: 'Saved' };
const validators = [isImportedData, (value) => isImportedSettings(value, defaults), (value) => isImportedPreset(value, defaults)];

test('each importer accepts its export and rejects the other JSON export types', () => {
	for (const [index, validate] of validators.entries()) {
		for (const [fileIndex, file] of [data, settings, preset].entries()) {
			assert.equal(validate(file), index === fileIndex);
		}
		for (const invalid of [null, [], {}, 0, true, 'text']) assert.equal(validate(invalid), false);
	}
});

test('partial legacy exports, empty data and unknown future fields remain supported', () => {
	for (const [key, value] of Object.entries(data)) assert.equal(isImportedData({ [key]: value }), true);
	assert.equal(isImportedData({ 'bannou-texthooker-lineData': [], 'bannou-texthooker-actionHistory': [] }), true);
	assert.equal(isImportedSettings({ currentSettings: { fontSize$: 28 }, future: true }, defaults), true);
	assert.equal(isImportedPreset({ ...preset, settings: { fontSize$: 28, future: true } }, defaults), true);
});

test('malformed data fields and nested line/history entries reject the whole import', () => {
	const invalidFields = {
		'bannou-texthooker-timeValue': [-1, '10', Infinity],
		'bannou-texthooker-userNotes': [null, []],
		'bannou-texthooker-lineData': [null, {}, [{ id: '', text: 'text' }], [{ id: 'x', text: 42 }],
			[{ id: 'x', text: 'one' }, { id: 'x', text: 'two' }], [{ id: 'x', text: 'text', index: -1 }]],
		'bannou-texthooker-actionHistory': [null, [{}], [[{ id: 'x', text: 'text' }]],
			[[{ id: 'x', text: 'text', index: 0.5 }]]],
	};
	for (const [key, values] of Object.entries(invalidFields)) {
		for (const value of values) assert.equal(isImportedData({ ...data, [key]: value }), false);
	}
});

test('settings and presets validate scalar types, replacements and preset metadata', () => {
	for (const invalid of [{}, { fontSize$: '28' }, { fontSize$: Infinity }, { enablePaste$: 1 },
		{ windowTitle$: null }, { replacements$: {} }, { replacements$: [{ pattern: '', replaces: '', flags: [], enabled: 'yes' }] },
		{ replacements$: [{ pattern: '', replaces: '', flags: [42], enabled: true }] }]) {
		assert.equal(isImportedSettings({ ...settings, currentSettings: invalid }, defaults), false);
		assert.equal(isImportedPreset({ ...preset, settings: invalid }, defaults), false);
	}
	assert.equal(isImportedPreset({ ...preset, name: ' ' }, defaults), false);
	assert.equal(isImportedSettings({ ...settings, settingPresets: [data] }, defaults), false);
	assert.equal(isImportedSettings({ ...settings, settingPresets: {} }, defaults), false);
	assert.equal(isImportedSettings({ ...settings, lastSettingsPreset: 1 }, defaults), false);
	assert.equal(isImportedPreset({ ...preset, settings: { replacements$: [{ pattern: 'a', replaces: 'b', flags: ['g'], enabled: true }] } }, defaults), true);
});
