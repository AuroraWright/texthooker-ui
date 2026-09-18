<script lang="ts">
	import {
		combineLatest,
		debounceTime,
		fromEvent,
		interval,
		merge,
		NEVER,
		startWith,
		switchMap,
		tap,
		throttleTime,
	} from 'rxjs';
	import { createEventDispatcher } from 'svelte';
	import {
		adjustTimerOnAfk$,
		afkTimer$,
		blurStats$,
		characterMilestone$,
		enableAfkBlur$,
		enableAfkBlurRestart$,
		isPaused$,
		lineData$,
		milestoneLines$,
		newLine$,
		showCharacterCount$,
		showLineCount$,
		showSpeed$,
		showTimer$,
		timeValue$,
	} from '../stores/stores';
	import { reduceToEmptyString, toTimeString } from '../util';

	let lastTick = 0;
	let idleTime = 0;

	let charCountCache = new Map<string, number>();
	let cachedLineTexts = new Map<string, string>();
	let lastProcessedLineCount = 0;

	const dispatch = createEventDispatcher<{ afkBlur: boolean }>();

	const isNotJapaneseRegex = /[^0-9A-Z○◯々-〇〻ぁ-ゖゝ-ゞァ-ヺー０-９Ａ-Ｚｦ-ﾝ\p{Radical}\p{Unified_Ideograph}]+/gimu;

	const timer$ = isPaused$.pipe(
		switchMap((isPaused) => {
			if (isPaused) {
				idleTime = 0;

				return NEVER;
			}

			lastTick = performance.now();

			return interval(1000);
		}),
		tap(updateElapsedTime),
		reduceToEmptyString(),
	);

	const waitForIdle$ = combineLatest([isPaused$, afkTimer$]).pipe(
		switchMap(([isPaused, afkTimer]) =>
			isPaused || afkTimer < 1
				? NEVER
				: merge(
						newLine$,
						fromEvent<PointerEvent>(window, 'pointermove'),
						fromEvent<Event>(document, 'selectionchange'),
					).pipe(
						startWith(true),
						throttleTime(1000),
						tap(() => (idleTime = performance.now() + $afkTimer$ * 1000)),
						debounceTime($afkTimer$ * 1000),
					),
		),
		reduceToEmptyString(),
	);

	let timerElm: HTMLElement;
	let speed = 0;
	let characters = 0;
	let statstring = '';

	$: if (($showCharacterCount$ || $characterMilestone$ > 1) && $lineData$) {
		let currentCount = 0;
		let nextMilestone = $characterMilestone$ > 1 ? $characterMilestone$ : 0;
		const currentIds = new Set<string>();
		const needsCleanup = $lineData$.length < lastProcessedLineCount;
		const newMilestones = new Map<string, string>();
		lastProcessedLineCount = $lineData$.length;

		for (let i = 0, len = $lineData$.length; i < len; i++) {
			const line = $lineData$[i];
			if (needsCleanup) currentIds.add(line.id);

			let lineCharCount = charCountCache.get(line.id);
			if (lineCharCount === undefined || cachedLineTexts.get(line.id) !== line.text) {
				lineCharCount = getCharacterCount(line.text);
				charCountCache.set(line.id, lineCharCount);
				cachedLineTexts.set(line.id, line.text);
			}

			currentCount += lineCharCount;

			if (nextMilestone && currentCount >= nextMilestone) {
				newMilestones.set(line.id, `Milestone ${nextMilestone} (${currentCount})`);
				while (currentCount >= nextMilestone) {
					nextMilestone += $characterMilestone$;
				}
			}
		}

		if (needsCleanup) {
			for (const id of charCountCache.keys()) {
				if (!currentIds.has(id)) {
					charCountCache.delete(id);
					cachedLineTexts.delete(id);
				}
			}
		}

		$milestoneLines$ = newMilestones;
		characters = currentCount;
		speed = $timeValue$ ? Math.ceil((3600 * characters) / $timeValue$) : 0;
	}

	$: if ($timeValue$ > -1 && ($showTimer$ || $showSpeed$ || $showCharacterCount$ || $showLineCount$)) {
		buildString($timeValue$, speed, characters, $lineData$.length);
	} else {
		statstring = '';
	}

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
			$isPaused$ = true;

			if ($adjustTimerOnAfk$) {
				$timeValue$ = Math.max(0, $timeValue$ + elapsed - $afkTimer$);
			} else {
				$timeValue$ += elapsed;
			}

			if ($enableAfkBlur$) {
				dispatch('afkBlur', true);

				document.addEventListener(
					'dblclick',
					(event) => {
						event.stopPropagation();

						window.getSelection().removeAllRanges();

						dispatch('afkBlur', false);

						if ($enableAfkBlurRestart$) {
							$isPaused$ = false;
						}
					},
					{ once: true, capture: false },
				);
			}
		} else {
			lastTick = now;
			$timeValue$ += elapsed;
		}
	}

	function getCharacterCount(text: string) {
		if (!text) return 0;
		return countUnicodeCharacters(text.replace(isNotJapaneseRegex, ''));
	}

	function countUnicodeCharacters(s: string) {
		let count = 0;
		for (const _ of s) {
			count += 1;
		}
		return count;
	}

	function buildString(currentTime: number, currentSpeed: number, currentCharacters: number, currentLines: number) {
		let newString = '';

		if ($showTimer$) {
			newString += toTimeString(currentTime);
		}

		if ($showSpeed$) {
			newString += ` (${currentSpeed}/h) `;
		}

		if ($showCharacterCount$) {
			newString += ` ${currentCharacters}`;
		}

		if ($showLineCount$) {
			newString += $showCharacterCount$ ? ' /' : '';
			newString += ` ${currentLines}`;
		}

		statstring = newString.replace(/[ ]+/g, ' ').trim();
	}
</script>

{$timer$ ?? ''}
{$waitForIdle$ ?? ''}

<div
	class="text-sm timer mr-1 sm:text-base sm:mr-2"
	class:blur={$blurStats$}
	bind:this={timerElm}
	on:pointerleave={handlePointerLeave}
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
