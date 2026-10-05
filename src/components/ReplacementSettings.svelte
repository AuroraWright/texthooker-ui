<script lang="ts">
	import { dataState } from '../stores/data-state.svelte';

	interface Props {
		onapplyReplacements?: () => void;
	}
	let { onapplyReplacements }: Props = $props();

	import { mdiPlus } from '@mdi/js';
	import type { ReplacementItem } from '../types';
	import Icon from './Icon.svelte';
	import ReplacementSettingsInput from './ReplacementSettingsInput.svelte';
	import ReplacementSettingsList from './ReplacementSettingsList.svelte';

	let editSession = $state.raw<{
		replacements: ReplacementItem[];
		currentReplacement: ReplacementItem | undefined;
	}>();
	let inEditMode = $derived(!!editSession && editSession.replacements === dataState.replacements);

	function startEditing(currentReplacement: ReplacementItem | undefined) {
		editSession = { replacements: dataState.replacements, currentReplacement };
	}
	let hasReplacements = $derived(!!dataState.replacements.length);
</script>

<details class="col-span-4 mb-2 cursor-pointer max-w-lg">
	<summary>Replacements</summary>
	<div class="mb-8">
		{#if inEditMode}
			<ReplacementSettingsInput
				currentReplacement={editSession.currentReplacement}
				onclose={() => (editSession = undefined)}
			/>
		{:else if hasReplacements}
			<ReplacementSettingsList onedit={startEditing} {onapplyReplacements} />
		{:else}
			<div class="flex justify-end my-2">
				<button title="Add replacement" class="ml-2 hover:text-primary" onclick={() => startEditing(undefined)}>
					<Icon path={mdiPlus} />
				</button>
			</div>
			<div>You have currently no replacements configured</div>
		{/if}
	</div>
</details>
