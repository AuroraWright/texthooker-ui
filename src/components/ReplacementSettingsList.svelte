<script lang="ts">
	import { dataState } from '../stores/data-state.svelte';

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
	import type { ReplacementItem } from '../types';
	import Icon from './Icon.svelte';

	let sortableInstance: Sortable;
	let dragNodes: ChildNode[] = [];
	let listContainer: HTMLDivElement = $state();
	let listItems = $derived(dataState.replacements);

	let canApplyReplacements = $derived(!!dataState.lines.length && !!dataState.enabledReplacements.length);

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
			onChoose: () => {
				dragNodes = Array.from(listContainer.childNodes);
			},
			onEnd: onUpdateList,
		});

		return () => sortableInstance?.destroy();
	});

	function onToggle(newValue: boolean) {
		const sortedList = getSortedList();

		dataState.replacements = sortedList.map((replacement) => ({ ...replacement, enabled: newValue }));
	}

	function onUpdateList() {
		const order = getSortedList();
		// Restore complete keyed rows, including Svelte's markers, before its update.
		for (const node of dragNodes) listContainer.appendChild(node);
		dragNodes = [];
		dataState.replacements = order;
	}

	function onReplaceItems(newReplacements: ReplacementItem[]) {
		dataState.replacements = newReplacements;
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
						onReplaceItems(dataState.replacements.filter((entry) => entry.pattern !== replacement.pattern))}
				>
					<Icon path={mdiTrashCanOutline} height="1rem" />
				</button>
				<input
					type="checkbox"
					class="ml-1"
					checked={replacement.enabled}
					onchange={(event) => {
						const enabled = event.currentTarget.checked;
						dataState.replacements = listItems.map((entry) =>
							entry.pattern === replacement.pattern ? { ...entry, enabled } : entry);
					}}
				/>
			</div>
		</div>
	{/each}
</div>
