import { dataState } from './data-state.svelte';
import { appState } from './app-state.svelte';
import { tick } from 'svelte';
import { defaultSettings, settings } from './settings.svelte';
import { reconnectPrimarySocket, reconnectSecondarySocket } from '../events';
import type { SettingPreset, Settings } from '../types';

export function getCurrentSettings(): Settings {
	return {
		theme$: settings.theme,
		replacements$: dataState.replacements,
		windowTitle$: settings.windowTitle,
		websocketUrl$: settings.websocketUrl,
		secondaryWebsocketUrl$: settings.secondaryWebsocketUrl,
		fontSize$: settings.fontSize,
		linePadding$: settings.linePadding,
		characterMilestone$: settings.characterMilestone,
		onlineFont$: settings.onlineFont,
		preventLastDuplicate$: settings.preventLastDuplicate,
		maxLines$: settings.maxLines,
		maxPipLines$: settings.maxPipLines,
		afkTimer$: settings.afkTimer,
		adjustTimerOnAfk$: settings.adjustTimerOnAfk,
		enableExternalClipboardMonitor$: settings.enableExternalClipboardMonitor,
		showPresetQuickSwitch$: settings.showPresetQuickSwitch,
		skipResetConfirmations$: settings.skipResetConfirmations,
		persistStats$: settings.persistStats,
		persistNotes$: settings.persistNotes,
		persistLines$: settings.persistLines,
		persistActionHistory$: settings.persistActionHistory,
		enablePaste$: settings.enablePaste,
		blockCopyOnPage$: settings.blockCopyOnPage,
		allowPasteDuringPause$: settings.allowPasteDuringPause,
		allowNewLineDuringPause$: settings.allowNewLineDuringPause,
		autoStartTimerDuringPausePaste$: settings.autoStartTimerDuringPausePaste,
		autoStartTimerDuringPause$: settings.autoStartTimerDuringPause,
		preventGlobalDuplicate$: settings.preventGlobalDuplicate,
		mergeEqualLineStarts$: settings.mergeEqualLineStarts,
		filterNonCJKLines: settings.filterNonCJKLines,
		flashOnMissedLine$: settings.flashOnMissedLine,
		displayVertical$: settings.displayVertical,
		reverseLineOrder$: settings.reverseLineOrder,
		preserveWhitespace$: settings.preserveWhitespace,
		removeAllWhitespace$: settings.removeAllWhitespace,
		showLinePoints$: settings.showLinePoints,
		showTimer$: settings.showTimer,
		showSpeed$: settings.showSpeed,
		showCharacterCount$: settings.showCharacterCount,
		showLineCount$: settings.showLineCount,
		blurStats$: settings.blurStats,
		enableLineAnimation$: settings.enableLineAnimation,
		enableAfkBlur$: settings.enableAfkBlur,
		enableAfkBlurRestart$: settings.enableAfkBlurRestart,
		continuousReconnect$: settings.continuousReconnect,
		showConnectionErrors$: settings.showConnectionErrors,
		showConnectionIcon$: settings.showConnectionIcon,
		customCSS$: settings.customCSS,
	};
}

export function updateSettingsWithPreset(preset: SettingPreset, updateLastPreset = true, onlayoutChange?: () => void) {
	settings.theme = preset.settings.theme$ ?? defaultSettings.theme$;
	dataState.replacements = preset.settings.replacements$ ?? defaultSettings.replacements$;
	settings.windowTitle = preset.settings.windowTitle$ ?? defaultSettings.windowTitle$;
	settings.websocketUrl = preset.settings.websocketUrl$ ?? defaultSettings.websocketUrl$;
	settings.secondaryWebsocketUrl = preset.settings.secondaryWebsocketUrl$ ?? '';
	settings.fontSize = preset.settings.fontSize$ ?? defaultSettings.fontSize$;
	settings.linePadding = preset.settings.linePadding$ ?? defaultSettings.linePadding$;
	settings.characterMilestone = preset.settings.characterMilestone$ ?? defaultSettings.characterMilestone$;
	settings.onlineFont = preset.settings.onlineFont$ ?? defaultSettings.onlineFont$;
	settings.preventLastDuplicate = preset.settings.preventLastDuplicate$ ?? defaultSettings.preventLastDuplicate$;
	settings.maxLines = preset.settings.maxLines$ ?? defaultSettings.maxLines$;
	settings.maxPipLines = preset.settings.maxPipLines$ ?? defaultSettings.maxPipLines$;
	settings.afkTimer = preset.settings.afkTimer$ ?? defaultSettings.afkTimer$;
	settings.adjustTimerOnAfk = preset.settings.adjustTimerOnAfk$ ?? defaultSettings.adjustTimerOnAfk$;
	settings.enableExternalClipboardMonitor =
		preset.settings.enableExternalClipboardMonitor$ ?? defaultSettings.enableExternalClipboardMonitor$;
	settings.showPresetQuickSwitch = preset.settings.showPresetQuickSwitch$ ?? defaultSettings.showPresetQuickSwitch$;
	settings.skipResetConfirmations = preset.settings.skipResetConfirmations$ ?? defaultSettings.skipResetConfirmations$;
	settings.persistStats = preset.settings.persistStats$ ?? defaultSettings.persistStats$;
	settings.persistNotes = preset.settings.persistNotes$ ?? defaultSettings.persistNotes$;
	settings.persistLines = preset.settings.persistLines$ ?? defaultSettings.persistLines$;
	settings.persistActionHistory = preset.settings.persistActionHistory$ ?? defaultSettings.persistActionHistory$;
	settings.enablePaste = preset.settings.enablePaste$ ?? defaultSettings.enablePaste$;
	settings.blockCopyOnPage = preset.settings.blockCopyOnPage$ ?? defaultSettings.blockCopyOnPage$;
	settings.allowPasteDuringPause = preset.settings.allowPasteDuringPause$ ?? defaultSettings.allowPasteDuringPause$;
	settings.allowNewLineDuringPause =
		preset.settings.allowNewLineDuringPause$ ?? defaultSettings.allowNewLineDuringPause$;
	settings.autoStartTimerDuringPausePaste =
		preset.settings.autoStartTimerDuringPausePaste$ ?? defaultSettings.autoStartTimerDuringPausePaste$;
	settings.autoStartTimerDuringPause =
		preset.settings.autoStartTimerDuringPause$ ?? defaultSettings.autoStartTimerDuringPause$;
	settings.preventGlobalDuplicate = preset.settings.preventGlobalDuplicate$ ?? defaultSettings.preventGlobalDuplicate$;
	settings.mergeEqualLineStarts = preset.settings.mergeEqualLineStarts$ ?? defaultSettings.mergeEqualLineStarts$;
	settings.filterNonCJKLines = preset.settings.filterNonCJKLines ?? defaultSettings.filterNonCJKLines;
	settings.flashOnMissedLine = preset.settings.flashOnMissedLine$ ?? defaultSettings.flashOnMissedLine$;
	settings.displayVertical = preset.settings.displayVertical$ ?? defaultSettings.displayVertical$;
	settings.reverseLineOrder = preset.settings.reverseLineOrder$ ?? defaultSettings.reverseLineOrder$;
	settings.preserveWhitespace = preset.settings.preserveWhitespace$ ?? defaultSettings.preserveWhitespace$;
	settings.removeAllWhitespace = preset.settings.removeAllWhitespace$ ?? defaultSettings.removeAllWhitespace$;
	settings.showLinePoints = preset.settings.showLinePoints$ ?? defaultSettings.showLinePoints$;
	settings.showTimer = preset.settings.showTimer$ ?? defaultSettings.showTimer$;
	settings.showSpeed = preset.settings.showSpeed$ ?? defaultSettings.showSpeed$;
	settings.showCharacterCount = preset.settings.showCharacterCount$ ?? defaultSettings.showCharacterCount$;
	settings.showLineCount = preset.settings.showLineCount$ ?? defaultSettings.showLineCount$;
	settings.blurStats = preset.settings.blurStats$ ?? defaultSettings.blurStats$;
	settings.enableLineAnimation = preset.settings.enableLineAnimation$ ?? defaultSettings.enableLineAnimation$;
	settings.enableAfkBlur = preset.settings.enableAfkBlur$ ?? defaultSettings.enableAfkBlur$;
	settings.enableAfkBlurRestart = preset.settings.enableAfkBlurRestart$ ?? defaultSettings.enableAfkBlurRestart$;
	settings.continuousReconnect = preset.settings.continuousReconnect$ ?? defaultSettings.continuousReconnect$;
	settings.showConnectionErrors = preset.settings.showConnectionErrors$ ?? defaultSettings.showConnectionErrors$;
	settings.showConnectionIcon = preset.settings.showConnectionIcon$ ?? defaultSettings.showConnectionIcon$;
	settings.customCSS = preset.settings.customCSS$ ?? defaultSettings.customCSS$;
	dataState.prepareCharacterCounts();

	if (updateLastPreset) {
		settings.lastSettingPreset = preset.name;
	}

	tick().then(() => {
		onlayoutChange?.();

		if (appState.socketState !== 1 && settings.continuousReconnect) {
			reconnectPrimarySocket.emit();
		}

		if (appState.secondarySocketState !== 1 && settings.continuousReconnect) {
			reconnectSecondarySocket.emit();
		}
	});
}
