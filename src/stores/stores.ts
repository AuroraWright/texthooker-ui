import { dataState } from './data-state.svelte';
import { dialogState } from './dialog-state.svelte';
import { appState } from './app-state.svelte';
import { setPaused } from './state-actions';
import { type DialogResult, type LineItem } from '../types';
import { mdiHelpCircle } from '@mdi/js';
import { removeIDBItem } from '../idb';
import { defaultSettings, settings } from './settings.svelte';
export { defaultSettings } from './settings.svelte';

export const newLines = new Set<LineItem>();
export const pipNewLines = new Set<LineItem>();

export async function resetAllData(onreset?: () => void) {
	if (!settings.skipResetConfirmations) {
		const { canceled } = await new Promise<DialogResult>((resolve) => {
			dialogState.open({
				icon: mdiHelpCircle,
				message: 'All Settings and Data will be reset',
				callback: resolve,
			});
		});

		if (canceled) {
			return;
		}
	}

	settings.lastSettingPreset = '';
	dataState.settingPresets = [];
	setPaused(true);
	settings.timeValue = 0;
	dataState.userNotes = '';
	dataState.lines = [];
	dataState.actionHistory = [];
	appState.flashOnPauseTimeout = undefined;

	window.localStorage.removeItem('bannou-texthooker-timeValue');
	window.localStorage.removeItem('bannou-texthooker-userNotes');
	window.localStorage.removeItem('bannou-texthooker-lineData');
	window.localStorage.removeItem('bannou-texthooker-actionHistory');
	await removeIDBItem('bannou-texthooker-lineData');
	await removeIDBItem('bannou-texthooker-userNotes');
	await removeIDBItem('bannou-texthooker-actionHistory');

	dataState.replacements = defaultSettings.replacements$;
	settings.assign({});
	dataState.prepareCharacterCounts();
	onreset?.();
}
