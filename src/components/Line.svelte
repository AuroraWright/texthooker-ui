<script lang="ts">
	import { mdiTrophy } from '@mdi/js';
	import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import {
		displayVertical$,
		enableLineAnimation$,
		milestoneLines$,
		preserveWhitespace$,
		linePadding$,
		showLinePoints$,
		newLines
	} from '../stores/stores';
	import type { LineItem, LineItemEditEvent } from '../types';
	import { dummyFn, newLineCharacter } from '../util';
	import Icon from './Icon.svelte';

	export let line: LineItem;
	export let pipWindow: Window = undefined;
	export let isSelected = false;
	export let searchQuery = '';
	export let isCurrentMatchLine = false;

	const isNew = newLines.has(line);
	const dispatch = createEventDispatcher<{
		deselected: string;
		selected: string;
		edit: LineItemEditEvent;
	}>();

	let paragraph: HTMLElement;
	let originalText = '';
	let isEditable = false;

	$: isVerticalDisplay = !pipWindow && $displayVertical$;

	onMount(() => {
		if (isNew && !pipWindow) {
			newLines.delete(line);
		}
	});

	onDestroy(() => {
		document.removeEventListener('click', clickOutsideHandler, false);

		if (isEditable && paragraph) {
			isEditable = false;
			dispatch('edit', { inEdit: false });
		}
	});

	function handleDblClick(event: MouseEvent) {
		if (pipWindow) {
			return;
		}

		window.getSelection()?.removeAllRanges();

		if (event.ctrlKey || event.metaKey) {
			if (isSelected) {
				dispatch('deselected', line.id);
			} else {
				dispatch('selected', line.id);
			}
		} else {
			originalText = paragraph.innerText;
			isEditable = true;
			dispatch('edit', { inEdit: true });
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
				dispatch('edit', {
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
		return text.split(regex).filter(Boolean).map(part => ({
			match: part.toLowerCase() === query.toLowerCase(),
			text: part
		}));
	}

	function lineFly(node: HTMLElement) {
		if (!$enableLineAnimation$ || !isNew) {
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
	style:padding-top={!isVerticalDisplay ? `${$linePadding$}rem` : undefined}
	style:padding-bottom={!isVerticalDisplay ? `${$linePadding$}rem` : undefined}
	style:padding-left={isVerticalDisplay ? `${$linePadding$}rem` : undefined}
	style:padding-right={isVerticalDisplay ? `${$linePadding$}rem` : undefined}
	class:border-transparent={!isSelected}
	class:cursor-text={isEditable}
	class:border-primary={isSelected}
	class:border-accent-focus={isEditable}
	class:whitespace-pre-wrap={$preserveWhitespace$}
	class:show-bullet={$showLinePoints$}
	contenteditable={isEditable}
	on:dblclick={handleDblClick}
	on:keyup={dummyFn}
	bind:this={paragraph}
	in:lineFly
>
	{#if !isEditable && searchQuery}
		{#each getSegments(line.text, searchQuery) as segment}
			{#if segment.match}
				<mark
					class="text-black"
					class:bg-yellow-300={!isCurrentMatchLine}
					class:bg-amber-500={isCurrentMatchLine}
				>{segment.text}</mark>
			{:else}
				{segment.text}
			{/if}
		{/each}
	{:else}
		{line.text}
	{/if}
</p>
{@html newLineCharacter}
{#if $milestoneLines$.has(line.id)}
	<div
		class="flex justify-center text-xs my-2 py-2 border-primary border-dashed milestone"
		class:border-x-2={$displayVertical$}
		class:border-y-2={!$displayVertical$}
		class:px-2={!isVerticalDisplay}
		class:py-2={isVerticalDisplay}
		style:padding-top={!isVerticalDisplay ? `${$linePadding$}rem` : undefined}
		style:padding-bottom={!isVerticalDisplay ? `${$linePadding$}rem` : undefined}
		style:padding-left={isVerticalDisplay ? `${$linePadding$}rem` : undefined}
		style:padding-right={isVerticalDisplay ? `${$linePadding$}rem` : undefined}
	>
		<div class="flex items-center">
			<Icon class={$displayVertical$ ? '' : 'mr-2'} path={mdiTrophy} />
			<span class:mt-2={$displayVertical$}>{$milestoneLines$.get(line.id)}</span>
		</div>
	</div>
	{@html newLineCharacter}
{/if}

<style>
	p:focus-visible {
		outline: none;
	}
	.show-bullet::before {
		content: "• ";
		opacity: 0.1;
		transition: opacity 0.3s;
	}
	.show-bullet:hover::before {
		opacity: 1;
	}
</style>
