<script lang="ts">
	import { mdiTrophy } from '@mdi/js';
	import { createEventDispatcher, onDestroy, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import {
		displayVertical$,
		enableLineAnimation$,
		milestoneLines$,
		preserveWhitespace$,
		reverseLineOrder$,
	} from '../stores/stores';
	import type { LineItem, LineItemEditEvent } from '../types';
	import { dummyFn, newLineCharacter, updateScroll } from '../util';
	import Icon from './Icon.svelte';

	export let line: LineItem;
	export let pipWindow: Window = undefined;
	export let isSelected = false;
	export let isNew = false;

	const dispatch = createEventDispatcher<{
		deselected: string;
		selected: string;
		edit: LineItemEditEvent;
	}>();

	let paragraph: HTMLElement;
	let originalText = '';
	let isEditable = false;

	$: isVerticalDisplay = !pipWindow && $displayVertical$;

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
	        if (isEditable) { // Only dispatch if it hasn't been closed already
	            isEditable = false;
	            document.removeEventListener('click', clickOutsideHandler, false);
	            dispatch('edit', {
	                inEdit: false,
	                data: { originalText, newText: paragraph.innerText, lineIndex: -1, line },
	            });
	        }
	    }
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
	class="my-2 cursor-pointer border-2"
	class:py-4={!isVerticalDisplay}
	class:px-2={!isVerticalDisplay}
	class:py-2={isVerticalDisplay}
	class:px-4={isVerticalDisplay}
	class:border-transparent={!isSelected}
	class:cursor-text={isEditable}
	class:border-primary={isSelected}
	class:border-accent-focus={isEditable}
	class:whitespace-pre-wrap={$preserveWhitespace$}
	contenteditable={isEditable}
	on:dblclick={handleDblClick}
	on:keyup={dummyFn}
	bind:this={paragraph}
	in:lineFly
>
	{line.text}
</p>
{@html newLineCharacter}
{#if $milestoneLines$.has(line.id)}
	<div
		class="flex justify-center text-xs my-2 py-2 border-primary border-dashed milestone"
		class:border-x-2={$displayVertical$}
		class:border-y-2={!$displayVertical$}
		class:py-4={!isVerticalDisplay}
		class:px-2={!isVerticalDisplay}
		class:py-2={isVerticalDisplay}
		class:px-4={isVerticalDisplay}
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
</style>