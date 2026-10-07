<script lang="ts">
	import { dataState } from '../stores/data-state.svelte';
	import { dialogState } from '../stores/dialog-state.svelte';
	import { appState } from '../stores/app-state.svelte';
	import { setPaused } from '../stores/state-actions';

	import { settings } from '../stores/settings.svelte';
	import { lineStatistics } from '../stores/line-statistics.svelte';

	import { untrack } from 'svelte';

	import {
		mdiArrowULeftTop,
		mdiCancel,
		mdiCog,
		mdiDelete,
		mdiDeleteForever,
		mdiHelpCircle,
		mdiNoteEdit,
		mdiPause,
		mdiPlay,
		mdiWindowMaximize,
		mdiWindowRestore,
	} from '@mdi/js';
	import { onMount, tick } from 'svelte';
	import { quintInOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { removeIDBItem } from '../idb';
	import { newLines, pipNewLines } from '../stores/stores';
	import { incomingLine } from '../events';
	import { cacheLineCharacterCount } from '../stores/line-character-counts';
	import { LineType, OnlineFont, Theme, type DialogResult, type LineItem, type LineItemEditEvent } from '../types';
	import {
		applyAfkBlur,
		applyCustomCSS,
		applyReplacements,
		formatLineText,
		generateRandomUUID,
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
	import VirtualList from './VirtualList.svelte';
	import { VirtualListController } from '../virtual-list-controller';

	let isSmFactor = $state(false);
	let selectedLineIds: string[] = $state([]);
	let settingsContainer: HTMLElement = $state();
	let settingsElement: SVGElement = $state();
	let settingsOpen = $state(false);
	let lineInEdit = false;
	let blockNextExternalLine = false;
	let resizeTimeout: number;
	let wakeLock = null;
	let pipContainer: HTMLElement = $state();
	let pipWindow: Window | undefined = $state();
	let pipResizeTimeout: number;
	const virtualListController = new VirtualListController();
	let lineSizes = new Map<string, number>();
	let listWidth = $state(0);
	let listHeight = $state(0);
	let estimatedLineHeight = $state(0);
	let estimatedLineWidth = $state(0);
	let lastReflowDimension = 0;
	let recomputePending = false;
	let pendingInvalidations = new Set<number>();
	let prevMilestoneIds = new Set<string>();
	let initialScrollDone = $state(false);
	let showSearch = $state(false);
	let searchInputElement: HTMLInputElement = $state();
	let searchQuery = $state('');
	let requestedMatchStep = $state(0);

	const wakeLockAvailable = 'wakeLock' in navigator;
	const cjkCharacters = /[\p{scx=Hira}\p{scx=Kana}\p{scx=Han}]/imu;

	function changeTextCount(counts: Map<string, number>, text: string, delta: number) {
		const count = (counts.get(text) ?? 0) + delta;
		if (count > 0) counts.set(text, count);
		else counts.delete(text);
	}

	function canReceiveLine(lineType: LineType) {
		const isPaste = lineType === LineType.PASTE;
		const hasNoUserInteraction = !settings.notesOpen && !appState.dialogOpen && !settingsOpen && !lineInEdit;
		const skipExternalLine = blockNextExternalLine && lineType === LineType.EXTERNAL;

		if (skipExternalLine) {
			blockNextExternalLine = false;
		}

		if (
			(!appState.isPaused ||
				((settings.allowPasteDuringPause || settings.autoStartTimerDuringPausePaste) && isPaste) ||
				((settings.allowNewLineDuringPause || settings.autoStartTimerDuringPause) && !isPaste)) &&
			hasNoUserInteraction &&
			!skipExternalLine
		) {
			return true;
		}

		if (!skipExternalLine && hasNoUserInteraction && settings.flashOnMissedLine) {
			handleMissedLine();
		}

		return false;
	}

	function handleIncomingLine([lineContent, lineType]: [string, LineType]) {
		if (!canReceiveLine(lineType)) return;
		const text = transformLine(lineContent);

		if (text) {
			const isPaste = lineType === LineType.PASTE;
			const newId = generateRandomUUID();
			const item = cacheLineCharacterCount({ id: newId, text });

			if (initialScrollDone && !appState.showSpinner && !showSearch) {
				newLines.add(item);
			}
			if (pipWindow) {
				pipNewLines.add(item);
			}
			const remainingCount = dataState.lines.length - prepareLeadingLineRemoval(1);
			const previous = remainingCount > 0 ? dataState.lines[dataState.lines.length - 1] : undefined;
			const mergePrevious = !!(settings.mergeEqualLineStarts && previous && text.startsWith(previous.text));
			const removeFirst = dataState.lines.length - remainingCount;
			if (settings.reverseLineOrder) virtualListController.shiftIndices(1);
			dataState.appendLine(item, removeFirst, mergePrevious);
			if (mergePrevious && previous) {
				selectedLineIds = selectedLineIds.filter((id) => id !== previous.id);
				lineSizes.delete(previous.id);
				virtualListController.removeIndices([mapIndex(remainingCount - 1, remainingCount + 1)]);
			}
			tick().then(() => executeUpdateScroll());

			if (
				appState.isPaused &&
				((settings.autoStartTimerDuringPausePaste && isPaste) || (settings.autoStartTimerDuringPause && !isPaste))
			) {
				setPaused(false);
			}
		}
	}

	function handlePaste(event: ClipboardEvent) {
		if (!settings.enablePaste) return;
		const target = event.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
		incomingLine.emit([event.clipboardData.getData('text/plain'), LineType.PASTE]);
	}

	function handleVisibilityChange() {
		if (wakeLockAvailable && wakeLock !== null && document.visibilityState === 'visible') {
			wakeLock = navigator.wakeLock
				.request('screen')
				.then((lock) => lock)
				.catch((error) => {
					console.error(`Unable to aquire screen lock: ${error.message}`);
					return null;
				});
		}
	}

	function handleCopy() {
		blockNextExternalLine = true;
	}

	$effect(() => {
		if (!settings.blockCopyOnPage) return;
		document.addEventListener('copy', handleCopy);
		return () => {
			document.removeEventListener('copy', handleCopy);
			blockNextExternalLine = false;
		};
	});

	function handleResize() {
		window.clearTimeout(resizeTimeout);
		resizeTimeout = window.setTimeout(() => {
			isSmFactor = window.matchMedia('(min-width: 640px)').matches;
			executeUpdateScroll(true);
		}, 500);
	}

	const virtualItemSize = (index: number) => {
		const actualIndex = mapIndex(index);
		const line = dataState.lines[actualIndex];
		return line ? lineSizes.get(line.id) : undefined;
	};

	const mountedNodes = new Map<string, { node: HTMLElement; getVirtual: () => number }>();

	onMount(() => {
		const unsubscribe = incomingLine.subscribe(handleIncomingLine);
		isSmFactor = window.matchMedia('(min-width: 640px)').matches;
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
		return () => {
			unsubscribe();
			window.clearTimeout(resizeTimeout);
		};
	});

	function mapIndex(index: number, lineCount = dataState.lines.length): number {
		return settings.reverseLineOrder ? lineCount - 1 - index : index;
	}

	function nextMatch() {
		if (matchIndices.length === 0) return;
		requestedMatchStep = (currentMatchStep + 1) % matchIndices.length;
		const targetIndex = matchIndices[currentMatchStep];

		const virtualTarget = mapIndex(targetIndex);
		virtualListController.scrollListToIndex(virtualTarget, 'auto', 'center');
	}

	function prevMatch() {
		if (matchIndices.length === 0) return;
		requestedMatchStep = (currentMatchStep - 1 + matchIndices.length) % matchIndices.length;
		const targetIndex = matchIndices[currentMatchStep];

		const virtualTarget = mapIndex(targetIndex);
		virtualListController.scrollListToIndex(virtualTarget, 'auto', 'center');
	}

	function handleSearchInput(event: Event) {
		const query = (event.target as HTMLInputElement).value;
		if (query.trim().toLowerCase() !== lowerQuery) {
			requestedMatchStep = 0;
		}
		searchQuery = query;
	}

	function measureSize(node: HTMLElement, params: { line: LineItem; virtual: number }) {
		let { line, virtual } = params;
		let lineId = line.id;
		mountedNodes.set(lineId, { node, getVirtual: () => virtual });

		function measure(invalidate = false) {
			if (mountedNodes.get(lineId)?.node !== node) return;
			const size = settings.displayVertical ? node.offsetWidth : node.offsetHeight;
			const currentSize = lineSizes.get(lineId);

			if (invalidate || !currentSize || Math.abs(currentSize - size) > 1) {
				lineSizes.set(lineId, size);
				pendingInvalidations.add(virtual);
				if (!recomputePending) {
					recomputePending = true;
					tick().then(() => {
						if (pendingInvalidations.size > 0) {
							virtualListController.invalidateIndices(Array.from(pendingInvalidations));
						}
						pendingInvalidations.clear();
						recomputePending = false;
					});
				}
			}
		}

		const ro = new ResizeObserver(() => measure());

		ro.observe(node);
		// Native scrollbar dragging can delay ResizeObserver delivery for newly mounted rows.
		tick().then(() => measure());

		return {
			update(newParams: { line: LineItem; virtual: number }) {
				const newLineId = newParams.line.id;
				const rowChanged = lineId !== newLineId || virtual !== newParams.virtual;

				if (lineId !== newLineId) {
					if (mountedNodes.get(lineId)?.node === node) mountedNodes.delete(lineId);

					line = newParams.line;
					lineId = newLineId;

					mountedNodes.set(lineId, { node, getVirtual: () => virtual });
				} else {
					line = newParams.line;
				}

				virtual = newParams.virtual;
				if (rowChanged) tick().then(() => measure(true));
			},
			destroy() {
				if (mountedNodes.get(lineId)?.node === node) mountedNodes.delete(lineId);
				ro.disconnect();
			},
		};
	}

	function remeasureMountedLines() {
		const invalidIndices: number[] = [];

		for (const [id, { node, getVirtual }] of mountedNodes) {
			const size = settings.displayVertical ? node.offsetWidth : node.offsetHeight;
			if (size > 0) {
				lineSizes.set(id, size);
				invalidIndices.push(getVirtual());
			}
		}

		if (invalidIndices.length > 0) {
			virtualListController.invalidateIndices(invalidIndices);
		}
	}

	function handleKeyUp(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (
			settings.notesOpen ||
			appState.dialogOpen ||
			settingsOpen ||
			lineInEdit ||
			showSearch ||
			target?.tagName === 'INPUT' ||
			target?.tagName === 'TEXTAREA' ||
			target?.isContentEditable
		) {
			return;
		}

		const key = (event.key || '')?.toLowerCase();

		if (key === 'delete') {
			if (window.getSelection()?.toString().trim()) {
				const range = window.getSelection().getRangeAt(0);

				const startEl =
					range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
				const endEl = range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer;
				const startLine = (startEl as HTMLElement)?.closest?.('[data-line-id]') as HTMLElement;
				const endLine = (endEl as HTMLElement)?.closest?.('[data-line-id]') as HTMLElement;

				if (startLine && endLine) {
					const startId = startLine.dataset.lineId;
					const endId = endLine.dataset.lineId;
					const startIndex = dataState.lines.findIndex((l) => l.id === startId);
					const endIndex = dataState.lines.findIndex((l) => l.id === endId);
					if (startIndex !== -1 && endIndex !== -1) {
						const [from, to] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
						const idsInRange = dataState.lines.slice(from, to + 1).map((l) => l.id);
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
			handleReset(false);
		} else if (event.altKey && key === 'q') {
			handleReset(true);
		} else if ((event.ctrlKey || event.metaKey) && key === ' ') {
			setPaused(!appState.isPaused);
		} else if (event.altKey && key === 'g') {
			settings.showConnectionIcon = !settings.showConnectionIcon;
		}
	}

	async function handleReset(linesOnly: boolean) {
		if (!settings.skipResetConfirmations) {
			const { canceled } = await new Promise<DialogResult>((resolve) => {
				dialogState.open({
					icon: mdiHelpCircle,
					message: linesOnly
						? 'All displayed and stored Lines will be cleared'
						: 'Clear stored Lines + set Timer to 00:00:00',
					callback: resolve,
				});
			});

			if (canceled) {
				return;
			}
		}

		dataState.lines = [];
		selectedLineIds = [];
		window.localStorage.removeItem('bannou-texthooker-lineData');
		await removeIDBItem('bannou-texthooker-lineData');

		if (!linesOnly) {
			settings.timeValue = 0;
			dataState.userNotes = '';
			dataState.actionHistory = [];
			await tick();
			window.localStorage.removeItem('bannou-texthooker-timeValue');
			window.localStorage.removeItem('bannou-texthooker-userNotes');
			await removeIDBItem('bannou-texthooker-userNotes');
			window.localStorage.removeItem('bannou-texthooker-actionHistory');
			await removeIDBItem('bannou-texthooker-actionHistory');
		}

		handleDataResetOrImported();
	}

	function handleDataResetOrImported() {
		deselectLines();
		handleLayoutInvalidation();
	}

	function handleLayoutInvalidation() {
		lineSizes.clear();
		virtualListController.clearCache();
		tick().then(() => {
			remeasureMountedLines();
			executeUpdateScroll(true);
		});
	}

	function handleKeyDown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
			event.preventDefault();
			showSearch = true;
			tick().then(() => searchInputElement?.focus());
		}
		if (event.key === 'Escape' && showSearch) {
			showSearch = false;
			searchQuery = '';
		}
	}

	async function undoLastAction() {
		if (!dataState.actionHistory.length) {
			return;
		}

		const history = dataState.actionHistory.slice(0, -1);
		const linesToRevert = [...dataState.actionHistory[dataState.actionHistory.length - 1]];
		const currentLines = [...dataState.lines];
		const workingTexts = new Map(dataState.lineTextCounts);
		let lineToRevert = linesToRevert.pop();
		const restoredIds = new Set<string>();
		const editedIds = new Set<string>();

		while (lineToRevert) {
			const previousLine = currentLines[lineToRevert.index];
			const excludedText = previousLine?.id === lineToRevert.id ? previousLine.text : undefined;
			const text = transformLine(lineToRevert.text, false, workingTexts, excludedText);

			if (text) {
				if (excludedText !== undefined) changeTextCount(workingTexts, excludedText, -1);
				changeTextCount(workingTexts, text, 1);
				const { id, index } = lineToRevert;

				if (index > currentLines.length - 1) {
					currentLines.push(cacheLineCharacterCount({ id, text }));
					restoredIds.add(id);
				} else if (currentLines[index].id === id) {
					if (currentLines[index].text !== text) {
						lineSizes.delete(id);
						editedIds.add(id);
					}
					currentLines[index] = cacheLineCharacterCount({ id, text });
				} else {
					currentLines.splice(index, 0, cacheLineCharacterCount({ id, text }));
					restoredIds.add(id);
				}
			}

			lineToRevert = linesToRevert.pop();
		}

		dataState.lines = currentLines;

		if (restoredIds.size > 0) {
			const addedActualIndices: number[] = [];
			for (let i = 0; i < dataState.lines.length; i++) {
				if (restoredIds.has(dataState.lines[i].id)) {
					addedActualIndices.push(i);
				}
			}
			const virtualAddedIndices = addedActualIndices.map((index) => mapIndex(index));
			virtualListController.insertIndices(virtualAddedIndices);
		}

		if (editedIds.size > 0) {
			const virtualEditedIndices: number[] = [];
			for (let index = 0; index < dataState.lines.length; index++) {
				if (editedIds.has(dataState.lines[index].id)) {
					virtualEditedIndices.push(mapIndex(index));
				}
			}
			virtualListController.invalidateIndices(virtualEditedIndices);
		}

		await tick();
		dataState.lines = applyEqualLineStartMerge(applyMaxLinesAndGetRemainingLineData());
		dataState.actionHistory = history;

		remeasureMountedLines();
	}

	function removeLastLine() {
		if (!dataState.lines.length) {
			return;
		}

		const removedActualIndex = dataState.lines.length - 1;
		const virtualIndexToRemove = mapIndex(removedActualIndex);

		const removedLine = dataState.lines[removedActualIndex];
		selectedLineIds = selectedLineIds.filter((selectedLineId) => selectedLineId !== removedLine.id);

		virtualListController.removeIndices([virtualIndexToRemove]);

		dataState.lines = dataState.lines.slice(0, removedActualIndex);
		dataState.actionHistory = [...dataState.actionHistory, [{ ...removedLine, index: dataState.lines.length }]];

		lineSizes.delete(removedLine.id);

	}

	function removeLines() {
		const linesToDelete = new Set(selectedLineIds);
		const newActionHistory: LineItem[] = [];
		const virtualIndicesToRemove: number[] = [];

		dataState.lines = dataState.lines.filter((oldLine, index) => {
			const hasLine = linesToDelete.has(oldLine.id);

			linesToDelete.delete(oldLine.id);

			if (hasLine) {
				lineSizes.delete(oldLine.id);
				newActionHistory.push({ ...oldLine, index: index - newActionHistory.length });

				virtualIndicesToRemove.push(mapIndex(index));
				return false;
			}

			return true;
		});

		selectedLineIds = linesToDelete.size ? [...linesToDelete] : [];

		if (newActionHistory.length) {
			dataState.actionHistory = [...dataState.actionHistory, newActionHistory];
		}

		virtualListController.removeIndices(virtualIndicesToRemove);
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
				settings.lastPipHeight > 0 && settings.lastPipWidth > 0
					? { height: settings.lastPipHeight, width: settings.lastPipWidth, preferInitialWindowPlacement: false }
					: { preferInitialWindowPlacement: false },
			)
			.catch(({ message }) => {
				dialogState.open({
					message: `Error opening floating window: ${message}`,
					showCancel: false,
				});

				return undefined;
			});

		if (!pipWindow) {
			return;
		}

		pipWindow.document.body.appendChild(pipContainer);

		pipWindow.addEventListener('pagehide', onPipHide, { once: true });
		pipWindow.addEventListener('resize', onPipResize, false);

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

		pipWindow = undefined;

		pipNewLines.clear();
	}

	function onPipResize() {
		window.clearTimeout(pipResizeTimeout);

		pipResizeTimeout = window.setTimeout(updatePipDimensions, 500);
	}

	function updatePipDimensions() {
		if (!pipWindow) {
			return;
		}

		settings.lastPipHeight = pipWindow.document.body.clientHeight;
		settings.lastPipWidth = pipWindow.document.body.clientWidth;
	}

	function onAfkBlur(isAfk: boolean) {
		applyAfkBlur(document, isAfk);

		if (pipWindow) {
			applyAfkBlur(pipWindow.document, isAfk);
		}
	}

	function executeUpdateScroll(forceInstant: boolean = false) {
		const scrollBehavior = forceInstant !== true ? listScrollBehavior : 'auto';
		if (dataState.lines.length > 0 && !showSearch) {
			const targetIndex = mapIndex(dataState.lines.length - 1);
			const alignment = settings.reverseLineOrder ? 'start' : 'end';
			virtualListController.scrollListToIndex(targetIndex, scrollBehavior, alignment);
		}
		if (pipWindow) {
			updateScroll(pipWindow, pipContainer, settings.reverseLineOrder, false, listScrollBehavior);
		}
	}

	function handleMissedLine() {
		clearTimeout(appState.flashOnPauseTimeout);

		if (settings.theme === Theme.GARDEN) {
			settingsContainer.classList.add('bg-base-200');
			settingsContainer.classList.remove('bg-base-100');
			document.body.classList.add('bg-base-200');
		}

		document.body.classList.add('animate-[pulse_0.5s_cubic-bezier(0.4,0,0.6,1)_1]');

		appState.flashOnPauseTimeout = window.setTimeout(() => {
			if (settings.theme === Theme.GARDEN) {
				settingsContainer.classList.add('bg-base-100');
				settingsContainer.classList.remove('bg-base-200');

				document.body.classList.remove('bg-base-200');
			}

			document.body.classList.remove('animate-[pulse_0.5s_cubic-bezier(0.4,0,0.6,1)_1]');
		}, 500);
	}

	function transformLine(
		text: string,
		useReplacements = true,
		existingTexts: ReadonlyMap<string, number> = dataState.lineTextCounts,
		excludedText?: string,
	) {
		const textToAppend = useReplacements ? applyReplacements(text, dataState.enabledReplacements) : text;

		let canAppend = true;
		let lineToAppend = settings.removeAllWhitespace ? textToAppend.replace(/\s/gm, '').trim() : textToAppend;

		if (settings.filterNonCJKLines && !lineToAppend.match(cjkCharacters)) {
			lineToAppend = '';
		}

		if (!lineToAppend) {
			canAppend = false;
		} else if (settings.preventGlobalDuplicate) {
			canAppend = (existingTexts.get(lineToAppend) ?? 0) <= (lineToAppend === excludedText ? 1 : 0);
		} else if (settings.preventLastDuplicate && dataState.lines.length) {
			canAppend = dataState.lines.slice(-settings.preventLastDuplicate).every((line) => line.text !== lineToAppend);
		}

		return canAppend ? lineToAppend : undefined;
	}

	function handleLineEdit({ inEdit, data }: LineItemEditEvent) {
		if (data && data.originalText !== data.newText) {
			const lineIndex = dataState.lines.findIndex((l) => l.id === data.line.id);
			if (lineIndex !== -1) {
				const text = transformLine(data.newText, true, dataState.lineTextCounts, dataState.lines[lineIndex].text);

				if (text) {
					const currentLines = [...dataState.lines];
					currentLines[lineIndex] = cacheLineCharacterCount({ id: data.line.id, text });
					dataState.lines = currentLines;
					dataState.actionHistory = [...dataState.actionHistory, [{ ...data.line, index: lineIndex }]];
				}
			}
		}
		lineInEdit = inEdit;
	}

	function prepareLeadingLineRemoval(diffMod = 0, currentLines = dataState.lines) {
		const startIndex = settings.maxLines ? currentLines.length - settings.maxLines + diffMod : 0;
		if (startIndex > 0) {
			const oldLinesToRemove = new Set<string>();
			const virtualIndicesToRemove: number[] = [];

			for (let i = 0; i < startIndex; i++) {
				virtualIndicesToRemove.push(mapIndex(i, currentLines.length));
			}

			const removed = currentLines.slice(0, startIndex);
			for (let i = 0; i < removed.length; i++) {
				oldLinesToRemove.add(removed[i].id);

				lineSizes.delete(removed[i].id);
			}
			if (oldLinesToRemove.size) {
				selectedLineIds = selectedLineIds.filter((selectedLineId) => !oldLinesToRemove.has(selectedLineId));
				virtualListController.removeIndices(virtualIndicesToRemove);
			}
		}
		return Math.max(0, startIndex);
	}

	function applyMaxLinesAndGetRemainingLineData(diffMod = 0, currentLines = dataState.lines) {
		return currentLines.slice(prepareLeadingLineRemoval(diffMod, currentLines));
	}

	async function updateLineData(executeUpdate: boolean) {
		if (!executeUpdate) return;
		appState.showSpinner = true;
		await tick();
		let hasChanges = false;
		let currentLines = [...dataState.lines];
		const workingTexts = new Map(dataState.lineTextCounts);
		try {
			const linesToRemove = new Set<string>();
			const virtualIndicesToRemove: number[] = [];
			const virtualIndicesToInvalidate: number[] = [];
			const CHUNK_SIZE = 100;

			for (let index = 0; index < currentLines.length; index++) {
				const line = currentLines[index];
				changeTextCount(workingTexts, line.text, -1);
				const newText = transformLine(line.text, true, workingTexts);
				if (newText) changeTextCount(workingTexts, newText, 1);

				if (!newText) {
					linesToRemove.add(line.id);
					lineSizes.delete(line.id);
					virtualIndicesToRemove.push(mapIndex(index));
					hasChanges = true;
				} else if (newText !== line.text) {
					currentLines[index] = cacheLineCharacterCount({ ...line, text: newText });
					lineSizes.delete(line.id);
					virtualIndicesToInvalidate.push(mapIndex(index));
					hasChanges = true;
				}
				if (index > 0 && index % CHUNK_SIZE === 0) {
					await new Promise((resolve) => setTimeout(resolve, 0));
				}
			}

			if (hasChanges) {
				virtualListController.invalidateIndices(virtualIndicesToInvalidate);
				if (linesToRemove.size > 0) {
					currentLines = currentLines.filter((line) => !linesToRemove.has(line.id));
					selectedLineIds = selectedLineIds.filter((id) => !linesToRemove.has(id));
					virtualListController.removeIndices(virtualIndicesToRemove);
				}

				dialogState.open({ message: `Operation executed`, showCancel: false });
			}
		} catch ({ message }) {
			dialogState.open({ type: 'error', message: `An Error occured: ${message}`, showCancel: false });
		} finally {
			dataState.lines = applyEqualLineStartMerge(applyMaxLinesAndGetRemainingLineData(0, currentLines));
			appState.showSpinner = false;

			await tick();

			if (hasChanges) {
				remeasureMountedLines();
			}

			executeUpdateScroll(true);
		}
	}

	function applyEqualLineStartMerge(currentLineData: LineItem[]) {
		if (!settings.mergeEqualLineStarts || currentLineData.length < 2) {
			return currentLineData;
		}

		const lastIndex = currentLineData.length - 1;
		const comparisonIndex = lastIndex - 1;
		const lastLine = currentLineData[lastIndex];
		const comparisonLine = currentLineData[comparisonIndex].text;

		if (lastLine.text.startsWith(comparisonLine)) {


			selectedLineIds = selectedLineIds.filter(
				(selectedLineId) => selectedLineId !== currentLineData[comparisonIndex].id,
			);

			lineSizes.delete(currentLineData[comparisonIndex].id);
			const virtualIndexToRemove = mapIndex(comparisonIndex, currentLineData.length);
			currentLineData.splice(comparisonIndex, 2, lastLine);
			virtualListController.removeIndices([virtualIndexToRemove]);
		}

		return currentLineData;
	}
	let iconSize = $derived(isSmFactor ? '1.5rem' : '1.25rem');
	let listScrollBehavior: ScrollBehavior = $derived(settings.enableLineAnimation ? 'smooth' : 'auto');
	let pipAvailable = $derived('documentPictureInPicture' in window && !!pipContainer);
	let pipLines = $derived(pipAvailable && dataState.lines ? dataState.lines.slice(-settings.maxPipLines) : []);
	// Appends keep the raw array identity, so the representative sample stays stable during ingestion.
	let estimationLines = $derived(dataState.lines);
	let estimationSamples = $derived.by(() => {
		const count = Math.min(32, estimationLines.length);
		if (!count) return ['トランスジェンダーの権利'];
		return Array.from({ length: count }, (_, index) =>
			estimationLines[Math.floor(index * (estimationLines.length - 1) / Math.max(1, count - 1))].text,
		);
	});
	let estimatedItemSize = $derived(settings.displayVertical ? estimatedLineWidth : estimatedLineHeight);

	function measureEstimationSamples(node: HTMLElement, _sampleCount: number) {
		function measure() {
			// Read dimensions and sample count from the same rendered layout.
			const count = Math.max(1, node.childElementCount);
			estimatedLineHeight = node.offsetHeight / count;
			estimatedLineWidth = node.offsetWidth / count;
		}
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		tick().then(measure);
		return {
			update() {
				tick().then(measure);
			},
			destroy() {
				observer.disconnect();
			},
		};
	}

	$effect(() => {
		if (pipWindow) {
			pipWindow.document.body.dataset.theme = settings.theme;
			applyCustomCSS(pipWindow.document, settings.customCSS);
		}
	});
	$effect(() => {
		if (!appState.showSpinner && !untrack(() => initialScrollDone)) {
			initialScrollDone = true;
			tick().then(() => executeUpdateScroll(true));
		}
	});
	$effect(() => {
		const currentReflowDimension = settings.displayVertical ? listHeight : listWidth;
		if (currentReflowDimension !== lastReflowDimension) {
			if (lastReflowDimension !== 0) {
				untrack(() => {
					lineSizes.clear();
					virtualListController.clearCache();
					tick().then(remeasureMountedLines);
				});
			}
			lastReflowDimension = currentReflowDimension;
		}
	});

	$effect(() => {
		if (settings.onlineFont && document.fonts) {
			document.fonts.ready.then(remeasureMountedLines);
		}
	});
	$effect(() => {
		const currentMilestoneMap = lineStatistics.milestoneLines;
		const lines = dataState.lines;
		untrack(() => {
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
						const lineIdx = lines.findIndex((l) => l.id === id);
						if (lineIdx !== -1) {
							const vIdx = mapIndex(lineIdx);
							invalidVirtualIndices.push(vIdx);
						}
					}
				}

				if (hasCachedChanges) {
					virtualListController.invalidateIndices(invalidVirtualIndices);
					tick().then(remeasureMountedLines);
				}
			}
		});
	});
	let lowerQuery = $derived(searchQuery.trim().toLowerCase());
	let matchIndices = $derived(
		lowerQuery && dataState.lines
			? dataState.lines
					.map((line, index) => (line.text.toLowerCase().includes(lowerQuery) ? index : -1))
					.filter((index) => index !== -1)
			: [],
	);
	let currentMatchStep = $derived(Math.min(requestedMatchStep, Math.max(0, matchIndices.length - 1)));
	let searchJumpIndex = $derived(matchIndices[currentMatchStep]);
	$effect(() => {
		const target = searchJumpIndex;
		if (target !== undefined) {
			untrack(() => virtualListController.scrollListToIndex(mapIndex(target), 'auto', 'center'));
		}
	});
</script>

<svelte:document onpaste={handlePaste} onvisibilitychange={handleVisibilityChange} />

<svelte:window onkeyup={handleKeyUp} onkeydown={handleKeyDown} onresize={handleResize} />

{#if appState.showSpinner}
	<Spinner />
{/if}

<DialogManager />

{#if showSearch}
	<div
		class="fixed top-4 left-1/2 -translate-x-1/2 bg-base-200 border border-primary shadow-xl rounded-lg p-2 z-50 flex items-center gap-2"
		transition:fly={{ y: -20, duration: 200 }}
	>
		<input
			bind:this={searchInputElement}
			value={searchQuery}
			oninput={handleSearchInput}
			type="text"
			placeholder="Search text..."
			class="input input-sm input-bordered w-64"
			onkeydown={(e) => {
				if (e.key === 'Enter' && !e.isComposing) {
					e.preventDefault();
					e.shiftKey ? prevMatch() : nextMatch();
				}
			}}
		/>
		<span class="text-sm font-mono whitespace-nowrap px-2">
			{matchIndices.length > 0 ? currentMatchStep + 1 : 0} / {matchIndices.length}
		</span>
		<button
			class="btn btn-sm btn-ghost px-2"
			aria-label="Previous match"
			onclick={prevMatch}
			disabled={matchIndices.length === 0}>▲</button
		>
		<button
			class="btn btn-sm btn-ghost px-2"
			aria-label="Next match"
			onclick={nextMatch}
			disabled={matchIndices.length === 0}>▼</button
		>
		<button
			class="btn btn-sm btn-ghost px-2 text-error"
			onclick={() => {
				showSearch = false;
				searchQuery = '';
			}}
		>
			<Icon path={mdiCancel} width="1.25rem" height="1.25rem" />
		</button>
	</div>
{/if}

{#snippet toolbar()}
	<header
		class="absolute top-0 right-0 w-max flex justify-end items-center p-2 bg-base-100 z-10 pointer-events-auto"
		style:max-width="var(--overlay-width)"
		bind:this={settingsContainer}
	>
		<Stats onafkBlur={onAfkBlur} />
		{#if settings.websocketUrl}
			<SocketConnector />
		{/if}
		{#if settings.secondaryWebsocketUrl}
			<SocketConnector isPrimary={false} />
		{/if}
		{#if appState.isPaused}
			<div
				role="button"
				title="Continue"
				class="mr-1 animate-[pulse_1.25s_cubic-bezier(0.4,0,0.6,1)_infinite] hover:text-primary sm:mr-2"
			>
				<Icon path={mdiPlay} width={iconSize} height={iconSize} onclick={() => (setPaused(false))} />
			</div>
		{:else}
			<div role="button" title="Pause" class="mr-1 hover:text-primary sm:mr-2">
				<Icon path={mdiPause} width={iconSize} height={iconSize} onclick={() => (setPaused(true))} />
			</div>
		{/if}
		<div
			role="button"
			title="Delete last Line"
			class="mr-1 hover:text-primary sm:mr-2"
			class:opacity-50={!dataState.lines.length}
			class:cursor-not-allowed={!dataState.lines.length}
			class:hover:text-primary={dataState.lines.length}
		>
			<Icon path={mdiDeleteForever} width={iconSize} height={iconSize} onclick={removeLastLine} />
		</div>
		<div
			role="button"
			title="Undo last Action"
			class="mr-1 hover:text-primary sm:mr-2"
			class:opacity-50={!dataState.actionHistory.length}
			class:cursor-not-allowed={!dataState.actionHistory.length}
			class:hover:text-primary={dataState.actionHistory.length}
		>
			<Icon path={mdiArrowULeftTop} width={iconSize} height={iconSize} onclick={undoLastAction} />
		</div>
		{#if selectedLineIds.length}
			<div role="button" title="Remove selected Lines" class="mr-1 hover:text-primary sm:mr-2">
				<Icon path={mdiDelete} width={iconSize} height={iconSize} onclick={removeLines} />
			</div>
			<div role="button" title="Deselect Lines" class="mr-1 hover:text-primary sm:mr-2">
				<Icon path={mdiCancel} width={iconSize} height={iconSize} onclick={deselectLines} />
			</div>
		{/if}
		<div role="button" title="Open Notes" class="mr-1 hover:text-primary sm:mr-2">
			<Icon path={mdiNoteEdit} width={iconSize} height={iconSize} onclick={() => (settings.notesOpen = true)} />
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
					onclick={handlePipAction}
				/>
			</div>
		{/if}
		<Icon
			class="cursor-pointer mr-1 hover:text-primary md:mr-2"
			path={mdiCog}
			label="Settings"
			width={iconSize}
			height={iconSize}
			bind:element={settingsElement}
			onclick={() => (settingsOpen = !settingsOpen)}
		/>
		<Settings
			{settingsElement}
			{pipAvailable}
			bind:settingsOpen
			bind:selectedLineIds
			onreset={handleReset}
			onapplyReplacements={() => updateLineData(!!dataState.enabledReplacements.length)}
			onlayoutChange={handleLayoutInvalidation}
			onmaxLinesChange={() => (dataState.lines = applyMaxLinesAndGetRemainingLineData())}
			onlinesRemoved={(ids, indices) => {
				ids.forEach((id) => lineSizes.delete(id));
				const previousCount = dataState.lines.length + indices.length;
				virtualListController.removeIndices(indices.map((index) => mapIndex(index, previousCount)));
				tick().then(() => executeUpdateScroll(true));
			}}
			onlinesChanged={(ids, indices) => {
				ids.forEach((id) => lineSizes.delete(id));
				virtualListController.invalidateIndices(indices.map((index) => mapIndex(index)));
				tick().then(() => {
					remeasureMountedLines();
					executeUpdateScroll(true);
				});
			}}
			ondataResetOrImported={handleDataResetOrImported}
		/>
		<Presets isQuickSwitch={true} onlayoutChange={handleLayoutInvalidation} />
	</header>
{/snippet}
<main
	class="flex flex-col flex-1 break-all w-full h-full overflow-hidden relative"
	style:font-size={`${settings.fontSize}px`}
	style:font-family={settings.onlineFont !== OnlineFont.OFF ? settings.onlineFont : 'undefined'}
	style:writing-mode={settings.displayVertical ? 'vertical-rl' : 'horizontal-tb'}
>
	<div
		aria-hidden="true"
		class="absolute inset-0 invisible pointer-events-none opacity-0 -z-50 overflow-auto"
		style="scrollbar-gutter: stable;"
		style:width={listWidth ? `${listWidth}px` : '100%'}
		style:height={listHeight ? `${listHeight}px` : '100%'}
	>
		<div
			class:w-full={!settings.displayVertical}
			class:h-full={settings.displayVertical}
			use:measureEstimationSamples={estimationSamples.length}
		>
			{#each estimationSamples as text}
				<div
					class="flex flex-col"
					class:px-4={!settings.displayVertical}
					class:py-4={settings.displayVertical}
					class:pt-12={settings.displayVertical}
					class:h-full={settings.displayVertical}
				>
					<p
						class="my-2 border-2 border-transparent"
						class:px-2={!settings.displayVertical}
						class:py-2={settings.displayVertical}
						class:whitespace-pre-wrap={settings.preserveWhitespace}
						style:padding-top={!settings.displayVertical ? `${settings.linePadding}rem` : undefined}
						style:padding-bottom={!settings.displayVertical ? `${settings.linePadding}rem` : undefined}
						style:padding-left={settings.displayVertical ? `${settings.linePadding}rem` : undefined}
						style:padding-right={settings.displayVertical ? `${settings.linePadding}rem` : undefined}
						>{#if settings.showLinePoints}<span style="opacity: 0.1;">• </span>{/if}{formatLineText(text, settings.preserveWhitespace)}</p>
				</div>
			{/each}
		</div>
	</div>

	<div
		class="flex-1 w-full h-full min-h-0 min-w-0 relative"
		bind:clientWidth={listWidth}
		bind:clientHeight={listHeight}
	>
		{#if listWidth && listHeight}
			<div class="absolute inset-0">
				<VirtualList
					controller={virtualListController}
					width="{listWidth}px"
					height="{listHeight}px"
					itemCount={dataState.lines.length}
					itemSize={virtualItemSize}
					{estimatedItemSize}
					scrollDirection={settings.displayVertical ? 'horizontal' : 'vertical'}
					padding="2rem"
				>
					{#snippet overlay()}
						{@render toolbar()}
					{/snippet}
					{#snippet item({ index, style })}
						{@const actualIndex = mapIndex(index)}
						<div
							{style}
							class="absolute"
							class:opacity-50={settings.notesOpen}
							class:px-4={!settings.displayVertical}
							class:py-4={settings.displayVertical}
							class:pt-12={settings.displayVertical}
							class:w-full={!settings.displayVertical}
							class:h-full={settings.displayVertical}
						>
							{#if dataState.lines[actualIndex]}
								<div
									use:measureSize={{ line: dataState.lines[actualIndex], virtual: index }}
									class="flex flex-col"
									class:w-full={!settings.displayVertical}
									class:h-full={settings.displayVertical}
								>
									<div
										class="transition-colors duration-200 rounded"
										class:w-full={!settings.displayVertical}
										class:h-full={settings.displayVertical}
									>
										{#key dataState.lines[actualIndex].id}
											<Line
												line={dataState.lines[actualIndex]}
												isSelected={selectedLineIds.includes(dataState.lines[actualIndex].id)}
												searchQuery={showSearch && matchIndices.includes(actualIndex)
													? searchQuery.trim()
													: ''}
												isCurrentMatchLine={actualIndex === searchJumpIndex}
												onselected={(detail) => {
													selectedLineIds = [...selectedLineIds, detail];
												}}
												ondeselected={(detail) => {
													selectedLineIds = selectedLineIds.filter(
														(selectedLineId) => selectedLineId !== detail,
													);
												}}
												onedit={handleLineEdit}
											/>
										{/key}
									</div>
								</div>
							{/if}
						</div>
					{/snippet}
				</VirtualList>
			</div>
		{/if}
	</div>
</main>
{#if settings.notesOpen}
	<div
		class="bg-base-200 fixed top-0 right-0 z-[60] flex h-full w-full max-w-3xl flex-col justify-between"
		in:fly={{ x: 100, duration: 100, easing: quintInOut }}
	>
		<Notes />
	</div>
{/if}
<div
	id="pip-container"
	class="flex-1 flex flex-col break-all w-full h-full overflow-auto"
	class:flex-col-reverse={settings.reverseLineOrder}
	class:hidden={!pipWindow}
	style:font-size={`${settings.fontSize}px`}
	style:font-family={settings.onlineFont !== OnlineFont.OFF ? settings.onlineFont : 'undefined'}
	style:padding-top={`${settings.linePadding}rem`}
	style:padding-bottom={`${settings.linePadding}rem`}
	bind:this={pipContainer}
>
	{#if pipWindow}
		{#each pipLines as line (line.id)}
			<Line {line} {pipWindow} />
		{/each}
	{/if}
</div>
