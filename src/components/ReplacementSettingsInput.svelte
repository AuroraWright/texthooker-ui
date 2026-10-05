<script lang="ts">
	import { dataState } from '../stores/data-state.svelte';

	import { mdiCancel, mdiFloppy, mdiInformation } from '@mdi/js';
	import { onDestroy, untrack } from 'svelte';
	import type { ReplacementItem } from '../types';
	import { applyReplacements } from '../util';
	import Icon from './Icon.svelte';

	interface Props {
		onclose?: () => void;
		currentReplacement: ReplacementItem | undefined;
	}

	let { onclose, currentReplacement }: Props = $props();

	let previewTimeout: number;
	const replacement: ReplacementItem = $state(
		untrack(() =>
			currentReplacement
				? { ...currentReplacement, flags: [...currentReplacement.flags] }
				: { pattern: '', replaces: '', flags: [], enabled: true },
		),
	);
	const flags = [
		{ label: 'global', value: 'g' },
		{ label: 'multiline', value: 'm' },
		{ label: 'insensitive', value: 'i' },
		{ label: 'unicode', value: 'u' },
	];

	function updatePreview() {
		try {
			currentPatternError = '';
			if (!replacement.pattern || !currentTestValue) return;
			currentTestOutcome = applyReplacements(currentTestValue, [replacement]);
		} catch ({ message }) {
			currentPatternError = `Error: ${message}`;
		}
	}

	onDestroy(() => window.clearTimeout(previewTimeout));

	let patternInput: HTMLInputElement = $state();
	let currentTestValue = $state('');
	let currentTestOutcome = $state('');
	let currentPatternError = $state('');

	function onExecutePattern() {
		patternInput.setCustomValidity(currentPatternError);

		window.clearTimeout(previewTimeout);
		previewTimeout = window.setTimeout(updatePreview, 500);
	}

	function onSave() {
		if (!currentReplacement && dataState.replacements.find((entry) => entry.pattern === replacement.pattern)) {
			patternInput.setCustomValidity('This pattern already exists');

			return patternInput.reportValidity();
		}

		if (currentReplacement) {
			dataState.replacements = dataState.replacements.map((entry) => {
				if (entry.pattern === currentReplacement.pattern) {
					return $state.snapshot(replacement);
				}

				return entry;
			});
		} else {
			dataState.replacements = [...dataState.replacements, $state.snapshot(replacement)];
		}

		onclose?.();
	}
</script>

<div class="flex justify-end my-2">
	{#if replacement.pattern}
		<button title="Save" class="hover:text-primary" onclick={onSave}>
			<Icon path={mdiFloppy} />
		</button>
	{/if}
	<button title="Cancel" class="ml-2 hover:text-primary" onclick={() => onclose?.()}>
		<Icon path={mdiCancel} />
	</button>
	<button
		title="Cancel"
		class="ml-2 hover:text-primary"
		onclick={() =>
			window.open(
				'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#description',
				'_blank',
			)}
	>
		<Icon path={mdiInformation} />
	</button>
</div>
<div>
	<input
		placeholder="text pattern"
		class="w-full my-2"
		bind:value={replacement.pattern}
		bind:this={patternInput}
		oninput={onExecutePattern}
	/>
	<input
		placeholder="replacement pattern"
		class="w-full my-2"
		bind:value={replacement.replaces}
		oninput={onExecutePattern}
	/>
	<div class="flex justify-between my-4">
		{#each flags as flag (flag.value)}
			<label>
				<input type="checkbox" value={flag.value} bind:group={replacement.flags} onchange={onExecutePattern} />
				{flag.label}
			</label>
		{/each}
	</div>
	<textarea
		name="test-value"
		placeholder="test value"
		class="w-full my-4"
		rows="3"
		bind:value={currentTestValue}
		oninput={onExecutePattern}
	></textarea>
	<div class="whitespace-pre-wrap break-all">
		{@html currentPatternError || currentTestOutcome}
	</div>
</div>
