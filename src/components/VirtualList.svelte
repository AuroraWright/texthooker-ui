<script lang="ts">
	import { onMount, tick } from 'svelte';

	export let width: string = '100%';
	export let height: string = '100%';
	export let itemCount: number = 0;
	export let itemSize: ((index: number) => number);
	export let estimatedItemSize: number = 50;
	export let scrollDirection: 'vertical' | 'horizontal' = 'vertical';
	export let padding: string = '0';

	let rootNode: HTMLElement;
	let resizeObserver: ResizeObserver;
	let updateStatePending = false;
	let scrollOffset = 0;
	let visibleItems: { index: number; style: string }[] = [];
	let totalSize = 0;
	let paddingPx = 0;
	let sizeCache: number[] = [];
	let offsetCache: number[] = [0];
	let _prevItemCount = itemCount;
	let _prevScrollDirection = scrollDirection;
	let _prevEstimatedItemSize = estimatedItemSize;

	export function invalidateItemSizes(indices: number[]) {
		if (!indices || indices.length === 0) return;
		let lowestChangedIndex = offsetCache.length;

		for (const index of indices) {
			if (sizeCache[index] !== undefined) {
				sizeCache[index] = undefined;
			}
			if (index < lowestChangedIndex) {
				lowestChangedIndex = index;
			}
		}

		offsetCache.length = Math.min(offsetCache.length, lowestChangedIndex + 1);
		updateState();
	}

	export function shiftIndices(shiftAmount: number) {
		if (!shiftAmount || shiftAmount <= 0) return;

		const newEmptySlots = new Array(shiftAmount).fill(undefined);
		sizeCache = [...newEmptySlots, ...sizeCache];
		offsetCache = [0];
		_prevItemCount += shiftAmount;

		scheduleUpdateState();
	}

	export function clearCache() {
		sizeCache = [];
		offsetCache = [0];
		updateState();
	}

	export function scrollListToIndex(
		index: number | undefined, 
		behavior: ScrollBehavior = 'auto',
		alignment: 'start' | 'center' | 'end' | 'auto' = 'auto'
	) {
		if (index === undefined || !rootNode || itemCount === 0) return;

		tick().then(() => {
			if (itemCount === 0) return;
			const validIndex = Math.max(0, Math.min(itemCount - 1, index));
			const offset = getOffset(validIndex);
			const size = getSize(validIndex);
			const containerSize = scrollDirection === 'vertical' ? rootNode.clientHeight : rootNode.clientWidth;

			let newScrollOffset = offset;
			if (alignment === 'end') {
				newScrollOffset = offset - containerSize + size + (2 * paddingPx);
			} else if (alignment === 'center') {
				newScrollOffset = offset - containerSize / 2 + size / 2 + paddingPx;
			} else if (alignment === 'auto') {
				if (offset < scrollOffset) {
					newScrollOffset = offset;
				} else if (offset + size > scrollOffset + containerSize - (2 * paddingPx)) {
					newScrollOffset = offset - containerSize + size + (2 * paddingPx);
				} else {
					newScrollOffset = scrollOffset;
				}
			} else {
				newScrollOffset = offset;
			}

			const maxScroll = Math.max(0, totalSize - containerSize);
			newScrollOffset = Math.max(0, Math.min(maxScroll, newScrollOffset));

			if (behavior === 'smooth') {
				const threshold = Math.max(300, containerSize); 
				const isNearStart = scrollOffset <= threshold;
				const isNearEnd = scrollOffset >= maxScroll - threshold;

				if (alignment === 'end' && !isNearEnd) {
					behavior = 'auto';
				} else if (alignment === 'start' && !isNearStart) {
					behavior = 'auto';
				}
			}

			if (scrollDirection === 'vertical') {
				rootNode.scrollTo({ top: newScrollOffset, left: 0, behavior });
			}
			else {
				rootNode.scrollTo({ left: -newScrollOffset, top: 0, behavior });
			}
			scrollOffset = newScrollOffset;
			updateState();
		});
	}

	function getSize(index: number) {
		if (sizeCache[index] !== undefined) return sizeCache[index];

		let size = estimatedItemSize;
		let isMeasured = false;

		const val = itemSize(index);
		if (val !== undefined && val > 0) { 
			size = val;
			isMeasured = true;
		}

		if (isMeasured) {
			sizeCache[index] = size;
		}

		return size;
	}

	function getOffset(index: number) {
		if (offsetCache[index] !== undefined) return offsetCache[index];
		let lastCalculatedIndex = offsetCache.length - 1;
		let offset = offsetCache[lastCalculatedIndex];
		for (let i = lastCalculatedIndex; i < index; i++) {
			offset += getSize(i);
			offsetCache[i + 1] = offset;
		}
		return offset;
	}

	function findNearestItem(offset: number) {
		let low = 0;
		let high = Math.max(0, itemCount - 1);
		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const currentOffset = offsetCache[mid] !== undefined 
				? offsetCache[mid] 
				: mid * estimatedItemSize;

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
			return;
		}

		totalSize = getOffset(itemCount) + (paddingPx * 2);

		const isVertical = scrollDirection === 'vertical';
		const containerSize = isVertical ? rootNode.clientHeight : rootNode.clientWidth;

		const searchOffset = Math.max(0, scrollOffset - paddingPx);
		const startIndex = Math.max(0, findNearestItem(searchOffset) - 5);
		const endIndex = Math.min(itemCount - 1, findNearestItem(searchOffset + containerSize) + 5);

		const newVisibleItems = [];
		for (let i = startIndex; i <= endIndex; i++) {
			const offset = getOffset(i) + paddingPx;
			newVisibleItems.push({
				index: i,
				style: `position: absolute; ${isVertical ? 'top' : 'right'}: ${offset}px; ${isVertical ? 'width: 100%' : 'height: 100%'};`
			});
		}
		visibleItems = newVisibleItems;
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

	function handlePropsChange(
		newCount: number,
		newDirection: 'vertical' | 'horizontal',
		newEstimatedSize: number
	) {
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

		scheduleUpdateState();
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

	onMount(() => {
		updateState();

		if (typeof ResizeObserver !== 'undefined' && rootNode) {
			resizeObserver = new ResizeObserver(() => {
				scheduleUpdateState();
			});
			resizeObserver.observe(rootNode);
		}

		return () => {
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
		};
	});

	$: handlePropsChange(itemCount, scrollDirection, estimatedItemSize);

	$: {
		if (padding.endsWith('rem')) {
			const rem = parseFloat(padding);
			const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
			paddingPx = rem * rootFontSize;
		} else {
			paddingPx = parseFloat(padding) || 0;
		}
		scheduleUpdateState();
	}
</script>

<div
	bind:this={rootNode}
	on:scroll={handleScroll}
	style="position: relative; overflow: auto; width: {width}; height: {height}; will-change: transform; -webkit-overflow-scrolling: touch; scrollbar-gutter: stable;"
>
	<div style="{scrollDirection === 'vertical' ? 'min-height' : 'min-width'}: {totalSize}px; width: 100%; height: 100%; position: relative;">
		{#each visibleItems as item (item.index)}
			<slot name="item" index={item.index} style={item.style} />
		{/each}
	</div>
</div>
