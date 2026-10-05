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

export async function resetAllData(onlayoutChange?: () => void) {
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

	settings.theme = defaultSettings.theme$;
	dataState.replacements = defaultSettings.replacements$;
	settings.windowTitle = defaultSettings.windowTitle$;
	settings.websocketUrl = defaultSettings.websocketUrl$;
	settings.secondaryWebsocketUrl = defaultSettings.secondaryWebsocketUrl$;
	settings.fontSize = defaultSettings.fontSize$;
	settings.linePadding = defaultSettings.linePadding$;
	settings.characterMilestone = defaultSettings.characterMilestone$;
	settings.onlineFont = defaultSettings.onlineFont$;
	settings.preventLastDuplicate = defaultSettings.preventLastDuplicate$;
	settings.maxPipLines = defaultSettings.maxPipLines$;
	settings.afkTimer = defaultSettings.afkTimer$;
	settings.adjustTimerOnAfk = defaultSettings.adjustTimerOnAfk$;
	settings.enableExternalClipboardMonitor = defaultSettings.enableExternalClipboardMonitor$;
	settings.showPresetQuickSwitch = defaultSettings.showPresetQuickSwitch$;
	settings.skipResetConfirmations = defaultSettings.skipResetConfirmations$;
	settings.persistStats = defaultSettings.persistStats$;
	settings.persistNotes = defaultSettings.persistNotes$;
	settings.persistLines = defaultSettings.persistLines$;
	settings.persistActionHistory = defaultSettings.persistActionHistory$;
	settings.enablePaste = defaultSettings.enablePaste$;
	settings.blockCopyOnPage = defaultSettings.blockCopyOnPage$;
	settings.allowPasteDuringPause = defaultSettings.allowPasteDuringPause$;
	settings.allowNewLineDuringPause = defaultSettings.allowNewLineDuringPause$;
	settings.autoStartTimerDuringPausePaste = defaultSettings.autoStartTimerDuringPausePaste$;
	settings.autoStartTimerDuringPause = defaultSettings.autoStartTimerDuringPause$;
	settings.preventGlobalDuplicate = defaultSettings.preventGlobalDuplicate$;
	settings.mergeEqualLineStarts = defaultSettings.mergeEqualLineStarts$;
	settings.filterNonCJKLines = defaultSettings.filterNonCJKLines;
	settings.flashOnMissedLine = defaultSettings.flashOnMissedLine$;
	settings.displayVertical = defaultSettings.displayVertical$;
	settings.reverseLineOrder = defaultSettings.reverseLineOrder$;
	settings.preserveWhitespace = defaultSettings.preserveWhitespace$;
	settings.removeAllWhitespace = defaultSettings.removeAllWhitespace$;
	settings.showLinePoints = defaultSettings.showLinePoints$;
	settings.showTimer = defaultSettings.showTimer$;
	settings.showSpeed = defaultSettings.showSpeed$;
	settings.showCharacterCount = defaultSettings.showCharacterCount$;
	settings.showLineCount = defaultSettings.showLineCount$;
	settings.blurStats = defaultSettings.blurStats$;
	settings.enableLineAnimation = defaultSettings.enableLineAnimation$;
	settings.enableAfkBlur = defaultSettings.enableAfkBlur$;
	settings.enableAfkBlurRestart = defaultSettings.enableAfkBlurRestart$;
	settings.continuousReconnect = defaultSettings.continuousReconnect$;
	settings.showConnectionErrors = defaultSettings.showConnectionErrors$;
	settings.showConnectionIcon = defaultSettings.showConnectionIcon$;
	settings.customCSS = defaultSettings.customCSS$;
	onlayoutChange?.();
}
