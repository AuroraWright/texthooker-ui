import { OnlineFont, Theme, type Settings } from '../types';
import { readSetting, persistSetting } from './persisted-settings.svelte';

export const defaultSettings: Settings = {
	theme$: Theme.BUSINESS,
	replacements$: [],
	windowTitle$: '',
	websocketUrl$: 'ws://localhost:6677',
	secondaryWebsocketUrl$: '',
	fontSize$: 24,
	linePadding$: 1,
	characterMilestone$: 0,
	onlineFont$: OnlineFont.OFF,
	preventLastDuplicate$: 0,
	maxLines$: 0,
	maxPipLines$: 1,
	afkTimer$: 0,
	adjustTimerOnAfk$: false,
	enableExternalClipboardMonitor$: false,
	showPresetQuickSwitch$: false,
	skipResetConfirmations$: false,
	persistStats$: true,
	persistNotes$: true,
	persistLines$: true,
	persistActionHistory$: false,
	enablePaste$: false,
	blockCopyOnPage$: false,
	allowPasteDuringPause$: false,
	allowNewLineDuringPause$: false,
	autoStartTimerDuringPausePaste$: false,
	autoStartTimerDuringPause$: false,
	preventGlobalDuplicate$: false,
	mergeEqualLineStarts$: false,
	filterNonCJKLines: false,
	flashOnMissedLine$: true,
	displayVertical$: false,
	reverseLineOrder$: false,
	preserveWhitespace$: true,
	removeAllWhitespace$: false,
	showLinePoints$: false,
	showTimer$: true,
	showSpeed$: true,
	showCharacterCount$: true,
	showLineCount$: true,
	blurStats$: false,
	enableLineAnimation$: false,
	enableAfkBlur$: false,
	enableAfkBlurRestart$: false,
	continuousReconnect$: false,
	showConnectionErrors$: true,
	showConnectionIcon$: true,
	customCSS$: '',
};

export class SettingsState {
	theme = $state(readSetting('bannou-texthooker-theme', defaultSettings.theme$));
	windowTitle = $state(readSetting('bannou-texthooker-windowTitle', defaultSettings.windowTitle$));
	websocketUrl = $state(readSetting('bannou-texthooker-websocketUrl', defaultSettings.websocketUrl$));
	secondaryWebsocketUrl = $state(
		readSetting('bannou-texthooker-secondary-websocketUrl', defaultSettings.secondaryWebsocketUrl$),
	);
	fontSize = $state(readSetting('bannou-texthooker-fontSize', defaultSettings.fontSize$));
	linePadding = $state(readSetting('bannou-texthooker-linePadding', defaultSettings.linePadding$));
	characterMilestone = $state(readSetting('bannou-texthooker-characterMilestone', defaultSettings.characterMilestone$));
	onlineFont = $state(readSetting('bannou-texthooker-onlineFont', defaultSettings.onlineFont$));
	preventLastDuplicate = $state(
		readSetting('bannou-texthooker-preventLastDuplicate', defaultSettings.preventLastDuplicate$),
	);
	maxLines = $state(readSetting('bannou-texthooker-maxLines', defaultSettings.maxLines$));
	maxPipLines = $state(readSetting('bannou-texthooker-maxPipLines', defaultSettings.maxPipLines$));
	afkTimer = $state(readSetting('bannou-texthooker-afkTimer', defaultSettings.afkTimer$));
	adjustTimerOnAfk = $state(readSetting('bannou-texthooker-adjustTimerOnAfk', defaultSettings.adjustTimerOnAfk$));
	enableExternalClipboardMonitor = $state(
		readSetting('bannou-texthooker-enableExternalClipboardMonitor', defaultSettings.enableExternalClipboardMonitor$),
	);
	showPresetQuickSwitch = $state(
		readSetting('bannou-texthooker-showPresetQuickSwitch', defaultSettings.showPresetQuickSwitch$),
	);
	skipResetConfirmations = $state(
		readSetting('bannou-texthooker-skipResetConfirmations', defaultSettings.skipResetConfirmations$),
	);
	persistStats = $state(readSetting('bannou-texthooker-persistStats', defaultSettings.persistStats$));
	persistNotes = $state(readSetting('bannou-texthooker-persistNotes', defaultSettings.persistNotes$));
	persistLines = $state(readSetting('bannou-texthooker-persistLines', defaultSettings.persistLines$));
	persistActionHistory = $state(
		readSetting('bannou-texthooker-persistActionHistory', defaultSettings.persistActionHistory$),
	);
	enablePaste = $state(readSetting('bannou-texthooker-enablePaste', defaultSettings.enablePaste$));
	blockCopyOnPage = $state(readSetting('bannou-texthooker-blockCopyOnPage', defaultSettings.blockCopyOnPage$));
	allowPasteDuringPause = $state(
		readSetting('bannou-texthooker-allowPasteDuringPause', defaultSettings.allowPasteDuringPause$),
	);
	allowNewLineDuringPause = $state(
		readSetting('bannou-texthooker-allowNewLineDuringPause', defaultSettings.allowNewLineDuringPause$),
	);
	autoStartTimerDuringPausePaste = $state(
		readSetting('bannou-texthooker-autoStartTimerDuringPausePaste', defaultSettings.autoStartTimerDuringPausePaste$),
	);
	autoStartTimerDuringPause = $state(
		readSetting('bannou-texthooker-autoStartTimerDuringPause', defaultSettings.autoStartTimerDuringPause$),
	);
	preventGlobalDuplicate = $state(
		readSetting('bannou-texthooker-preventGlobalDuplicate', defaultSettings.preventGlobalDuplicate$),
	);
	mergeEqualLineStarts = $state(
		readSetting('bannou-texthooker-mergeEqualLineStarts', defaultSettings.mergeEqualLineStarts$),
	);
	filterNonCJKLines = $state(readSetting('bannou-texthooker-filterNonCJKLines', defaultSettings.mergeEqualLineStarts$));
	flashOnMissedLine = $state(readSetting('bannou-texthooker-flashOnMissedLine', defaultSettings.flashOnMissedLine$));
	displayVertical = $state(readSetting('bannou-texthooker-displayVertical', defaultSettings.displayVertical$));
	reverseLineOrder = $state(readSetting('bannou-texthooker-reverseLineOrder', defaultSettings.reverseLineOrder$));
	preserveWhitespace = $state(readSetting('bannou-texthooker-preserveWhitespace', defaultSettings.preserveWhitespace$));
	removeAllWhitespace = $state(
		readSetting('bannou-texthooker-removeAllWhitespace', defaultSettings.removeAllWhitespace$),
	);
	showLinePoints = $state(readSetting('bannou-texthooker-showLinePoints', defaultSettings.showLinePoints$));
	showTimer = $state(readSetting('bannou-texthooker-showTimer', defaultSettings.showTimer$));
	showSpeed = $state(readSetting('bannou-texthooker-showSpeed', defaultSettings.showSpeed$));
	showCharacterCount = $state(readSetting('bannou-texthooker-showCharacterCount', defaultSettings.showCharacterCount$));
	showLineCount = $state(readSetting('bannou-texthooker-showLineCount', defaultSettings.showLineCount$));
	blurStats = $state(readSetting('bannou-texthooker-blurStats', defaultSettings.blurStats$));
	enableLineAnimation = $state(
		readSetting('bannou-texthooker-enableLineAnimation', defaultSettings.enableLineAnimation$),
	);
	enableAfkBlur = $state(readSetting('bannou-texthooker-enableAfkBlur', defaultSettings.enableAfkBlur$));
	enableAfkBlurRestart = $state(
		readSetting('bannou-texthooker-enableAfkBlurRestart', defaultSettings.enableAfkBlurRestart$),
	);
	continuousReconnect = $state(
		readSetting('bannou-texthooker-continuousReconnect', defaultSettings.continuousReconnect$),
	);
	showConnectionErrors = $state(
		readSetting('bannou-texthooker-showConnectionErrors', defaultSettings.showConnectionErrors$),
	);
	showConnectionIcon = $state(readSetting('bannou-texthooker-showConnectionIcon', defaultSettings.showConnectionIcon$));
	customCSS = $state(readSetting('bannou-texthooker-customCSS', defaultSettings.customCSS$));
	timeValue = $state<number>(readSetting('bannou-texthooker-timeValue', 0));
	notesOpen = $state<boolean>(readSetting('bannou-texthooker-notesOpen', false));
	lastSettingPreset = $state<string>(readSetting('bannou-texthooker-lastSettingPreset', ''));
	lastPipHeight = $state<number>(readSetting('bannou-texthooker-lastPipHeight', 0));
	lastPipWidth = $state<number>(readSetting('bannou-texthooker-lastPipWidth', 0));

	startPersistence() {
		return $effect.root(() => this.#registerPersistence());
	}

	#registerPersistence() {
		persistSetting('bannou-texthooker-theme', () => this.theme, defaultSettings.theme$);
		persistSetting('bannou-texthooker-windowTitle', () => this.windowTitle, defaultSettings.windowTitle$);
		persistSetting('bannou-texthooker-websocketUrl', () => this.websocketUrl, defaultSettings.websocketUrl$);
		persistSetting(
			'bannou-texthooker-secondary-websocketUrl',
			() => this.secondaryWebsocketUrl,
			defaultSettings.secondaryWebsocketUrl$,
		);
		persistSetting('bannou-texthooker-fontSize', () => this.fontSize, defaultSettings.fontSize$);
		persistSetting('bannou-texthooker-linePadding', () => this.linePadding, defaultSettings.linePadding$);
		persistSetting(
			'bannou-texthooker-characterMilestone',
			() => this.characterMilestone,
			defaultSettings.characterMilestone$,
		);
		persistSetting('bannou-texthooker-onlineFont', () => this.onlineFont, defaultSettings.onlineFont$);
		persistSetting(
			'bannou-texthooker-preventLastDuplicate',
			() => this.preventLastDuplicate,
			defaultSettings.preventLastDuplicate$,
		);
		persistSetting('bannou-texthooker-maxLines', () => this.maxLines, defaultSettings.maxLines$);
		persistSetting('bannou-texthooker-maxPipLines', () => this.maxPipLines, defaultSettings.maxPipLines$);
		persistSetting('bannou-texthooker-afkTimer', () => this.afkTimer, defaultSettings.afkTimer$);
		persistSetting(
			'bannou-texthooker-adjustTimerOnAfk',
			() => this.adjustTimerOnAfk,
			defaultSettings.adjustTimerOnAfk$,
		);
		persistSetting(
			'bannou-texthooker-enableExternalClipboardMonitor',
			() => this.enableExternalClipboardMonitor,
			defaultSettings.enableExternalClipboardMonitor$,
		);
		persistSetting(
			'bannou-texthooker-showPresetQuickSwitch',
			() => this.showPresetQuickSwitch,
			defaultSettings.showPresetQuickSwitch$,
		);
		persistSetting(
			'bannou-texthooker-skipResetConfirmations',
			() => this.skipResetConfirmations,
			defaultSettings.skipResetConfirmations$,
		);
		persistSetting('bannou-texthooker-persistStats', () => this.persistStats, defaultSettings.persistStats$);
		persistSetting('bannou-texthooker-persistNotes', () => this.persistNotes, defaultSettings.persistNotes$);
		persistSetting('bannou-texthooker-persistLines', () => this.persistLines, defaultSettings.persistLines$);
		persistSetting(
			'bannou-texthooker-persistActionHistory',
			() => this.persistActionHistory,
			defaultSettings.persistActionHistory$,
		);
		persistSetting('bannou-texthooker-enablePaste', () => this.enablePaste, defaultSettings.enablePaste$);
		persistSetting('bannou-texthooker-blockCopyOnPage', () => this.blockCopyOnPage, defaultSettings.blockCopyOnPage$);
		persistSetting(
			'bannou-texthooker-allowPasteDuringPause',
			() => this.allowPasteDuringPause,
			defaultSettings.allowPasteDuringPause$,
		);
		persistSetting(
			'bannou-texthooker-allowNewLineDuringPause',
			() => this.allowNewLineDuringPause,
			defaultSettings.allowNewLineDuringPause$,
		);
		persistSetting(
			'bannou-texthooker-autoStartTimerDuringPausePaste',
			() => this.autoStartTimerDuringPausePaste,
			defaultSettings.autoStartTimerDuringPausePaste$,
		);
		persistSetting(
			'bannou-texthooker-autoStartTimerDuringPause',
			() => this.autoStartTimerDuringPause,
			defaultSettings.autoStartTimerDuringPause$,
		);
		persistSetting(
			'bannou-texthooker-preventGlobalDuplicate',
			() => this.preventGlobalDuplicate,
			defaultSettings.preventGlobalDuplicate$,
		);
		persistSetting(
			'bannou-texthooker-mergeEqualLineStarts',
			() => this.mergeEqualLineStarts,
			defaultSettings.mergeEqualLineStarts$,
		);
		persistSetting(
			'bannou-texthooker-filterNonCJKLines',
			() => this.filterNonCJKLines,
			defaultSettings.mergeEqualLineStarts$,
		);
		persistSetting(
			'bannou-texthooker-flashOnMissedLine',
			() => this.flashOnMissedLine,
			defaultSettings.flashOnMissedLine$,
		);
		persistSetting('bannou-texthooker-displayVertical', () => this.displayVertical, defaultSettings.displayVertical$);
		persistSetting(
			'bannou-texthooker-reverseLineOrder',
			() => this.reverseLineOrder,
			defaultSettings.reverseLineOrder$,
		);
		persistSetting(
			'bannou-texthooker-preserveWhitespace',
			() => this.preserveWhitespace,
			defaultSettings.preserveWhitespace$,
		);
		persistSetting(
			'bannou-texthooker-removeAllWhitespace',
			() => this.removeAllWhitespace,
			defaultSettings.removeAllWhitespace$,
		);
		persistSetting('bannou-texthooker-showLinePoints', () => this.showLinePoints, defaultSettings.showLinePoints$);
		persistSetting('bannou-texthooker-showTimer', () => this.showTimer, defaultSettings.showTimer$);
		persistSetting('bannou-texthooker-showSpeed', () => this.showSpeed, defaultSettings.showSpeed$);
		persistSetting(
			'bannou-texthooker-showCharacterCount',
			() => this.showCharacterCount,
			defaultSettings.showCharacterCount$,
		);
		persistSetting('bannou-texthooker-showLineCount', () => this.showLineCount, defaultSettings.showLineCount$);
		persistSetting('bannou-texthooker-blurStats', () => this.blurStats, defaultSettings.blurStats$);
		persistSetting(
			'bannou-texthooker-enableLineAnimation',
			() => this.enableLineAnimation,
			defaultSettings.enableLineAnimation$,
		);
		persistSetting('bannou-texthooker-enableAfkBlur', () => this.enableAfkBlur, defaultSettings.enableAfkBlur$);
		persistSetting(
			'bannou-texthooker-enableAfkBlurRestart',
			() => this.enableAfkBlurRestart,
			defaultSettings.enableAfkBlurRestart$,
		);
		persistSetting(
			'bannou-texthooker-continuousReconnect',
			() => this.continuousReconnect,
			defaultSettings.continuousReconnect$,
		);
		persistSetting(
			'bannou-texthooker-showConnectionErrors',
			() => this.showConnectionErrors,
			defaultSettings.showConnectionErrors$,
		);
		persistSetting(
			'bannou-texthooker-showConnectionIcon',
			() => this.showConnectionIcon,
			defaultSettings.showConnectionIcon$,
		);
		persistSetting('bannou-texthooker-customCSS', () => this.customCSS, defaultSettings.customCSS$);
		persistSetting(
			'bannou-texthooker-timeValue',
			() => this.timeValue,
			0,
			() => this.persistStats,
		);
		persistSetting('bannou-texthooker-notesOpen', () => this.notesOpen, false);
		persistSetting('bannou-texthooker-lastSettingPreset', () => this.lastSettingPreset, '');
		persistSetting('bannou-texthooker-lastPipHeight', () => this.lastPipHeight, 0);
		persistSetting('bannou-texthooker-lastPipWidth', () => this.lastPipWidth, 0);
	}
}

export const settings = new SettingsState();
