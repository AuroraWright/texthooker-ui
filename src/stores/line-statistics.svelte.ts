import { dataState } from './data-state.svelte';
import { settings } from './settings.svelte';
import { countLineCharacters } from './line-character-counts';

export class LineStatistics {
	#statistics = $derived.by(() => {
		const currentLines = dataState.lines;
		const milestone = settings.characterMilestone > 1 ? settings.characterMilestone : 0;
		const milestoneLines = new Map<string, string>();
		let characters = 0;
		let nextMilestone = milestone;

		for (const line of currentLines) {
			characters += countLineCharacters(line);

			if (nextMilestone && characters >= nextMilestone) {
				milestoneLines.set(line.id, `Milestone ${nextMilestone} (${characters})`);
				while (characters >= nextMilestone) nextMilestone += milestone;
			}
		}

		return { characters, milestoneLines };
	});

	characters = $derived(this.#statistics.characters);
	milestoneLines = $derived(settings.characterMilestone > 1 ? this.#statistics.milestoneLines : emptyMilestones);
}

const emptyMilestones: ReadonlyMap<string, string> = new Map();
export const lineStatistics = new LineStatistics();
