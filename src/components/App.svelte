<script lang="ts">
	import {
		mdiArrowULeftTop,
		mdiCancel,
		mdiCog,
		mdiDelete,
		mdiDeleteForever,
		mdiNoteEdit,
		mdiPause,
		mdiPlay,
		mdiWindowMaximize,
		mdiWindowRestore,
	} from '@mdi/js';
	import { debounceTime, filter, fromEvent, map, NEVER, switchMap, tap } from 'rxjs';
	import { onMount, tick } from 'svelte';
	import { quintInOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import VirtualList from './VirtualList.svelte';
	import {
		actionHistory$,
		allowNewLineDuringPause$,
		allowPasteDuringPause$,
		autoStartTimerDuringPause$,
		autoStartTimerDuringPausePaste$,
		blockCopyOnPage$,
		characterMilestone$,
		customCSS$,
		dialogOpen$,
		displayVertical$,
		enabledReplacements$,
		enableLineAnimation$,
		enablePaste$,
		filterNonCJKLines$,
		flashOnMissedLine$,
		flashOnPauseTimeout$,
		fontSize$,
		isPaused$,
		lastPipHeight$,
		lastPipWidth$,
		lineData$,
		linePadding$,
		maxLines$,
		maxPipLines$,
		mergeEqualLineStarts$,
		milestoneLines$,
		newLine$,
		notesOpen$,
		onlineFont$,
		openDialog$,
		preventGlobalDuplicate$,
		preventLastDuplicate$,
		preserveWhitespace$,
		removeAllWhitespace$,
		replacements$,
		reverseLineOrder$,
		secondaryWebsocketUrl$,
		showConnectionIcon$,
		showLinePoints$,
		showSpinner$,
		theme$,
		websocketUrl$,
		newLines
	} from '../stores/stores';
	import { LineType, OnlineFont, Theme, type LineItem, type LineItemEditEvent } from '../types';
	import {
		applyAfkBlur,
		applyCustomCSS,
		applyReplacements,
		generateRandomUUID,
		newLineCharacter,
		reduceToEmptyString,
		updateScroll,
	} from '../util';
	import DialogManager from './DialogManager.svelte';
	import Icon from './Icon.svelte';
	import Line from './Line.svelte';
	import Notes from './Notes.svelte';
	import Presets from './Presets.svelte';
	import Settings from './Settings.svelte';
	import SocketConnector from './SocketConnector.svelte';
	import Spinner from './Spinner.svelte';
	import Stats from './Stats.svelte';

	let isSmFactor = false;
	let settingsComponent: Settings;
	let selectedLineIds: string[] = [];
	let settingsContainer: HTMLElement;
	let settingsElement: SVGElement;
	let settingsOpen = false;
	let lineContainer: HTMLElement;
	let lineInEdit = false;
	let blockNextExternalLine = false;
	let wakeLock = null;
	let pipContainer: HTMLElement;
	let pipWindow: Window | undefined;
	let pipResizeTimeout: number;
	let hasPipFocus = false;
	let recomputePending = false;
	let pendingInvalidations = new Set<number>();
	let initialScrollDone = false;
	let virtualListRef: any;
	let lineSizes = new Map<string, number>();
	let listWidth = 0;
	let listHeight = 0;
	let lastReflowDimension = 0;
	let showSearch = false;
	let searchInputRef: HTMLInputElement;
	let searchQuery = '';
	let matchIndices: number[] = [];
	let currentMatchStep = 0;
	let searchJumpIndex: number | undefined = undefined;
	let measuredHeight = 0;
	let measuredWidth = 0;

	const wakeLockAvailable = 'wakeLock' in navigator;
	const cjkCharacters = /[\p{scx=Hira}\p{scx=Kana}\p{scx=Han}]/imu;

	const uniqueLines$ = preventGlobalDuplicate$.pipe(
		map((preventGlobalDuplicate) =>
			preventGlobalDuplicate ? new Set<string>($lineData$.map((line) => line.text)) : new Set<string>(),
		),
	);

	const handleLine$ = newLine$.pipe(
		filter(([_, lineType]) => {
			const isPaste = lineType === LineType.PASTE;
			const hasNoUserInteraction = !$notesOpen$ && !$dialogOpen$ && !settingsOpen && !lineInEdit;

			const skipExternalLine = blockNextExternalLine && lineType === LineType.EXTERNAL;
			if (skipExternalLine) {
				blockNextExternalLine = false;
			}

			if (
				(!$isPaused$ ||
					(($allowPasteDuringPause$ || $autoStartTimerDuringPausePaste$) && isPaste) ||
					(($allowNewLineDuringPause$ || $autoStartTimerDuringPause$) && !isPaste)) &&
				hasNoUserInteraction &&
				!skipExternalLine
			) {
				return true;
			}

			if (!skipExternalLine && hasNoUserInteraction && $flashOnMissedLine$) {
				handleMissedLine();
			}

			return false;
		}),
		tap((newLine: [string, LineType]) => {
			const [lineContent, lineType] = newLine;
			const text = transformLine(lineContent);

			if (text) {
				const isPaste = lineType === LineType.PASTE;
				const currentLines = applyMaxLinesAndGetRemainingLineData(1);
				const newId = generateRandomUUID();
				const item: LineItem = { id: newId, text };

				if (initialScrollDone && !$showSpinner$ && !showSearch) {
					newLines.add(item);
				}
				currentLines.push(item);
				$lineData$ = applyEqualLineStartMerge(currentLines);
				if ($reverseLineOrder$) {
					virtualListRef?.shiftIndices(1);
				}
				tick().then(() => executeUpdateScroll());

				if (
					$isPaused$ &&
					(($autoStartTimerDuringPausePaste$ && isPaste) || ($autoStartTimerDuringPause$ && !isPaste))
				) {
					$isPaused$ = false;
				}
			}
		}),
		reduceToEmptyString(),
	);

	const pasteHandler$ = enablePaste$.pipe(
		switchMap((enablePaste) => (enablePaste ? fromEvent<ClipboardEvent>(document, 'paste') : NEVER)),
		filter((event) => {
			const target = event.target as HTMLElement;
			return target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable;
		}),
		tap((event: ClipboardEvent) => newLine$.next([event.clipboardData.getData('text/plain'), LineType.PASTE])),
		reduceToEmptyString(),
	);

	const visibilityHandler$ = fromEvent(document, 'visibilitychange').pipe(
		tap(() => {
			if (wakeLockAvailable && wakeLock !== null && document.visibilityState === 'visible') {
				wakeLock = navigator.wakeLock
					.request('screen')
					.then((lock) => {
						return lock;
					})
					.catch((error) => {
						console.error(`Unable to aquire screen lock: ${error.message}`);
						return null;
					});
			}
		}),
		reduceToEmptyString(),
	);

	const copyBlocker$ = blockCopyOnPage$.pipe(
		switchMap((blockCopyOnPage) => {
			blockNextExternalLine = false;

			return blockCopyOnPage ? fromEvent(document, 'copy') : NEVER;
		}),
		tap(() => (blockNextExternalLine = true)),
		reduceToEmptyString(),
	);

	const resizeHandler$ = fromEvent(window, 'resize').pipe(
		debounceTime(500),
		tap(mountFunction),
		reduceToEmptyString(),
	);

	const virtualItemSize = (index: number) => {
		const actualIndex = mapIndex(index);
		const line = $lineData$[actualIndex];
		return line ? lineSizes.get(line.id) : undefined;
	};

	const mountedNodes = new Map<string, { node: HTMLElement; getVirtual: () => number }>();

	$: iconSize = isSmFactor ? '1.5rem' : '1.25rem';

	$: listScrollBehavior = $enableLineAnimation$ ? 'smooth' : 'auto';

	$: $enabledReplacements$ = $replacements$.filter((replacment) => replacment.enabled);

	$: pipAvailable = 'documentPictureInPicture' in window && !!pipContainer;

	$: pipLines = pipAvailable && $lineData$ ? $lineData$.slice(-$maxPipLines$) : [];

	$: estimatedItemSize = $displayVertical$ 
		? (measuredWidth || ($fontSize$ * 1.5 + 36)) 
		: (measuredHeight || ($fontSize$ * 1.5 + 52));

	$: if (pipWindow) {
		pipWindow.document.body.dataset.theme = $theme$;

		applyCustomCSS(pipWindow.document, $customCSS$);
	}

	$: if (!$showSpinner$ && !initialScrollDone) {
		initialScrollDone = true;
		tick().then(() => executeUpdateScroll(true));
	}

	$: {
		const currentReflowDimension = $displayVertical$ ? listHeight : listWidth;
		
		if (currentReflowDimension !== lastReflowDimension) {
			if (lastReflowDimension !== 0) {
				lineSizes.clear();
				virtualListRef?.clearCache();
				tick().then(remeasureMountedLines);
			}
			lastReflowDimension = currentReflowDimension;
		}
	}

	$: {
		$displayVertical$;
		$reverseLineOrder$;
		$fontSize$;
		$onlineFont$;
		$linePadding$;
		$showLinePoints$;
		$customCSS$;
		$preserveWhitespace$;
		$removeAllWhitespace$;
		$characterMilestone$;

		lineSizes.clear();
		virtualListRef?.clearCache();
		tick().then(remeasureMountedLines);
	}

	$: if ($onlineFont$ && typeof document !== 'undefined' && document.fonts) {
		document.fonts.ready.then(() => {
			tick().then(remeasureMountedLines);
		});
	}

	let prevMilestoneIds = new Set<string>();
	$: {
		const currentMilestoneMap = $milestoneLines$;
		const currentIds = new Set(currentMilestoneMap ? currentMilestoneMap.keys() : []);
		const changedLineIds: string[] = [];

		for (const id of prevMilestoneIds) {
			if (!currentIds.has(id)) {
				changedLineIds.push(id);
			}
		}
		for (const id of currentIds) {
			if (!prevMilestoneIds.has(id)) {
				changedLineIds.push(id);
			}
		}
		prevMilestoneIds = currentIds;

		if (changedLineIds.length > 0) {
			let hasCachedChanges = false;
			const invalidVirtualIndices: number[] = [];

			for (const id of changedLineIds) {
				if (lineSizes.has(id)) {
					lineSizes.delete(id);
					hasCachedChanges = true;
					const lineIdx = $lineData$.findIndex((l) => l.id === id);
					if (lineIdx !== -1) {
						const vIdx = mapIndex(lineIdx);
						invalidVirtualIndices.push(vIdx);
					}
				}
			}

			if (hasCachedChanges && virtualListRef) {
				virtualListRef.invalidateItemSizes(invalidVirtualIndices);
			}
		}
	}

	let prevLowerQuery = '';
	$: lowerQuery = searchQuery.trim().toLowerCase();
	$: {
		if (lowerQuery && $lineData$) {
			if (lowerQuery !== prevLowerQuery) {
				currentMatchStep = 0;
				prevLowerQuery = lowerQuery;
			}

			matchIndices = $lineData$
				.map((l, i) => l.text.toLowerCase().includes(lowerQuery) ? i : -1)
				.filter(i => i !== -1);

			if (currentMatchStep >= matchIndices.length) {
				currentMatchStep = Math.max(0, matchIndices.length - 1);
			}

			searchJumpIndex = matchIndices.length > 0 ? matchIndices[currentMatchStep] : undefined;

			if (searchJumpIndex !== undefined && virtualListRef) {
				const virtualTarget = mapIndex(searchJumpIndex);
				virtualListRef.scrollListToIndex(virtualTarget, 'auto', 'center');
			}
		} else {
			matchIndices = [];
			currentMatchStep = 0;
			searchJumpIndex = undefined;
			prevLowerQuery = lowerQuery;
		}
	}

	onMount(() => {
		mountFunction();
		if (wakeLockAvailable) {
			wakeLock = navigator.wakeLock
				.request('screen')
				.then((lock) => {
					return lock;
				})
				.catch((error) => {
					console.error(`Unable to aquire screen lock: ${error.message}`);
					return null;
				});
		}
	});

	function mountFunction() {
		isSmFactor = window.matchMedia('(min-width: 640px)').matches;
		executeUpdateScroll(true);
	}

	function mapIndex(index: number): number {
		return $reverseLineOrder$ ? $lineData$.length - 1 - index : index;
	}

	function nextMatch() {
		if (matchIndices.length === 0) return;
		currentMatchStep = (currentMatchStep + 1) % matchIndices.length;
		const targetIndex = matchIndices[currentMatchStep];
		searchJumpIndex = targetIndex;

		const virtualTarget = mapIndex(targetIndex);
		virtualListRef.scrollListToIndex(virtualTarget, 'auto', 'center');
	}

	function prevMatch() {
		if (matchIndices.length === 0) return;
		currentMatchStep = (currentMatchStep - 1 + matchIndices.length) % matchIndices.length;
		const targetIndex = matchIndices[currentMatchStep];
		searchJumpIndex = targetIndex;

		const virtualTarget = mapIndex(targetIndex);
		virtualListRef.scrollListToIndex(virtualTarget, 'auto', 'center');
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
			event.preventDefault();
			showSearch = true;
			tick().then(() => searchInputRef?.focus());
		}
		if (event.key === 'Escape' && showSearch) {
			showSearch = false;
			searchQuery = '';
			searchJumpIndex = undefined;
		}
	}

	function measureSize(node: HTMLElement, params: { line: LineItem; virtual: number }) {
		let { line, virtual } = params;
		let lineId = line.id;
		let isNewLine = newLines.has(line);
		mountedNodes.set(lineId, { node, getVirtual: () => virtual });

		const ro = new ResizeObserver(() => {
			const size = $displayVertical$ ? node.offsetWidth : node.offsetHeight;
			const currentSize = lineSizes.get(lineId);

			if (!currentSize || Math.abs(currentSize - size) > 1) {
				lineSizes.set(lineId, size);
				pendingInvalidations.add(virtual);
				if (!recomputePending) {
					recomputePending = true;
					tick().then(() => {
						if (virtualListRef && pendingInvalidations.size > 0) {
							virtualListRef.invalidateItemSizes(Array.from(pendingInvalidations));
						}
						pendingInvalidations.clear();
						recomputePending = false;

						const targetIndex = mapIndex($lineData$.length - 1);
						if (isNewLine && virtual === targetIndex && !$reverseLineOrder$ && !showSearch) {
							virtualListRef.scrollListToIndex(virtual, listScrollBehavior, 'end');
						}
						isNewLine = false;
					});
				}
			}
		});

		ro.observe(node);

		return {
			update(newParams: { line: LineItem; virtual: number }) {
				const newLineId = newParams.line.id;

				if (lineId !== newLineId) {
					mountedNodes.delete(lineId);

					line = newParams.line;
					lineId = newLineId;
					isNewLine = newLines.has(line);

					mountedNodes.set(lineId, { node, getVirtual: () => virtual });
				} else {
					line = newParams.line;
				}

				virtual = newParams.virtual;
			},
			destroy() {
				mountedNodes.delete(lineId);
				ro.disconnect();
			}
		}
	}

	function remeasureMountedLines() {
		if (!virtualListRef) return;
		const invalidIndices: number[] = [];

		for (const [id, { node, getVirtual }] of mountedNodes) {
			const size = $displayVertical$ ? node.offsetWidth : node.offsetHeight;
			if (size > 0) {
				lineSizes.set(id, size);
				invalidIndices.push(getVirtual());
			}
		}

		if (invalidIndices.length > 0) {
			virtualListRef.invalidateItemSizes(invalidIndices);
		}
	}

	function handleKeyPress(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if ($notesOpen$ || $dialogOpen$ || settingsOpen || lineInEdit || showSearch || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
			return;
		}

		const key = (event.key || '')?.toLowerCase();

		if (key === 'delete') {
			if (window.getSelection()?.toString().trim()) {
				const range = window.getSelection().getRangeAt(0);

				const startEl = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
				const endEl = range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer;
				const startLine = (startEl as HTMLElement)?.closest?.('[data-line-id]') as HTMLElement;
				const endLine = (endEl as HTMLElement)?.closest?.('[data-line-id]') as HTMLElement;

				if (startLine && endLine) {
					const startId = startLine.dataset.lineId;
					const endId = endLine.dataset.lineId;
					const startIndex = $lineData$.findIndex(l => l.id === startId);
					const endIndex = $lineData$.findIndex(l => l.id === endId);
					if (startIndex !== -1 && endIndex !== -1) {
						const [from, to] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
						const idsInRange = $lineData$.slice(from, to + 1).map(l => l.id);
						selectedLineIds = Array.from(new Set([...selectedLineIds, ...idsInRange]));
					}
				}
			}

			if (selectedLineIds.length) {
				removeLines();
			} else if (event.altKey) {
				removeLastLine();
			}
		} else if (selectedLineIds.length && key === 'escape') {
			deselectLines();
		} else if (event.altKey && key === 'a') {
			settingsComponent.handleReset(false);
		} else if (event.altKey && key === 'q') {
			settingsComponent.handleReset(true);
		} else if ((event.ctrlKey || event.metaKey) && key === ' ') {
			$isPaused$ = !$isPaused$;
		} else if (event.altKey && key === 'g') {
			$showConnectionIcon$ = !$showConnectionIcon$;
		}
	}

	async function undoLastAction() {
		if (!$actionHistory$.length) {
			return;
		}

		const linesToRevert = $actionHistory$.pop();

		let lineToRevert = linesToRevert.pop();

		while (lineToRevert) {
			const text = transformLine(lineToRevert.text, false);

			if (text) {
				const { id, index } = lineToRevert;

				if (index > $lineData$.length - 1) {
					$lineData$.push({ id, text });
				} else if ($lineData$[index].id === id) {
					$lineData$[index] = { id, text };
				} else {
					$lineData$.splice(index, 0, { id, text });
				}
			}

			lineToRevert = linesToRevert.pop();
		}

		await tick();

		$lineData$ = applyEqualLineStartMerge(applyMaxLinesAndGetRemainingLineData());
		$actionHistory$ = $actionHistory$;
		virtualListRef?.clearCache();
	}

	function removeLastLine() {
		if (!$lineData$.length) {
			return;
		}

		const [removedLine] = $lineData$.splice($lineData$.length - 1, 1);

		selectedLineIds = selectedLineIds.filter((selectedLineId) => selectedLineId !== removedLine.id);
		$lineData$ = $lineData$;
		$actionHistory$ = [...$actionHistory$, [{ ...removedLine, index: $lineData$.length }]];

		lineSizes.delete(removedLine.id);
		$uniqueLines$.delete(removedLine.text);
	}

	function removeLines() {
		const linesToDelete = new Set(selectedLineIds);
		const newActionHistory: LineItem[] = [];

		$lineData$ = $lineData$.filter((oldLine, index) => {
			const hasLine = linesToDelete.has(oldLine.id);

			linesToDelete.delete(oldLine.id);

			if (hasLine) {
				lineSizes.delete(oldLine.id);
				newActionHistory.push({ ...oldLine, index: index - newActionHistory.length });
				$uniqueLines$.delete(oldLine.text);
			}

			return !hasLine;
		});

		selectedLineIds = linesToDelete.size ? [...linesToDelete] : [];

		if (newActionHistory.length) {
			$actionHistory$ = [...$actionHistory$, newActionHistory];
		}
	}

	function deselectLines() {
		selectedLineIds = [];
	}

	async function handlePipAction() {
		if (pipWindow) {
			return pipWindow.close();
		}

		pipWindow = await window.documentPictureInPicture
			.requestWindow(
				$lastPipHeight$ > 0 && $lastPipWidth$ > 0
					? {
						  height: $lastPipHeight$,
						  width: $lastPipWidth$,
						  preferInitialWindowPlacement: false,
					  }
					: { preferInitialWindowPlacement: false },
			)
			.catch(({ message }) => {
				$openDialog$ = {
					message: `Error opening floating window: ${message}`,
					showCancel: false,
				};

				return undefined;
			});

		if (!pipWindow) {
			return;
		}

		pipWindow.document.body.appendChild(pipContainer);

		pipWindow.addEventListener('pagehide', onPipHide, { once: true });
		pipWindow.addEventListener('resize', onPipResize, false);
		pipWindow.addEventListener('blur', onPipFocusBlur, false);
		pipWindow.addEventListener('focus', onPipFocusBlur, false);

		[...document.styleSheets].forEach((styleSheet) => {
			if (styleSheet.ownerNode instanceof Element && styleSheet.ownerNode.id === 'user-css') {
				return;
			}

			try {
				const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
				const style = document.createElement('style');

				style.textContent = cssRules;
				pipWindow.document.head.appendChild(style);
			} catch (_error) {
				const link = document.createElement('link');

				link.rel = 'stylesheet';
				link.type = styleSheet.type;
				link.media = styleSheet.media.toString();
				link.href = styleSheet.href;
				pipWindow.document.head.appendChild(link);
			}
		});
	}

	function onPipHide() {
		updatePipDimensions();

		pipWindow.removeEventListener('resize', onPipResize, false);
		pipWindow.removeEventListener('blur', onPipFocusBlur, false);
		pipWindow.removeEventListener('focus', onPipFocusBlur, false);

		hasPipFocus = false;
		pipWindow = undefined;
	}

	function onPipResize() {
		window.clearTimeout(pipResizeTimeout);

		pipResizeTimeout = window.setTimeout(updatePipDimensions, 500);
	}

	function updatePipDimensions() {
		if (!pipWindow) {
			return;
		}

		$lastPipHeight$ = pipWindow.document.body.clientHeight;
		$lastPipWidth$ = pipWindow.document.body.clientWidth;
	}

	function onPipFocusBlur(event: Event) {
		hasPipFocus = event.type === 'focus';
	}

	function onAfkBlur({ detail: isAfk }: CustomEvent<boolean>) {
		applyAfkBlur(document, isAfk);

		if (pipWindow) {
			applyAfkBlur(pipWindow.document, isAfk);
		}
	}

	function executeUpdateScroll(forceInstant: boolean = false) {
		const scrollBehavior = forceInstant !== true ? listScrollBehavior : 'auto';
		if (virtualListRef && $lineData$.length > 0 && !showSearch) {
			const targetIndex = mapIndex($lineData$.length - 1);
			const alignment = $reverseLineOrder$ ? 'start' : 'end';
			virtualListRef.scrollListToIndex(targetIndex, scrollBehavior, alignment);

			if (forceInstant && !$reverseLineOrder$) {
				setTimeout(() => {
					if (virtualListRef && $lineData$.length > 0 && !showSearch) {
						const updatedTargetIndex = mapIndex($lineData$.length - 1);
						virtualListRef.scrollListToIndex(updatedTargetIndex, 'auto', alignment);
					}
				}, 100);
			}
		}
		if (pipWindow) {
			updateScroll(pipWindow, pipContainer, $reverseLineOrder$, false, listScrollBehavior);
		}
	}

	function handleMissedLine() {
		clearTimeout($flashOnPauseTimeout$);

		if ($theme$ === Theme.GARDEN) {
			settingsContainer.classList.add('bg-base-200');
			settingsContainer.classList.remove('bg-base-100');
			document.body.classList.add('bg-base-200');
		}

		document.body.classList.add('animate-[pulse_0.5s_cubic-bezier(0.4,0,0.6,1)_1]');

		$flashOnPauseTimeout$ = window.setTimeout(() => {
			if ($theme$ === Theme.GARDEN) {
				settingsContainer.classList.add('bg-base-100');
				settingsContainer.classList.remove('bg-base-200');

				document.body.classList.remove('bg-base-200');
			}

			document.body.classList.remove('animate-[pulse_0.5s_cubic-bezier(0.4,0,0.6,1)_1]');
		}, 500);
	}

	function transformLine(text: string, useReplacements = true) {
		const textToAppend = useReplacements ? applyReplacements(text, $enabledReplacements$) : text;

		let canAppend = true;
		let lineToAppend = $removeAllWhitespace$ ? textToAppend.replace(/\s/gm, '').trim() : textToAppend;

		if ($filterNonCJKLines$ && !lineToAppend.match(cjkCharacters)) {
			lineToAppend = '';
		}

		if (!lineToAppend) {
			canAppend = false;
		} else if ($preventGlobalDuplicate$) {
			canAppend = !$uniqueLines$.has(lineToAppend);
			$uniqueLines$.add(lineToAppend);
		} else if ($preventLastDuplicate$ && $lineData$.length) {
			canAppend = $lineData$.slice(-$preventLastDuplicate$).every((line) => line.text !== lineToAppend);
		}

		return canAppend ? lineToAppend : undefined;
	}

	function handleLineEdit(event) {
		const { inEdit, data } = event.detail as LineItemEditEvent;
		if (data && data.originalText !== data.newText) {
			const lineIndex = $lineData$.findIndex((l) => l.id === data.line.id);
			if (lineIndex !== -1) {
				$uniqueLines$.delete(data.originalText);
				const text = transformLine(data.newText);

				if (text) {
					$lineData$[lineIndex] = { id: data.line.id, text };
					const currentHistory = $actionHistory$;
					currentHistory.push([{ ...data.line, index: lineIndex }]);
					$actionHistory$ = currentHistory;
					$uniqueLines$.add(text);
				} else {
					$uniqueLines$.add(data.originalText);
				}
			}
		}
		lineInEdit = inEdit;
	}

	function applyMaxLinesAndGetRemainingLineData(diffMod = 0) {
		const startIndex = $maxLines$ ? $lineData$.length - $maxLines$ + diffMod : 0;
		if (startIndex > 0) {
			const oldLinesToRemove = new Set<string>();
			const removed = $lineData$.splice(0, startIndex);
			for (let i = 0; i < removed.length; i++) {
				oldLinesToRemove.add(removed[i].id);
				$uniqueLines$.delete(removed[i].text);
				lineSizes.delete(removed[i].id);
			}
			if (oldLinesToRemove.size) {
				selectedLineIds = selectedLineIds.filter((selectedLineId) => !oldLinesToRemove.has(selectedLineId));
			}

			virtualListRef?.clearCache();
		}
		return $lineData$;
	}

	async function updateLineData(executeUpdate: boolean) {
		if (!executeUpdate) return;
		$showSpinner$ = true;
		await tick();
		try {
			let hasChanges = false;
			const linesToRemove = new Set<string>();
			const CHUNK_SIZE = 100;

			for (let index = 0; index < $lineData$.length; index++) {
				const line = $lineData$[index];
				const newText = transformLine(line.text);

				if (!newText) {
					linesToRemove.add(line.id);
					$uniqueLines$.delete(line.text);
					hasChanges = true;
				} else if (newText !== line.text) {
					$uniqueLines$.delete(line.text);
					$uniqueLines$.add(newText);
					$lineData$[index] = { ...line, text: newText };
					hasChanges = true;
				}

				if (index > 0 && index % CHUNK_SIZE === 0) {
					await new Promise(resolve => setTimeout(resolve, 0));
				}
			}

			if (hasChanges) {
				if (linesToRemove.size > 0) {
					$lineData$ = $lineData$.filter(line => !linesToRemove.has(line.id));
					selectedLineIds = selectedLineIds.filter(id => !linesToRemove.has(id));
				}

				lineSizes.clear();
				virtualListRef?.clearCache();
				$openDialog$ = { message: `Operation executed`, showCancel: false };
			}
		} catch ({ message }) {
			$openDialog$ = { type: 'error', message: `An Error occured: ${message}`, showCancel: false };
		} finally {
			$lineData$ = applyEqualLineStartMerge(applyMaxLinesAndGetRemainingLineData());
			$showSpinner$ = false;

			await tick();

			if (hasChanges) {
				remeasureMountedLines();
			}

			executeUpdateScroll(true);
		}
	}

	function applyEqualLineStartMerge(currentLineData: LineItem[]) {
		if (!$mergeEqualLineStarts$ || currentLineData.length < 2) {
			return currentLineData;
		}

		const lastIndex = currentLineData.length - 1;
		const comparisonIndex = lastIndex - 1;
		const lastLine = currentLineData[lastIndex];
		const comparisonLine = currentLineData[comparisonIndex].text;

		if (lastLine.text.startsWith(comparisonLine)) {
			$uniqueLines$.delete(comparisonLine);

			selectedLineIds = selectedLineIds.filter(
				(selectedLineId) => selectedLineId !== currentLineData[comparisonIndex].id,
			);

			lineSizes.delete(currentLineData[comparisonIndex].id);
			currentLineData.splice(comparisonIndex, 2, lastLine);
		}

		return currentLineData;
	}
</script>

<svelte:window on:keyup={handleKeyPress} on:keydown={handleGlobalKeydown} />

{$visibilityHandler$ ?? ''}
{$handleLine$ ?? ''}
{$pasteHandler$ ?? ''}
{$copyBlocker$ ?? ''}
{$resizeHandler$ ?? ''}

{#if $showSpinner$}
	<Spinner />
{/if}

<DialogManager />

{#if showSearch}
<div class="fixed top-4 left-1/2 -translate-x-1/2 bg-base-200 border border-primary shadow-xl rounded-lg p-2 z-50 flex items-center gap-2" transition:fly={{ y: -20, duration: 200 }}>
	<input 
		bind:this={searchInputRef}
		bind:value={searchQuery}
		type="text"
		placeholder="Search text..."
		class="input input-sm input-bordered w-64"
		on:keydown={(e) => {
			if (e.key === 'Enter' && !e.isComposing) {
				e.preventDefault();
				e.shiftKey ? prevMatch() : nextMatch();
			}
		}}
	/>
	<span class="text-sm font-mono whitespace-nowrap px-2">
		{matchIndices.length > 0 ? currentMatchStep + 1 : 0} / {matchIndices.length}
	</span>
	<button class="btn btn-sm btn-ghost px-2" aria-label="Previous match" on:click={prevMatch} disabled={matchIndices.length === 0}>▲</button>
	<button class="btn btn-sm btn-ghost px-2" aria-label="Next match" on:click={nextMatch} disabled={matchIndices.length === 0}>▼</button>
	<button class="btn btn-sm btn-ghost px-2 text-error" on:click={() => { showSearch = false; searchQuery = ''; searchJumpIndex = undefined; }}>
		<Icon path={mdiCancel} width="1.25rem" height="1.25rem" />
	</button>
</div>
{/if}

<header class="fixed top-0 right-3 sm:right-4 flex justify-end items-center p-2 bg-base-100 z-10" bind:this={settingsContainer}>
	<Stats on:afkBlur={onAfkBlur} />
	{#if $websocketUrl$}
		<SocketConnector />
	{/if}
	{#if $secondaryWebsocketUrl$}
		<SocketConnector isPrimary={false} />
	{/if}
	{#if $isPaused$}
		<div
			role="button"
			title="Continue"
			class="mr-1 animate-[pulse_1.25s_cubic-bezier(0.4,0,0.6,1)_infinite] hover:text-primary sm:mr-2"
		>
			<Icon path={mdiPlay} width={iconSize} height={iconSize} on:click={() => ($isPaused$ = false)} />
		</div>
	{:else}
		<div role="button" title="Pause" class="mr-1 hover:text-primary sm:mr-2">
			<Icon path={mdiPause} width={iconSize} height={iconSize} on:click={() => ($isPaused$ = true)} />
		</div>
	{/if}
	<div
		role="button"
		title="Delete last Line"
		class="mr-1 hover:text-primary sm:mr-2"
		class:opacity-50={!$lineData$.length}
		class:cursor-not-allowed={!$lineData$.length}
		class:hover:text-primary={$lineData$.length}
	>
		<Icon path={mdiDeleteForever} width={iconSize} height={iconSize} on:click={removeLastLine} />
	</div>
	<div
		role="button"
		title="Undo last Action"
		class="mr-1 hover:text-primary sm:mr-2"
		class:opacity-50={!$actionHistory$.length}
		class:cursor-not-allowed={!$actionHistory$.length}
		class:hover:text-primary={$actionHistory$.length}
	>
		<Icon path={mdiArrowULeftTop} width={iconSize} height={iconSize} on:click={undoLastAction} />
	</div>
	{#if selectedLineIds.length}
		<div role="button" title="Remove selected Lines" class="mr-1 hover:text-primary sm:mr-2">
			<Icon path={mdiDelete} width={iconSize} height={iconSize} on:click={removeLines} />
		</div>
		<div role="button" title="Deselect Lines" class="mr-1 hover:text-primary sm:mr-2">
			<Icon path={mdiCancel} width={iconSize} height={iconSize} on:click={deselectLines} />
		</div>
	{/if}
	<div role="button" title="Open Notes" class="mr-1 hover:text-primary sm:mr-2">
		<Icon path={mdiNoteEdit} width={iconSize} height={iconSize} on:click={() => ($notesOpen$ = true)} />
	</div>
	{#if pipAvailable}
		<div
			role="button"
			class="mr-1 hover:text-primary sm:mr-2"
			title={pipWindow ? 'Close Floating Window' : 'Open Floating Window'}
		>
			<Icon
				width={iconSize}
				height={iconSize}
				path={pipWindow ? mdiWindowMaximize : mdiWindowRestore}
				on:click={handlePipAction}
			/>
		</div>
	{/if}
	<Icon
		class="cursor-pointer mr-1 hover:text-primary md:mr-2"
		path={mdiCog}
		width={iconSize}
		height={iconSize}
		bind:element={settingsElement}
		on:click={() => (settingsOpen = !settingsOpen)}
	/>
	<Settings
		{settingsElement}
		{pipAvailable}
		bind:settingsOpen
		bind:selectedLineIds
		bind:this={settingsComponent}
		on:applyReplacements={() => updateLineData(!!$enabledReplacements$.length)}
		on:layoutChange={() => executeUpdateScroll(true)}
		on:maxLinesChange={() => ($lineData$ = applyMaxLinesAndGetRemainingLineData())}
		on:linesRemoved={(event) => {event.detail.forEach(id => lineSizes.delete(id));}}
		on:dataResetOrImported={() => {
			lineSizes.clear();
			virtualListRef?.clearCache();
		}}
	/>
	<Presets isQuickSwitch={true} on:layoutChange={() => executeUpdateScroll(true)} />
</header>
<main
	class="flex flex-col flex-1 break-all w-full h-full overflow-hidden relative"
	class:pt-8={$displayVertical$}
	class:opacity-50={$notesOpen$}
	style:font-size={`${$fontSize$}px`}
	style:font-family={$onlineFont$ !== OnlineFont.OFF ? $onlineFont$ : undefined}
	style:writing-mode={$displayVertical$ ? 'vertical-rl' : 'horizontal-tb'}
	bind:this={lineContainer}
>
	<div
		aria-hidden="true"
		class="absolute invisible pointer-events-none opacity-0 -z-50 flex"
		class:flex-col={!$displayVertical$}
		bind:offsetHeight={measuredHeight}
		bind:offsetWidth={measuredWidth}
	>
		<p
			class="my-2 border-2 border-transparent"
			class:px-2={!$displayVertical$}
			class:py-2={$displayVertical$}
			class:show-bullet={$showLinePoints$}
			style:padding-top={!$displayVertical$ ? `${$linePadding$}rem` : undefined}
			style:padding-bottom={!$displayVertical$ ? `${$linePadding$}rem` : undefined}
			style:padding-left={$displayVertical$ ? `${$linePadding$}rem` : undefined}
			style:padding-right={$displayVertical$ ? `${$linePadding$}rem` : undefined}
		>
			トランスジェンダーの権利
		</p>
	</div>

	<div class="w-full h-full relative" class:virtual-list-pad-y={!$displayVertical$} class:virtual-list-pad-x={$displayVertical$} bind:clientWidth={listWidth} bind:clientHeight={listHeight}>
		{#if listWidth && listHeight}
			<VirtualList
				bind:this={virtualListRef}
				width={listWidth}
				height={listHeight}
				itemCount={$lineData$.length}
				itemSize={virtualItemSize}
				estimatedItemSize={estimatedItemSize}
				scrollDirection={$displayVertical$ ? 'horizontal' : 'vertical'}
				rtl={$displayVertical$}
				padding={32}
			>
				<div slot="item" let:index let:style {style} class="absolute" class:px-4={!$displayVertical$} class:py-4={$displayVertical$} class:w-full={!$displayVertical$} class:h-full={$displayVertical$}>
					{@const actualIndex = mapIndex(index)}
					{#if $lineData$[actualIndex]}
						<div use:measureSize={{ line: $lineData$[actualIndex], virtual: index }} class="flex flex-col" class:w-full={!$displayVertical$} class:h-full={$displayVertical$}>
							<div
								 class="transition-colors duration-200 rounded"
								 class:w-full={!$displayVertical$} class:h-full={$displayVertical$}
							>
								{#key $lineData$[actualIndex].id}
									<Line
										line={$lineData$[actualIndex]}
										isSelected={selectedLineIds.includes($lineData$[actualIndex].id)}
										searchQuery={showSearch && matchIndices.includes(actualIndex) ? searchQuery.trim() : ''}
										isCurrentMatchLine={actualIndex === searchJumpIndex}
										on:selected={({ detail }) => {
											selectedLineIds = [...selectedLineIds, detail];
										}}
										on:deselected={({ detail }) => {
											selectedLineIds = selectedLineIds.filter((selectedLineId) => selectedLineId !== detail);
										}}
										on:edit={handleLineEdit}
									/>
								{/key}
							</div>
						</div>
					{/if}
				</div>
			</VirtualList>
		{/if}
	</div>
</main>
{#if $notesOpen$}
	<div
		class="bg-base-200 fixed top-0 right-0 z-[60] flex h-full w-full max-w-3xl flex-col justify-between"
		in:fly|local={{ x: 100, duration: 100, easing: quintInOut }}
	>
		<Notes />
	</div>
{/if}
<div
	id="pip-container"
	class="flex-1 flex flex-col break-all w-full h-full overflow-auto"
	class:flex-col-reverse={$reverseLineOrder$}
	class:hidden={!pipWindow}
	style:font-size={`${$fontSize$}px`}
	style:font-family={$onlineFont$ !== OnlineFont.OFF ? $onlineFont$ : undefined}
	style:padding-top={`${$linePadding$}rem`}
	style:padding-bottom={`${$linePadding$}rem`}
	bind:this={pipContainer}
>
	{#if pipWindow}
		{#each pipLines as line (line.id)}
			<Line {line} {pipWindow} />
		{/each}
	{/if}
</div>
<style>
	:global(.virtual-list-pad-y > div) {
		padding-top: 2rem;
		box-sizing: border-box;
	}
	:global(.virtual-list-pad-y > div > div) {
		padding-bottom: 2rem;
		box-sizing: content-box;
	}
	:global(.virtual-list-pad-x > div) {
		padding-right: 2rem;
		box-sizing: border-box;
	}
	:global(.virtual-list-pad-x > div > div) {
		padding-left: 2rem;
		box-sizing: content-box;
	}
</style>
