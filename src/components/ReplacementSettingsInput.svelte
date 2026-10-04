<script lang="ts">
	import { mdiCancel, mdiFloppy, mdiInformation } from '@mdi/js';
	import { untrack } from 'svelte';
	import { debounceTime, Subject, tap } from 'rxjs';
	import { replacements$ } from '../stores/stores';
	import type { ReplacementItem } from '../types';
	import { applyReplacements, reduceToEmptyString } from '../util';
	import Icon from './Icon.svelte';

	interface Props {
		onclose?: () => void;
		currentReplacement: ReplacementItem | undefined;
	}

	let { onclose, currentReplacement }: Props = $props();

	const applyPattern$ = new Subject<void>();
	const replacement: ReplacementItem = $state(
		untrack(() =>
			currentReplacement
				? JSON.parse(JSON.stringify(currentReplacement))
				: { pattern: '', replaces: '', flags: [], enabled: true },
		),
	);
	const flags = [
		{ label: 'global', value: 'g' },
		{ label: 'multiline', value: 'm' },
		{ label: 'insensitive', value: 'i' },
		{ label: 'unicode', value: 'u' },
	];

	const executePattern$ = applyPattern$.pipe(
		debounceTime(500),
		tap(() => {
			try {
				currentPatternError = '';

				if (!replacement.pattern || !currentTestValue) {
					return;
				}

				currentTestOutcome = applyReplacements(currentTestValue, [replacement]);
			} catch ({ message }) {
				currentPatternError = `Error: ${message}`;
			}
		}),
		reduceToEmptyString(),
	);

	let patternInput: HTMLInputElement = $state();
	let currentTestValue = $state('');
	let currentTestOutcome = $state('');
	let currentPatternError = $state('');

	function onExecutePattern() {
		patternInput.setCustomValidity(currentPatternError);

		applyPattern$.next();
	}

	function onSave() {
		if (!currentReplacement && $replacements$.find((entry) => entry.pattern === replacement.pattern)) {
			patternInput.setCustomValidity('This pattern already exists');

			return patternInput.reportValidity();
		}

		if (currentReplacement) {
			$replacements$ = $replacements$.map((entry) => {
				if (entry.pattern === currentReplacement.pattern) {
					return $state.snapshot(replacement);
				}

				return entry;
			});
		} else {
			$replacements$ = [...$replacements$, $state.snapshot(replacement)];
		}

		onclose?.();
	}
</script>

{$executePattern$ ?? ''}
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
