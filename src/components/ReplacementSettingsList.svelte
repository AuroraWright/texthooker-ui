<script lang="ts">
	interface Props {
		onedit?: (value: ReplacementItem | undefined) => void;
		onapplyReplacements?: () => void;
	}
	let { onedit, onapplyReplacements }: Props = $props();
	import {
		mdiDownloadMultiple,
		mdiPencil,
		mdiPlus,
		mdiToggleSwitchOffOutline,
		mdiToggleSwitchOutline,
		mdiTrashCanOutline,
	} from '@mdi/js';
	import Sortable, { Swap } from 'sortablejs';
	import { onMount } from 'svelte';
	import { enabledReplacements$, lineData$, replacements$ } from '../stores/stores';
	import type { ReplacementItem } from '../types';
	import Icon from './Icon.svelte';

	let sortableInstance: Sortable;
	let listContainer: HTMLDivElement = $state();
	let listItems = $state(JSON.parse(JSON.stringify($replacements$)));

	let canApplyReplacements = $derived(!!$lineData$.length && !!$enabledReplacements$.length);

	onMount(() => {
		try {
			Sortable.mount(new Swap());
		} catch (_) {
			// no-op
		}

		sortableInstance = Sortable.create(listContainer, {
			swap: true,
			swapClass: 'swap',
			animation: 150,
			store: {
				get: getSortableList,
				set: onUpdateList,
			},
		});

		return () => sortableInstance?.destroy();
	});

	function onToggle(newValue: boolean) {
		const sortedList = getSortedList();

		listItems = sortedList.map((replacement) => ({ ...replacement, enabled: newValue }));
		$replacements$ = $state.snapshot(listItems);
	}

	function onUpdateList() {
		$replacements$ = $state.snapshot(getSortedList());
	}

	function onReplaceItems(newReplacements: ReplacementItem[]) {
		listItems = newReplacements;
		$replacements$ = newReplacements;

		sortableInstance.sort(getSortableList(), false);
	}

	function getSortableList() {
		return [...listItems.map((replacments) => replacments.pattern)];
	}

	function getSortedList() {
		const sortedList = sortableInstance.toArray();

		return listItems.slice().sort((a, b) => sortedList.indexOf(a.pattern) - sortedList.indexOf(b.pattern));
	}
</script>

<div class="flex justify-end my-2">
	<button
		title="Apply to current lines"
		class:hover:text-primary={canApplyReplacements}
		class:cursor-not-allowed={!canApplyReplacements}
		disabled={!canApplyReplacements}
		onclick={() => onapplyReplacements?.()}
	>
		<Icon path={mdiDownloadMultiple} />
	</button>
	<button title="Add replacement" class="ml-2 hover:text-primary" onclick={() => onedit?.(undefined)}>
		<Icon path={mdiPlus} />
	</button>
	<button title="Enable all" class="ml-2 hover:text-primary" onclick={() => onToggle(true)}>
		<Icon path={mdiToggleSwitchOutline} />
	</button>
	<button title="Disable all" class="ml-2 hover:text-primary" onclick={() => onToggle(false)}>
		<Icon path={mdiToggleSwitchOffOutline} />
	</button>
	<button title="Remove all" class="ml-2 hover:text-primary" onclick={() => onReplaceItems([])}>
		<Icon path={mdiTrashCanOutline} />
	</button>
</div>
<div class="max-h-72 overflow-auto" bind:this={listContainer}>
	{#each listItems as replacement (replacement.pattern)}
		<div class="border my-2 p-2 flex items-center justify-between" data-id={replacement.pattern}>
			<div class="break-all">
				{replacement.pattern}
			</div>
			<div class="min-w-max ml-2">
				<button title="Edit" class="hover:text-primary" onclick={() => onedit?.(replacement)}>
					<Icon path={mdiPencil} height="1rem" />
				</button>
				<button
					title="Remove"
					class="hover:text-primary"
					onclick={() =>
						onReplaceItems($replacements$.filter((entry) => entry.pattern !== replacement.pattern))}
				>
					<Icon path={mdiTrashCanOutline} height="1rem" />
				</button>
				<input type="checkbox" class="ml-1" bind:checked={replacement.enabled} onchange={onUpdateList} />
			</div>
		</div>
	{/each}
</div>
