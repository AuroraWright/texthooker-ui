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

// Replacements live in dataState; every other exported setting is a field of SettingsState.
export type SettingKey = Exclude<keyof Settings, 'replacements$'>;
type SettingField<K extends SettingKey> = K extends `${infer Field}$` ? Field : K;
type SettingFields = { [K in SettingKey as SettingField<K>]: Settings[K] };

export const settingKeys = Object.keys(defaultSettings).filter((key) => key !== 'replacements$') as SettingKey[];

// Exported keys keep their legacy "$" suffix; the field and storage names drop it.
function settingField<K extends SettingKey>(key: K) {
	return (key.endsWith('$') ? key.slice(0, -1) : key) as SettingField<K>;
}

function storageKey(key: SettingKey) {
	return key === 'secondaryWebsocketUrl$'
		? 'bannou-texthooker-secondary-websocketUrl'
		: `bannou-texthooker-${settingField(key)}`;
}

function initialSetting<K extends SettingKey>(key: K): Settings[K] {
	return readSetting(storageKey(key), defaultSettings[key]) as Settings[K];
}

// Older versions stored and exported some numeric settings (e.g. line padding) as strings.
export function settingOrDefault<K extends SettingKey>(key: K, value: unknown): Settings[K] {
	if (value === undefined || value === null) return defaultSettings[key];
	if (typeof defaultSettings[key] === 'number' && typeof value === 'string') return +value as Settings[K];
	return value as Settings[K];
}

export class SettingsState implements SettingFields {
	theme = $state(initialSetting('theme$'));
	windowTitle = $state(initialSetting('windowTitle$'));
	websocketUrl = $state(initialSetting('websocketUrl$'));
	secondaryWebsocketUrl = $state(initialSetting('secondaryWebsocketUrl$'));
	fontSize = $state(initialSetting('fontSize$'));
	linePadding = $state(initialSetting('linePadding$'));
	characterMilestone = $state(initialSetting('characterMilestone$'));
	onlineFont = $state(initialSetting('onlineFont$'));
	preventLastDuplicate = $state(initialSetting('preventLastDuplicate$'));
	maxLines = $state(initialSetting('maxLines$'));
	maxPipLines = $state(initialSetting('maxPipLines$'));
	afkTimer = $state(initialSetting('afkTimer$'));
	adjustTimerOnAfk = $state(initialSetting('adjustTimerOnAfk$'));
	enableExternalClipboardMonitor = $state(initialSetting('enableExternalClipboardMonitor$'));
	showPresetQuickSwitch = $state(initialSetting('showPresetQuickSwitch$'));
	skipResetConfirmations = $state(initialSetting('skipResetConfirmations$'));
	persistStats = $state(initialSetting('persistStats$'));
	persistNotes = $state(initialSetting('persistNotes$'));
	persistLines = $state(initialSetting('persistLines$'));
	persistActionHistory = $state(initialSetting('persistActionHistory$'));
	enablePaste = $state(initialSetting('enablePaste$'));
	blockCopyOnPage = $state(initialSetting('blockCopyOnPage$'));
	allowPasteDuringPause = $state(initialSetting('allowPasteDuringPause$'));
	allowNewLineDuringPause = $state(initialSetting('allowNewLineDuringPause$'));
	autoStartTimerDuringPausePaste = $state(initialSetting('autoStartTimerDuringPausePaste$'));
	autoStartTimerDuringPause = $state(initialSetting('autoStartTimerDuringPause$'));
	preventGlobalDuplicate = $state(initialSetting('preventGlobalDuplicate$'));
	mergeEqualLineStarts = $state(initialSetting('mergeEqualLineStarts$'));
	filterNonCJKLines = $state(initialSetting('filterNonCJKLines'));
	flashOnMissedLine = $state(initialSetting('flashOnMissedLine$'));
	displayVertical = $state(initialSetting('displayVertical$'));
	reverseLineOrder = $state(initialSetting('reverseLineOrder$'));
	preserveWhitespace = $state(initialSetting('preserveWhitespace$'));
	removeAllWhitespace = $state(initialSetting('removeAllWhitespace$'));
	showLinePoints = $state(initialSetting('showLinePoints$'));
	showTimer = $state(initialSetting('showTimer$'));
	showSpeed = $state(initialSetting('showSpeed$'));
	showCharacterCount = $state(initialSetting('showCharacterCount$'));
	showLineCount = $state(initialSetting('showLineCount$'));
	blurStats = $state(initialSetting('blurStats$'));
	enableLineAnimation = $state(initialSetting('enableLineAnimation$'));
	enableAfkBlur = $state(initialSetting('enableAfkBlur$'));
	enableAfkBlurRestart = $state(initialSetting('enableAfkBlurRestart$'));
	continuousReconnect = $state(initialSetting('continuousReconnect$'));
	showConnectionErrors = $state(initialSetting('showConnectionErrors$'));
	showConnectionIcon = $state(initialSetting('showConnectionIcon$'));
	customCSS = $state(initialSetting('customCSS$'));
	timeValue = $state<number>(readSetting('bannou-texthooker-timeValue', 0));
	notesOpen = $state<boolean>(readSetting('bannou-texthooker-notesOpen', false));
	lastSettingPreset = $state<string>(readSetting('bannou-texthooker-lastSettingPreset', ''));
	lastPipHeight = $state<number>(readSetting('bannou-texthooker-lastPipHeight', 0));
	lastPipWidth = $state<number>(readSetting('bannou-texthooker-lastPipWidth', 0));

	get<K extends SettingKey>(key: K): Settings[K] {
		return (this as Record<string, unknown>)[settingField(key)] as Settings[K];
	}

	set<K extends SettingKey>(key: K, value: Settings[K]) {
		(this as Record<string, unknown>)[settingField(key)] = value;
	}

	// Missing values fall back to their defaults, so an empty object resets every setting.
	assign(values: Partial<Settings>) {
		for (const key of settingKeys) this.set(key, settingOrDefault(key, values[key]));
	}

	startPersistence() {
		return $effect.root(() => this.#registerPersistence());
	}

	#registerPersistence() {
		for (const key of settingKeys) {
			persistSetting(storageKey(key), () => this.get(key), defaultSettings[key] as Settings[SettingKey]);
		}
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
