<script lang="ts">
	import { dataState } from '../stores/data-state.svelte';
	import { appState } from '../stores/app-state.svelte';
	import { setPaused } from '../stores/state-actions';

	import { settings } from '../stores/settings.svelte';
	import { lineStatistics } from '../stores/line-statistics.svelte';

	interface Props {
		onafkBlur?: (value: boolean) => void;
	}
	let { onafkBlur }: Props = $props();

	import { incomingLine } from '../events';
	import { onDestroy } from 'svelte';
	import { toTimeString } from '../util';

	let lastTick = 0;
	let idleTime = 0;

	$effect(() => {
		if (appState.isPaused) {
			idleTime = 0;
			return;
		}
		lastTick = performance.now();
		const timer = window.setInterval(updateElapsedTime, 1000);
		return () => window.clearInterval(timer);
	});

	$effect(() => {
		const afkTimer = settings.afkTimer;
		if (appState.isPaused || afkTimer < 1) {
			idleTime = 0;
			return;
		}

		let lastActivity = -Infinity;
		function recordActivity() {
			const now = performance.now();
			if (now - lastActivity < 1000) return;
			lastActivity = now;
			idleTime = now + afkTimer * 1000;
		}

		recordActivity();
		window.addEventListener('pointermove', recordActivity);
		document.addEventListener('selectionchange', recordActivity);
		const unsubscribe = incomingLine.subscribe(recordActivity);
		return () => {
			window.removeEventListener('pointermove', recordActivity);
			document.removeEventListener('selectionchange', recordActivity);
			unsubscribe();
		};
	});

	onDestroy(() => document.removeEventListener('dblclick', handleAfkResume));

	let timerElm: HTMLElement = $state();
	let characters = $derived(lineStatistics.characters);
	let speed = $derived(settings.timeValue ? Math.ceil((3600 * characters) / settings.timeValue) : 0);
	let statstring = $derived(
		settings.timeValue > -1 && (settings.showTimer || settings.showSpeed || settings.showCharacterCount || settings.showLineCount)
			? buildString(settings.timeValue, speed, characters, dataState.lines.length)
			: '',
	);

	function handlePointerLeave() {
		const selection = window.getSelection();

		if (selection?.toString() && selection.getRangeAt(0).intersectsNode(timerElm)) {
			selection.removeAllRanges();
		}
	}

	function updateElapsedTime() {
		const now = idleTime ? Math.min(idleTime, performance.now()) : performance.now();
		const elapsed = Math.round((now - lastTick + Number.EPSILON) / 1000);

		if (idleTime && now >= idleTime) {
			setPaused(true);

			if (settings.adjustTimerOnAfk) {
				settings.timeValue = Math.max(0, settings.timeValue + elapsed - settings.afkTimer);
			} else {
				settings.timeValue += elapsed;
			}

			if (settings.enableAfkBlur) {
				onafkBlur?.(true);

				document.addEventListener('dblclick', handleAfkResume, { once: true });
			}
		} else {
			lastTick = now;
			settings.timeValue += elapsed;
		}
	}

	function handleAfkResume(event: MouseEvent) {
		event.stopPropagation();
		window.getSelection()?.removeAllRanges();
		onafkBlur?.(false);
		if (settings.enableAfkBlurRestart) setPaused(false);
	}

	function buildString(currentTime: number, currentSpeed: number, currentCharacters: number, currentLines: number) {
		let newString = '';

		if (settings.showTimer) {
			newString += toTimeString(currentTime);
		}

		if (settings.showSpeed) {
			newString += ` (${currentSpeed}/h) `;
		}

		if (settings.showCharacterCount) {
			newString += ` ${currentCharacters}`;
		}

		if (settings.showLineCount) {
			newString += settings.showCharacterCount ? ' /' : '';
			newString += ` ${currentLines}`;
		}

		return newString.replace(/[ ]+/g, ' ').trim();
	}
</script>

<div
	role="status"
	class="text-sm timer mr-1 sm:text-base sm:mr-2"
	class:blur={settings.blurStats}
	bind:this={timerElm}
	onpointerleave={handlePointerLeave}
>
	<div>{statstring}</div>
</div>

<style>
	.timer {
		transition: 0.1s filter linear;
	}

	.blur:hover {
		filter: blur(0);
	}

	.blur:not(:hover) {
		filter: blur(0.25rem);
	}
</style>
