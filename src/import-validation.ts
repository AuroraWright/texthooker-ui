import type { ExportedData, ExportedSettings, LineItem, SettingPreset, Settings } from './types';

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isLine(value: unknown, history = false): value is LineItem {
	return isObject(value) && typeof value.id === 'string' && value.id.length > 0 && typeof value.text === 'string'
		&& (history || Object.hasOwn(value, 'index')
			? isNumber(value.index) && Number.isInteger(value.index) && value.index >= 0
			: true);
}

export function isImportedData(value: unknown): value is Partial<ExportedData> {
	if (!isObject(value)) return false;
	const validators = {
		'bannou-texthooker-timeValue': (value: unknown) => isNumber(value) && value >= 0,
		'bannou-texthooker-userNotes': (value: unknown) => typeof value === 'string',
		'bannou-texthooker-lineData': (value: unknown) => {
			if (!Array.isArray(value) || !value.every((line) => isLine(line))) return false;
			return new Set(value.map((line) => line.id)).size === value.length;
		},
		'bannou-texthooker-actionHistory': (value: unknown) => Array.isArray(value)
			&& value.every((action) => Array.isArray(action) && action.every((line) => isLine(line, true))),
	};
	const fields = Object.keys(validators).filter((key) => Object.hasOwn(value, key));
	return fields.length > 0 && fields.every((key) => validators[key](value[key]));
}

function isImportedSettingsValue(value: unknown, defaults: Settings): value is Settings {
	if (!isObject(value)) return false;
	const fields = Object.keys(defaults).filter((key) => Object.hasOwn(value, key));
	return fields.length > 0 && fields.every((key) => {
		const setting = value[key];
		if (key === 'replacements$') {
			return Array.isArray(setting) && setting.every((replacement) => isObject(replacement)
				&& typeof replacement.pattern === 'string' && typeof replacement.replaces === 'string'
				&& typeof replacement.enabled === 'boolean' && Array.isArray(replacement.flags)
				&& replacement.flags.every((flag) => typeof flag === 'string'));
		}
		return typeof defaults[key] === 'number' ? isNumber(setting) : typeof setting === typeof defaults[key];
	});
}

export function isImportedPreset(value: unknown, defaults: Settings): value is SettingPreset {
	return isObject(value) && typeof value.name === 'string' && value.name.trim().length > 0
		&& isImportedSettingsValue(value.settings, defaults);
}

export function isImportedSettings(value: unknown, defaults: Settings): value is ExportedSettings {
	return isObject(value) && isImportedSettingsValue(value.currentSettings, defaults)
		&& (!Object.hasOwn(value, 'settingPresets') || (Array.isArray(value.settingPresets)
			&& value.settingPresets.every((preset) => isImportedPreset(preset, defaults))))
		&& (!Object.hasOwn(value, 'lastSettingsPreset') || typeof value.lastSettingsPreset === 'string');
}
