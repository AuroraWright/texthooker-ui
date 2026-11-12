import { dataState } from './data-state.svelte';
import { settings } from './settings.svelte';
import { countLineCharacters } from './line-character-counts';
import type { LineItem } from '../types';

interface CountedLines {
	lines: LineItem[] | undefined;
	rewrites: number;
	milestone: number;
	length: number;
	characters: number;
	nextMilestone: number;
	milestoneLines: Map<string, string>;
}

export class LineStatistics {
	// Appends only extend the running totals; any other change to the history recounts from the start.
	#counted: CountedLines = {
		lines: undefined,
		rewrites: -1,
		milestone: 0,
		length: 0,
		characters: 0,
		nextMilestone: 0,
		milestoneLines: new Map(),
	};

	#statistics = $derived.by(() => {
		const currentLines = dataState.lines;
		const rewrites = dataState.lineRewrites;
		const milestone = settings.characterMilestone > 1 ? settings.characterMilestone : 0;
		const previous = this.#counted;
		const isAppend = previous.lines === currentLines && previous.rewrites === rewrites
			&& previous.milestone === milestone && previous.length <= currentLines.length;
		let { characters, nextMilestone, milestoneLines } = isAppend
			? previous
			: { characters: 0, nextMilestone: milestone, milestoneLines: new Map<string, string>() };
		// Keep the map's identity unless a milestone is added, so rendered lines do not re-check it.
		let ownsMap = !isAppend;

		for (let index = isAppend ? previous.length : 0; index < currentLines.length; index++) {
			const line = currentLines[index];
			characters += countLineCharacters(line);

			if (nextMilestone && characters >= nextMilestone) {
				if (!ownsMap) {
					milestoneLines = new Map(milestoneLines);
					ownsMap = true;
				}
				milestoneLines.set(line.id, `Milestone ${nextMilestone} (${characters})`);
				while (characters >= nextMilestone) nextMilestone += milestone;
			}
		}

		this.#counted = {
			lines: currentLines,
			rewrites,
			milestone,
			length: currentLines.length,
			characters,
			nextMilestone,
			milestoneLines,
		};
		return { characters, milestoneLines: milestoneLines as ReadonlyMap<string, string> };
	});

	characters = $derived(this.#statistics.characters);
	milestoneLines = $derived(settings.characterMilestone > 1 ? this.#statistics.milestoneLines : emptyMilestones);
}

const emptyMilestones: ReadonlyMap<string, string> = new Map();
export const lineStatistics = new LineStatistics();
