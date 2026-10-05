import type { LineItem, ReplacementItem, SettingPreset } from '../types';
import { clearReplacementCaches } from '../util';
import { appState } from './app-state.svelte';
import { IDBValue, JSONValue } from './persistent-value.svelte';
import { settings } from './settings.svelte';
import { cacheLineCharacterCounts } from './line-character-counts';

function historyValue<T>(key: string, shallPersist: () => boolean, onLoaded?: () => void) {
	return new IDBValue<T[]>({
		key,
		defaultValue: [],
		shallPersist,
		onLoaded,
		parseLegacy: (stored) => JSON.parse(stored),
		isEmpty: (value) => !value || value.length === 0,
		merge: (loaded, current) => (current.length ? [...loaded, ...current] : loaded),
	});
}

export class DataState {
	#presets = new JSONValue<SettingPreset[]>('bannou-texthooker-settingPresets', []);
	#replacements = new JSONValue<ReplacementItem[]>('bannou-texthooker-replacements', []);
	#notes = new IDBValue<string>({
		key: 'bannou-texthooker-userNotes',
		defaultValue: '',
		shallPersist: () => settings.persistNotes,
		parseLegacy: (stored) => stored,
		isEmpty: (value) => value === undefined || value === '',
		merge: (loaded, current) => (current ? loaded + '\n' + current : loaded),
	});
	#lines = historyValue<LineItem>(
		'bannou-texthooker-lineData',
		() => settings.persistLines,
		() => {
			cacheLineCharacterCounts(this.lines);
			appState.showSpinner = false;
		},
	);
	#history = historyValue<LineItem[]>('bannou-texthooker-actionHistory', () => settings.persistActionHistory);
	readonly enabledReplacements = $derived(this.replacements.filter((replacement) => replacement.enabled));

	get settingPresets() {
		return this.#presets.value;
	}
	set settingPresets(value: SettingPreset[]) {
		this.#presets.value = value;
	}
	get replacements() {
		return this.#replacements.value;
	}
	set replacements(value: ReplacementItem[]) {
		this.#replacements.value = value;
		clearReplacementCaches();
	}
	get userNotes() {
		return this.#notes.value;
	}
	set userNotes(value: string) {
		this.#notes.value = value;
	}
	get lines() {
		return this.#lines.value;
	}
	set lines(value: LineItem[]) {
		this.#lines.value = value;
	}
	get actionHistory() {
		return this.#history.value;
	}
	set actionHistory(value: LineItem[][]) {
		this.#history.value = value;
	}
}

export const dataState = new DataState();
