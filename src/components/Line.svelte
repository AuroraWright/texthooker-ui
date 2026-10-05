<script lang="ts">
	import { settings } from '../stores/settings.svelte';
	import { lineStatistics } from '../stores/line-statistics.svelte';

	import { mdiTrophy } from '@mdi/js';
	import { untrack, onDestroy, onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { newLines, pipNewLines } from '../stores/stores';
	import type { LineItem, LineItemEditEvent } from '../types';
	import { dummyFn, newLineCharacter } from '../util';
	import Icon from './Icon.svelte';

	interface Props {
		ondeselected?: (value: string) => void;
		onselected?: (value: string) => void;
		onedit?: (value: LineItemEditEvent) => void;
		line: LineItem;
		pipWindow?: Window;
		isSelected?: boolean;
		searchQuery?: string;
		isCurrentMatchLine?: boolean;
	}

	let {
		ondeselected,
		onselected,
		onedit,
		line,
		pipWindow = undefined,
		isSelected = false,
		searchQuery = '',
		isCurrentMatchLine = false,
	}: Props = $props();

	const isNew = untrack(() => (pipWindow ? pipNewLines.has(line) : newLines.has(line)));

	let paragraph: HTMLElement = $state();
	let originalText = '';
	let isEditable = $state(false);

	let isVerticalDisplay = $derived(!pipWindow && settings.displayVertical);

	onMount(() => {
		if (isNew) {
			const targetSet = pipWindow ? pipNewLines : newLines;
			for (const addedLine of targetSet) {
				targetSet.delete(addedLine);
				if (addedLine === line) {
					break;
				}
			}
		}
	});

	onDestroy(() => {
		document.removeEventListener('click', clickOutsideHandler, false);

		if (isEditable && paragraph) {
			isEditable = false;
			onedit?.({ inEdit: false });
		}
	});

	function handleDblClick(event: MouseEvent) {
		if (pipWindow) {
			return;
		}

		window.getSelection()?.removeAllRanges();

		if (event.ctrlKey || event.metaKey) {
			if (isSelected) {
				ondeselected?.(line.id);
			} else {
				onselected?.(line.id);
			}
		} else {
			originalText = paragraph.innerText;
			isEditable = true;
			onedit?.({ inEdit: true });
			document.addEventListener('click', clickOutsideHandler, false);
			tick().then(() => {
				paragraph.focus();
			});
		}
	}

	function clickOutsideHandler(event: MouseEvent) {
		const target = event.target as Node;
		if (!paragraph.contains(target)) {
			if (isEditable) {
				isEditable = false;
				document.removeEventListener('click', clickOutsideHandler, false);
				onedit?.({
					inEdit: false,
					data: { originalText, newText: paragraph.innerText, lineIndex: -1, line },
				});
			}
		}
	}

	function getSegments(text: string, query: string) {
		if (!query) return [{ match: false, text }];
		const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(`(${escaped})`, 'gi');
		return text
			.split(regex)
			.filter(Boolean)
			.map((part) => ({
				match: part.toLowerCase() === query.toLowerCase(),
				text: part,
			}));
	}

	function lineFly(node: HTMLElement, _params?: unknown) {
		if (!settings.enableLineAnimation || !isNew) {
			return { duration: 0, delay: 0 };
		}
		return fly(node, { x: isVerticalDisplay ? 100 : -100, duration: 250 });
	}
</script>

<p
	data-line-id={line.id}
	class="my-2 cursor-default border-2"
	class:px-2={!isVerticalDisplay}
	class:py-2={isVerticalDisplay}
	style:padding-top={!isVerticalDisplay ? `${settings.linePadding}rem` : undefined}
	style:padding-bottom={!isVerticalDisplay ? `${settings.linePadding}rem` : undefined}
	style:padding-left={isVerticalDisplay ? `${settings.linePadding}rem` : undefined}
	style:padding-right={isVerticalDisplay ? `${settings.linePadding}rem` : undefined}
	class:border-transparent={!isSelected}
	class:cursor-text={isEditable}
	class:border-primary={isSelected}
	class:border-accent-focus={isEditable}
	class:whitespace-pre-wrap={settings.preserveWhitespace}
	class:show-bullet={settings.showLinePoints}
	contenteditable={isEditable}
	ondblclick={handleDblClick}
	onkeyup={dummyFn}
	bind:this={paragraph}
	in:lineFly|global
>
	{#if !isEditable && searchQuery}
		{#each getSegments(line.text, searchQuery) as segment}
			{#if segment.match}
				<mark
					class="text-black"
					class:bg-yellow-300={!isCurrentMatchLine}
					class:bg-amber-500={isCurrentMatchLine}>{segment.text}</mark
				>
			{:else}
				{segment.text}
			{/if}
		{/each}
	{:else}
		{line.text}
	{/if}
</p>
{@html newLineCharacter}
{#if lineStatistics.milestoneLines.has(line.id)}
	<div
		class="flex justify-center text-xs my-2 py-2 border-primary border-dashed milestone"
		class:border-x-2={settings.displayVertical}
		class:border-y-2={!settings.displayVertical}
		class:px-2={!isVerticalDisplay}
		class:py-2={isVerticalDisplay}
		style:padding-top={!isVerticalDisplay ? `${settings.linePadding}rem` : undefined}
		style:padding-bottom={!isVerticalDisplay ? `${settings.linePadding}rem` : undefined}
		style:padding-left={isVerticalDisplay ? `${settings.linePadding}rem` : undefined}
		style:padding-right={isVerticalDisplay ? `${settings.linePadding}rem` : undefined}
	>
		<div class="flex items-center">
			<Icon class={settings.displayVertical ? '' : 'mr-2'} path={mdiTrophy}></Icon>
			<span class:mt-2={settings.displayVertical}>{lineStatistics.milestoneLines.get(line.id)}</span>
		</div>
	</div>
	{@html newLineCharacter}
{/if}

<style>
	p:focus-visible {
		outline: none;
	}
	.show-bullet::before {
		content: '• ';
		opacity: 0.1;
		transition: opacity 0.3s;
	}
	.show-bullet:hover::before {
		opacity: 1;
	}
</style>
