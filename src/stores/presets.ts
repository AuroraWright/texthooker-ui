import { dataState } from './data-state.svelte';
import { appState } from './app-state.svelte';
import { tick } from 'svelte';
import { defaultSettings, settings, type SettingKey } from './settings.svelte';
import { reconnectPrimarySocket, reconnectSecondarySocket } from '../events';
import type { SettingPreset, Settings } from '../types';

export function getCurrentSettings(): Settings {
	return Object.fromEntries(
		Object.keys(defaultSettings).map((key) => [
			key,
			key === 'replacements$' ? dataState.replacements : settings.get(key as SettingKey),
		]),
	) as unknown as Settings;
}

export function updateSettingsWithPreset(preset: SettingPreset, updateLastPreset = true) {
	dataState.replacements = preset.settings.replacements$ ?? defaultSettings.replacements$;
	settings.assign(preset.settings);
	dataState.prepareCharacterCounts();

	if (updateLastPreset) {
		settings.lastSettingPreset = preset.name;
	}

	tick().then(() => {
		if (appState.socketState !== 1 && settings.continuousReconnect) {
			reconnectPrimarySocket.emit();
		}

		if (appState.secondarySocketState !== 1 && settings.continuousReconnect) {
			reconnectSecondarySocket.emit();
		}
	});
}
