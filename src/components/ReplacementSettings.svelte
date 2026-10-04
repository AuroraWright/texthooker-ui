<script lang="ts">
	interface Props {
		onapplyReplacements?: () => void;
	}
	let { onapplyReplacements }: Props = $props();

	import { mdiPlus } from '@mdi/js';
	import { replacements$ } from '../stores/stores';
	import type { ReplacementItem } from '../types';
	import Icon from './Icon.svelte';
	import ReplacementSettingsInput from './ReplacementSettingsInput.svelte';
	import ReplacementSettingsList from './ReplacementSettingsList.svelte';

	let inEditMode = $state(false);

	let currentReplacement: ReplacementItem | undefined = $state();

	function resetEditMode(_replacements: ReplacementItem[]) {
		inEditMode = false;
	}
	let hasReplacements = $derived(!!$replacements$.length);
	$effect(() => {
		resetEditMode($replacements$);
	});
</script>

<details class="col-span-4 mb-2 cursor-pointer max-w-lg">
	<summary>Replacements</summary>
	<div class="mb-8">
		{#if inEditMode}
			<ReplacementSettingsInput
				{currentReplacement}
				onclose={() => {
					inEditMode = false;
					currentReplacement = undefined;
				}}
			/>
		{:else if hasReplacements}
			{#key $replacements$}
				<ReplacementSettingsList
					onedit={(detail) => {
						currentReplacement = detail;
						inEditMode = true;
					}}
					{onapplyReplacements}
				/>
			{/key}
		{:else}
			<div class="flex justify-end my-2">
				<button title="Add replacement" class="ml-2 hover:text-primary" onclick={() => (inEditMode = true)}>
					<Icon path={mdiPlus} />
				</button>
			</div>
			<div>You have currently no replacements configured</div>
		{/if}
	</div>
</details>
