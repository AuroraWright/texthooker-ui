<script lang="ts">
	import { untrack } from 'svelte';

	import { onMount, tick } from 'svelte';
	import type { VirtualListController } from '../virtual-list-controller';
	import { VirtualListMeasurements } from '../virtual-list-measurements';

	interface Props {
		controller: VirtualListController;
		width?: string;
		height?: string;
		itemCount?: number;
		itemSize: (index: number) => number;
		estimatedItemSize?: number;
		scrollDirection?: 'vertical' | 'horizontal';
		padding?: string;
		item?: import('svelte').Snippet<[{ index: number; style: string }]>;
		overlay?: import('svelte').Snippet;
	}

	let {
		controller,
		width = '100%',
		height = '100%',
		itemCount = 0,
		itemSize,
		estimatedItemSize = 50,
		scrollDirection = 'vertical',
		padding = '0',
		item,
		overlay,
	}: Props = $props();

	let rootNode: HTMLElement = $state();
	let resizeObserver: ResizeObserver;
	let updateStatePending = false;
	let scrollOffset = 0;
	let userScrollUntil = 0;
	let scrollbarDrag: { extent: number; offset: number } | undefined;
	let scrollAnchor: { index: number; offset: number } | undefined;
	let visibleItems: { index: number; style: string }[] = $state([]);
	let totalSize = $state(0);
	let paddingPx = $state(0);
	let viewportWidth = $state(0);
	let lastFirstVisibleIndex = 0;
	let lastFirstVisibleOffset = 0;
	let lastLastVisibleIndex = 0;
	let lastLastVisibleOffset = 0;
	let lastTotalSize = 0;
	let activeScrollTarget:
		{ index: number; alignment: 'start' | 'center' | 'end' | 'auto'; behavior: ScrollBehavior } | undefined =
		undefined;
	let scrollTargetTimeout: number;
	const measurements = new VirtualListMeasurements();
	let _prevItemCount = untrack(() => itemCount);
	let _prevScrollDirection = untrack(() => scrollDirection);
	let _prevEstimatedItemSize = untrack(() => estimatedItemSize);

	function invalidateIndices(indices: number[]) {
		if (!indices || indices.length === 0) return;

		for (const index of indices) {
			measurements.delete(index);
			getSize(index);
		}
		updateState();
	}

	function removeIndices(indices: number[]) {
		if (!indices || indices.length === 0) return;
		scrollAnchor = undefined;

		const sortedIndices = [...indices].sort((a, b) => b - a);
		measurements.remove(sortedIndices);
		for (const index of sortedIndices) {
			if (index < lastFirstVisibleIndex) lastFirstVisibleIndex--;
			if (index < lastLastVisibleIndex) lastLastVisibleIndex--;
		}
		_prevItemCount -= indices.length;
		scheduleUpdateState();
	}

	function insertIndices(indices: number[]) {
		if (!indices || indices.length === 0) return;
		scrollAnchor = undefined;

		const sortedIndices = [...indices].sort((a, b) => a - b);
		measurements.insert(sortedIndices);
		for (const index of sortedIndices) {
			if (index <= lastFirstVisibleIndex) lastFirstVisibleIndex++;
			if (index <= lastLastVisibleIndex) lastLastVisibleIndex++;
		}
		_prevItemCount += indices.length;
		scheduleUpdateState();
	}

	function shiftIndices(shiftAmount: number) {
		if (!shiftAmount || shiftAmount <= 0) return;
		scrollAnchor = undefined;

		measurements.shift(shiftAmount);
		_prevItemCount += shiftAmount;
		lastFirstVisibleIndex += shiftAmount;
		lastLastVisibleIndex += shiftAmount;
		scheduleUpdateState();
	}

	function clearCache() {
		scrollAnchor = undefined;
		measurements.clear();
		lastTotalSize = 0;
		updateState();
	}

	function scrollListToIndex(
		index: number | undefined,
		behavior: ScrollBehavior = 'auto',
		alignment: 'start' | 'center' | 'end' | 'auto' = 'auto',
	) {
		if (index === undefined || !rootNode || itemCount === 0 || scrollbarDrag) return;
		scrollAnchor = undefined;
		activeScrollTarget = { index, alignment, behavior };
		scheduleUpdateState();
	}

	function getSize(index: number) {
		const cached = measurements.get(index);
		if (cached !== undefined) return cached;

		let size = untrack(() => estimatedItemSize);
		let isMeasured = false;
		const val = itemSize(index);

		if (val !== undefined && val > 0) {
			size = val;
			isMeasured = true;
		}

		if (isMeasured) {
			measurements.set(index, size);
		}

		return size;
	}

	function getOffset(index: number) {
		return measurements.offset(index, estimatedItemSize);
	}

	function findNearestItem(offset: number) {
		let low = 0;
		let high = Math.max(0, itemCount - 1);

		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const currentOffset = getOffset(mid);

			if (currentOffset === offset) return mid;

			if (currentOffset < offset) {
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}

		return Math.max(0, low - 1);
	}

	function updateState(forceScroll = false) {
		if (rootNode) viewportWidth = rootNode.clientWidth;
		if (!rootNode || itemCount === 0 || !Number.isFinite(estimatedItemSize) || estimatedItemSize <= 0) {
			visibleItems = [];
			totalSize = 0;
			lastTotalSize = 0;
			return;
		}

		const isVertical = scrollDirection === 'vertical';
		const containerSize = isVertical ? rootNode.clientHeight : rootNode.clientWidth;
		const previousScrollOffset = scrollOffset;
		for (const item of visibleItems) {
			if (item.index < itemCount) getSize(item.index);
		}
		if (activeScrollTarget) getSize(Math.max(0, Math.min(itemCount - 1, activeScrollTarget.index)));
		const newTotalSize = getOffset(itemCount) + paddingPx * 2;
		if (scrollbarDrag) {
			scrollOffset = dragScrollOffset(newTotalSize, containerSize);
		}

		let pendingScrollOffset = scrollOffset;
		let pendingBehavior: ScrollBehavior = 'auto';

		if (activeScrollTarget) {
			const validIndex = Math.max(0, Math.min(itemCount - 1, activeScrollTarget.index));
			const offset = getOffset(validIndex);
			const size = getSize(validIndex);

			if (activeScrollTarget.alignment === 'end') {
				pendingScrollOffset = offset - containerSize + size + 2 * paddingPx;
			} else if (activeScrollTarget.alignment === 'center') {
				pendingScrollOffset = offset - containerSize / 2 + size / 2 + paddingPx;
			} else if (activeScrollTarget.alignment === 'auto') {
				if (offset < scrollOffset) {
					pendingScrollOffset = offset;
				} else if (offset + size > scrollOffset + containerSize - 2 * paddingPx) {
					pendingScrollOffset = offset - containerSize + size + 2 * paddingPx;
				} else {
					pendingScrollOffset = scrollOffset;
				}
			} else {
				pendingScrollOffset = offset;
			}

			const maxScroll = Math.max(0, newTotalSize - containerSize);
			pendingScrollOffset = Math.max(0, Math.min(maxScroll, pendingScrollOffset));

			pendingBehavior = activeScrollTarget.behavior;
			if (pendingBehavior === 'smooth') {
				const threshold = Math.max(300, containerSize);
				const isNearStart = scrollOffset <= threshold;
				const isNearEnd = scrollOffset >= maxScroll - threshold;
				if (activeScrollTarget.alignment === 'end' && !isNearEnd) {
					pendingBehavior = 'auto';
				} else if (activeScrollTarget.alignment === 'start' && !isNearStart) {
					pendingBehavior = 'auto';
				}
			}

			if (document.visibilityState !== 'hidden') {
				clearTimeout(scrollTargetTimeout);
				scrollTargetTimeout = window.setTimeout(resetScrollTarget, 100);
			}
		} else if (scrollAnchor && !scrollbarDrag) {
			pendingScrollOffset = getOffset(scrollAnchor.index) + scrollAnchor.offset;
		} else if (!scrollbarDrag && lastTotalSize > 0 && newTotalSize !== lastTotalSize && performance.now() >= userScrollUntil) {
			const safeFirstIndex = Math.max(0, Math.min(itemCount - 1, lastFirstVisibleIndex));
			const newFirstVisibleOffset = getOffset(safeFirstIndex);
			const diffTop = newFirstVisibleOffset - lastFirstVisibleOffset;

			if (diffTop !== 0) {
				const safeLastIndex = Math.max(0, Math.min(itemCount - 1, lastLastVisibleIndex));
				const newLastVisibleOffset = getOffset(safeLastIndex);
				const diffBottom = newLastVisibleOffset - lastLastVisibleOffset;
				pendingScrollOffset = scrollOffset + diffBottom;
			}

			const maxScroll = Math.max(0, newTotalSize - containerSize);
			pendingScrollOffset = Math.max(0, Math.min(maxScroll, pendingScrollOffset));
		}

		scrollOffset = pendingScrollOffset;

		const searchOffset = Math.max(0, scrollOffset - paddingPx);
		const startIndex = Math.max(0, findNearestItem(searchOffset) - 5);
		const endIndex = Math.min(itemCount - 1, findNearestItem(searchOffset + containerSize) + 5);

		for (let i = startIndex; i <= endIndex; i++) getSize(i);
		const measuredTotalSize = getOffset(itemCount) + paddingPx * 2;
		totalSize = scrollbarDrag?.extent ?? measuredTotalSize;
		if (scrollbarDrag) scrollOffset = dragScrollOffset(measuredTotalSize, containerSize);
		else if (scrollAnchor) scrollOffset = getOffset(scrollAnchor.index) + scrollAnchor.offset;
		const dragTranslation = scrollbarDrag ? scrollbarDrag.offset - scrollOffset : 0;
		if (!scrollbarDrag && (forceScroll || scrollOffset !== previousScrollOffset)) {
			tick().then(() => {
				if (!rootNode) return;
				rootNode.scrollTo(scrollDirection === 'vertical'
					? { top: scrollOffset, left: 0, behavior: pendingBehavior }
					: { left: -scrollOffset, top: 0, behavior: pendingBehavior });
			});
		}

		const newVisibleItems = [];
		for (let i = startIndex; i <= endIndex; i++) {
			const offset = getOffset(i) + paddingPx + dragTranslation;
			newVisibleItems.push({
				index: i,
				style: `position: absolute; ${isVertical ? 'top' : 'right'}: ${offset}px; ${isVertical ? 'width: 100%' : 'height: 100%'};`,
			});
		}
		visibleItems = newVisibleItems;

		lastFirstVisibleIndex = findNearestItem(scrollOffset);
		lastFirstVisibleOffset = getOffset(lastFirstVisibleIndex);
		lastLastVisibleIndex = findNearestItem(scrollOffset + containerSize);
		lastLastVisibleOffset = getOffset(lastLastVisibleIndex);
		lastTotalSize = measuredTotalSize;
	}

	function dragScrollOffset(extent: number, viewport: number) {
		const dragRange = Math.max(0, scrollbarDrag.extent - viewport);
		const progress = dragRange ? Math.min(1, Math.max(0, scrollbarDrag.offset / dragRange)) : 0;
		return progress * Math.max(0, extent - viewport);
	}

	function handlePointerDown(event: PointerEvent) {
		resetScrollTarget();
		scrollAnchor = undefined;
		// Native scrollbar input targets the scroller itself, rather than its content.
		if (event.button !== 0 || event.target !== rootNode) return;
		const vertical = scrollDirection === 'vertical';
		scrollbarDrag = {
			extent: vertical ? rootNode.scrollHeight : rootNode.scrollWidth,
			offset: vertical ? rootNode.scrollTop : Math.abs(rootNode.scrollLeft),
		};
	}

	function finishScrollbarDrag() {
		if (!scrollbarDrag) return;
		if (rootNode) {
			const vertical = scrollDirection === 'vertical';
			scrollbarDrag.offset = vertical ? rootNode.scrollTop : Math.abs(rootNode.scrollLeft);
			scrollOffset = dragScrollOffset(
				getOffset(itemCount) + paddingPx * 2,
				vertical ? rootNode.clientHeight : rootNode.clientWidth,
			);
		}
		const index = findNearestItem(scrollOffset);
		scrollAnchor = { index, offset: scrollOffset - getOffset(index) };
		scrollbarDrag = undefined;
		userScrollUntil = 0;
		// The physical offset still uses the frozen drag range, even if the logical offset is unchanged.
		updateState(true);
	}

	function handleScroll() {
		if (!rootNode) return;
		let newScrollOffset = scrollDirection === 'vertical' ? rootNode.scrollTop : rootNode.scrollLeft;

		if (scrollDirection === 'horizontal') {
			newScrollOffset = Math.abs(newScrollOffset);
		}

		if (scrollbarDrag) {
			scrollbarDrag.offset = newScrollOffset;
			updateState();
		} else if (scrollAnchor && Math.abs(newScrollOffset - scrollOffset) < 1) {
			// Browsers round assigned scroll offsets; that is not a new user scroll.
			scrollOffset = newScrollOffset;
		} else if (newScrollOffset !== scrollOffset) {
			scrollAnchor = undefined;
			// Measurements must not pull the scrollbar back while the user is moving it.
			if (!activeScrollTarget) userScrollUntil = performance.now() + 150;
			scrollOffset = newScrollOffset;
			updateState();
		}
	}

	function resetScrollTarget() {
		activeScrollTarget = undefined;
		scrollTargetTimeout = undefined;
	}

	function handlePropsChange(newCount: number, newDirection: 'vertical' | 'horizontal', newEstimatedSize: number) {
		const directionChanged = newDirection !== _prevScrollDirection;
		const sizeChanged = newEstimatedSize !== _prevEstimatedItemSize;
		const hasDecreased = newCount < _prevItemCount;

		_prevItemCount = newCount;
		_prevScrollDirection = newDirection;
		_prevEstimatedItemSize = newEstimatedSize;

		if (directionChanged) {
			scrollOffset = 0;
			if (rootNode) {
				rootNode.scrollTop = 0;
				rootNode.scrollLeft = 0;
			}
		}

		if (directionChanged || hasDecreased) {
			clearCache();
			return;
		}

		// A new estimate affects unknown rows, not the measurements already collected.
		if (sizeChanged && lastTotalSize > 0 && !activeScrollTarget && !scrollbarDrag) {
			const index = Math.max(0, Math.min(newCount - 1, lastFirstVisibleIndex));
			scrollAnchor = { index, offset: scrollOffset - lastFirstVisibleOffset };
		}

		updateState();
	}

	function scheduleUpdateState() {
		if (!updateStatePending) {
			updateStatePending = true;
			tick().then(() => {
				updateState();
				updateStatePending = false;
			});
		}
	}

	$effect(() =>
		controller.attach({
			invalidateIndices,
			removeIndices,
			insertIndices,
			shiftIndices,
			clearCache,
			scrollListToIndex,
		}),
	);

	onMount(() => {
		updateState();
		window.addEventListener('pointerup', finishScrollbarDrag);
		window.addEventListener('pointercancel', finishScrollbarDrag);
		window.addEventListener('blur', finishScrollbarDrag);

		if (typeof ResizeObserver !== 'undefined' && rootNode) {
			resizeObserver = new ResizeObserver(() => {
				scheduleUpdateState();
			});
			resizeObserver.observe(rootNode);
		}

		return () => {
			window.removeEventListener('pointerup', finishScrollbarDrag);
			window.removeEventListener('pointercancel', finishScrollbarDrag);
			window.removeEventListener('blur', finishScrollbarDrag);
			clearTimeout(scrollTargetTimeout);
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
		};
	});

	$effect(() => {
		const count = itemCount;
		const direction = scrollDirection;
		const size = estimatedItemSize;
		untrack(() => handlePropsChange(count, direction, size));
	});

	$effect(() => {
		if (padding.endsWith('rem')) {
			const rem = parseFloat(padding);
			const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
			paddingPx = rem * rootFontSize;
		} else {
			paddingPx = parseFloat(padding) || 0;
		}
		scheduleUpdateState();
	});
</script>

<div
	role="region"
	aria-label="Text history"
	bind:this={rootNode}
	onscroll={handleScroll}
	onwheel={resetScrollTarget}
	onpointerdown={handlePointerDown}
	style="position: relative; overflow: auto; overflow-anchor: none; width: {width}; height: {height}; will-change: transform; -webkit-overflow-scrolling: touch; scrollbar-gutter: stable;"
>
	{#if overlay}
		<div
			class="font-sans text-base break-normal"
			style="position: sticky; top: 0; right: 0; width: 0; height: 0; margin-left: auto; z-index: 10; pointer-events: none; writing-mode: horizontal-tb; --overlay-width: {viewportWidth}px;"
		>
			{@render overlay()}
		</div>
	{/if}
	<div
		style="{scrollDirection === 'vertical'
			? 'min-height'
			: 'min-width'}: {totalSize}px; width: 100%; height: 100%; position: relative; overflow: clip;"
	>
		{#each visibleItems as visibleItem (visibleItem.index)}
			{@render item?.({ index: visibleItem.index, style: visibleItem.style })}
		{/each}
	</div>
</div>
