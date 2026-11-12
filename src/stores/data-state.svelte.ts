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

export function changeTextCount(counts: Map<string, number>, text: string, delta: number) {
	const count = (counts.get(text) ?? 0) + delta;
	if (count > 0) counts.set(text, count);
	else counts.delete(text);
}

export class DataState {
	#lineRevision = $state(0);
	// Counts every change other than a plain append, so derived totals know when to recount from the start.
	#lineRewrites = 0;
	#textCounts: Map<string, number> | undefined;
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
			this.#textCounts = undefined;
			this.prepareCharacterCounts();
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
		this.#lineRevision;
		return this.#lines.value;
	}
	get lineRewrites() {
		return this.#lineRewrites;
	}
	set lines(value: LineItem[]) {
		this.#textCounts = undefined;
		this.#lineRewrites += 1;
		if (value === this.#lines.value) this.#lineRevision += 1;
		this.#lines.value = value;
	}

	// Append without copying the full raw history; the revision publishes the mutation.
	appendLine(line: LineItem, removeFirst = 0, mergePrevious = false) {
		const lines = this.#lines.value;
		const removed = removeFirst ? lines.splice(0, removeFirst) : [];
		if (mergePrevious && lines.length) removed.push(lines.pop()!);
		if (removed.length) this.#lineRewrites += 1;
		lines.push(line);
		if (this.#textCounts) {
			for (const previous of removed) changeTextCount(this.#textCounts, previous.text, -1);
			changeTextCount(this.#textCounts, line.text, 1);
		}
		this.#lineRevision += 1;
		this.#lines.value = lines;
	}

	// Copy into the existing array, so derived samples keyed on array identity stay stable.
	// Assign a new array instead when the content is replaced wholesale and should be resampled.
	assignLines(next: LineItem[]) {
		const lines = this.#lines.value;
		lines.length = next.length;
		for (let index = 0; index < next.length; index++) lines[index] = next[index];
		this.lines = lines;
	}

	// Remove in place like appendLine, so derived samples keyed on array identity stay stable.
	// The predicate sees the original indices; the array is only compacted after all rows are visited.
	removeLines(shouldRemove: (line: LineItem, index: number) => boolean) {
		const lines = this.#lines.value;
		const removed: LineItem[] = [];
		let write = 0;
		for (let index = 0; index < lines.length; index++) {
			const line = lines[index];
			if (shouldRemove(line, index)) removed.push(line);
			else lines[write++] = line;
		}
		if (!removed.length) return removed;
		lines.length = write;
		this.#lineRewrites += 1;
		if (this.#textCounts) {
			for (const previous of removed) changeTextCount(this.#textCounts, previous.text, -1);
		}
		this.#lineRevision += 1;
		this.#lines.value = lines;
		return removed;
	}

	get lineTextCounts(): ReadonlyMap<string, number> {
		if (!settings.preventGlobalDuplicate) return emptyTextCounts;
		if (!this.#textCounts) {
			this.#textCounts = new Map();
			for (const line of this.#lines.value) changeTextCount(this.#textCounts, line.text, 1);
		}
		return this.#textCounts;
	}

	prepareCharacterCounts(lines = this.lines) {
		if (settings.showCharacterCount || settings.showSpeed || settings.characterMilestone > 1) {
			cacheLineCharacterCounts(lines);
		}
	}
	get actionHistory() {
		return this.#history.value;
	}
	set actionHistory(value: LineItem[][]) {
		this.#history.value = value;
	}
}

const emptyTextCounts: ReadonlyMap<string, number> = new Map();
export const dataState = new DataState();
