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
	}: Props = $props();

	let rootNode: HTMLElement = $state();
	let resizeObserver: ResizeObserver;
	let updateStatePending = false;
	let scrollOffset = 0;
	let visibleItems: { index: number; style: string }[] = $state([]);
	let totalSize = $state(0);
	let paddingPx = $state(0);
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

		const sortedIndices = [...indices].sort((a, b) => b - a);
		measurements.remove(sortedIndices);
		for (const index of sortedIndices) {
			if (index < lastFirstVisibleIndex) lastFirstVisibleIndex--;
			if (index < lastLastVisibleIndex) lastLastVisibleIndex--;
		}
		_prevItemCount -= indices.length;
		updateState();
	}

	function insertIndices(indices: number[]) {
		if (!indices || indices.length === 0) return;

		const sortedIndices = [...indices].sort((a, b) => a - b);
		measurements.insert(sortedIndices);
		for (const index of sortedIndices) {
			if (index <= lastFirstVisibleIndex) lastFirstVisibleIndex++;
			if (index <= lastLastVisibleIndex) lastLastVisibleIndex++;
		}
		_prevItemCount += indices.length;
		updateState();
	}

	function shiftIndices(shiftAmount: number) {
		if (!shiftAmount || shiftAmount <= 0) return;

		measurements.shift(shiftAmount);
		_prevItemCount += shiftAmount;
		lastFirstVisibleIndex += shiftAmount;
		lastLastVisibleIndex += shiftAmount;
		scheduleUpdateState();
	}

	function clearCache() {
		measurements.clear();
		lastTotalSize = 0;
		updateState();
	}

	function scrollListToIndex(
		index: number | undefined,
		behavior: ScrollBehavior = 'auto',
		alignment: 'start' | 'center' | 'end' | 'auto' = 'auto',
	) {
		if (index === undefined || !rootNode || itemCount === 0) return;
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

	function updateState() {
		if (!rootNode || itemCount === 0) {
			visibleItems = [];
			totalSize = 0;
			lastTotalSize = 0;
			return;
		}

		const isVertical = scrollDirection === 'vertical';
		const containerSize = isVertical ? rootNode.clientHeight : rootNode.clientWidth;
		for (const item of visibleItems) {
			if (item.index < itemCount) getSize(item.index);
		}
		if (activeScrollTarget) getSize(Math.max(0, Math.min(itemCount - 1, activeScrollTarget.index)));
		const newTotalSize = getOffset(itemCount) + paddingPx * 2;

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
		} else if (lastTotalSize > 0 && newTotalSize !== lastTotalSize) {
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

		if (pendingScrollOffset !== scrollOffset) {
			scrollOffset = pendingScrollOffset;
			tick().then(() => {
				if (rootNode) {
					if (scrollDirection === 'vertical') {
						rootNode.scrollTo({ top: scrollOffset, left: 0, behavior: pendingBehavior });
					} else {
						rootNode.scrollTo({ left: -scrollOffset, top: 0, behavior: pendingBehavior });
					}
				}
			});
		}

		const searchOffset = Math.max(0, scrollOffset - paddingPx);
		const startIndex = Math.max(0, findNearestItem(searchOffset) - 5);
		const endIndex = Math.min(itemCount - 1, findNearestItem(searchOffset + containerSize) + 5);

		for (let i = startIndex; i <= endIndex; i++) getSize(i);
		totalSize = getOffset(itemCount) + paddingPx * 2;

		const newVisibleItems = [];
		for (let i = startIndex; i <= endIndex; i++) {
			const offset = getOffset(i) + paddingPx;
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
		lastTotalSize = totalSize;
	}

	function handleScroll() {
		if (!rootNode) return;
		let newScrollOffset = scrollDirection === 'vertical' ? rootNode.scrollTop : rootNode.scrollLeft;

		if (scrollDirection === 'horizontal') {
			newScrollOffset = Math.abs(newScrollOffset);
		}

		if (newScrollOffset !== scrollOffset) {
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

		if (directionChanged || sizeChanged || hasDecreased) {
			clearCache();
			return;
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

		if (typeof ResizeObserver !== 'undefined' && rootNode) {
			resizeObserver = new ResizeObserver(() => {
				scheduleUpdateState();
			});
			resizeObserver.observe(rootNode);
		}

		return () => {
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
	onpointerdown={resetScrollTarget}
	style="position: relative; overflow: auto; width: {width}; height: {height}; will-change: transform; -webkit-overflow-scrolling: touch; scrollbar-gutter: stable;"
>
	<div
		style="{scrollDirection === 'vertical'
			? 'min-height'
			: 'min-width'}: {totalSize}px; width: 100%; height: 100%; position: relative;"
	>
		{#each visibleItems as visibleItem (visibleItem.index)}
			{@render item?.({ index: visibleItem.index, style: visibleItem.style })}
		{/each}
	</div>
</div>
