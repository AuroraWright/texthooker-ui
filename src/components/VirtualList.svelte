<script lang="ts">
    import { onMount, tick } from 'svelte';

    export let width: string | number = '100%';
    export let height: string | number = '100%';
    export let itemCount: number = 0;
    export let itemSize: number | number[] | ((index: number) => number);
    export let estimatedItemSize: number = 50;
    export let scrollDirection: 'vertical' | 'horizontal' = 'vertical';
    export let rtl: boolean = false;
    export let padding: number = 0;

    let updateStatePending = false;
    let dynamicEstimatedSize = estimatedItemSize;
    let measuredCount = 0;
    let measuredSum = 0;

    let rootNode: HTMLElement;
    let scrollOffset = 0;
    let visibleItems: { index: number; style: string }[] = [];
    let totalSize = 0;

    let sizeCache: number[] = [];
    let offsetCache: number[] = [0];
    let _prevItemSize: any;

    export function invalidateItemSizes(indices: number[]) {
        if (!indices || indices.length === 0) return;
        let lowestChangedIndex = offsetCache.length;

        for (const index of indices) {
            if (sizeCache[index] !== undefined) {
                measuredSum -= sizeCache[index] as number;
                measuredCount--;
                sizeCache[index] = undefined;
            }
            if (index < lowestChangedIndex) {
                lowestChangedIndex = index;
            }
        }
        if (measuredCount > 0) {
            dynamicEstimatedSize = measuredSum / measuredCount;
        } else {
            dynamicEstimatedSize = estimatedItemSize;
        }

        offsetCache.length = Math.min(offsetCache.length, lowestChangedIndex + 1);
        updateState();
    }

    export function clearCacheAndAverage() {
        sizeCache = [];
        offsetCache = [0];
        measuredCount = 0;
        measuredSum = 0;
        dynamicEstimatedSize = estimatedItemSize;
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
                newScrollOffset = offset - containerSize + size + (2 * padding);
            } else if (alignment === 'center') {
                newScrollOffset = offset - containerSize / 2 + size / 2 + padding;
            } else if (alignment === 'auto') {
                if (offset < scrollOffset) {
                    newScrollOffset = offset;
                } else if (offset + size > scrollOffset + containerSize - (2 * padding)) {
                    newScrollOffset = offset - containerSize + size + (2 * padding);
                } else {
                    newScrollOffset = scrollOffset;
                }
            } else {
                newScrollOffset = offset;
            }

            const maxScroll = Math.max(0, totalSize - containerSize + (2 * padding));
            newScrollOffset = Math.max(0, Math.min(maxScroll, newScrollOffset));

            if (scrollDirection === 'vertical') {
                rootNode.scrollTo({ top: newScrollOffset, behavior });
            } else {
                rootNode.scrollTo({ left: rtl ? -newScrollOffset : newScrollOffset, behavior });
            }
            scrollOffset = newScrollOffset;
            updateState();
        });
    }

    function getSize(index: number) {
        if (sizeCache[index] !== undefined) return sizeCache[index];

        let size = dynamicEstimatedSize;
        let isMeasured = false;

        if (typeof itemSize === 'function') {
            const val = itemSize(index);
            if (typeof val === 'number' && val > 0) { size = val; isMeasured = true; }
        } else if (Array.isArray(itemSize)) {
            const val = itemSize[index];
            if (typeof val === 'number' && val > 0) { size = val; isMeasured = true; }
        } else if (typeof itemSize === 'number' && itemSize > 0) {
            size = itemSize;
            isMeasured = true;
        }

        if (isMeasured) {
            measuredCount++;
            measuredSum += size;
            dynamicEstimatedSize = measuredSum / measuredCount;
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
                : mid * dynamicEstimatedSize;
                
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

        totalSize = getOffset(itemCount);

        const isVertical = scrollDirection === 'vertical';
        const containerSize = isVertical ? rootNode.clientHeight : rootNode.clientWidth;

        const startIndex = Math.max(0, findNearestItem(scrollOffset) - 5);
        const endIndex = Math.min(itemCount - 1, findNearestItem(scrollOffset + containerSize) + 5);

        const newVisibleItems = [];
        const hDir = rtl ? 'right' : 'left';
        for (let i = startIndex; i <= endIndex; i++) {
            const offset = getOffset(i);
            newVisibleItems.push({
                index: i,
                style: `position: absolute; ${isVertical ? 'top' : hDir}: ${offset}px; ${isVertical ? 'width: 100%' : 'height: 100%'};`
            });
        }
        visibleItems = newVisibleItems;
    }

    function handleScroll() {
        if (!rootNode) return;
        let newScrollOffset = scrollDirection === 'vertical' ? rootNode.scrollTop : rootNode.scrollLeft;
        
        if (scrollDirection === 'horizontal' && rtl) {
            newScrollOffset = Math.abs(newScrollOffset);
        }
        
        if (newScrollOffset !== scrollOffset) {
            scrollOffset = newScrollOffset;
            updateState();
        }
    }

    $: handlePropsChange(itemCount, itemSize);
    function handlePropsChange(newCount: number, newSize: any) {
        if (newSize !== _prevItemSize) {
            sizeCache = [];
            offsetCache = [0];
            _prevItemSize = newSize;
        }
        if (newCount < sizeCache.length) {
            sizeCache.length = newCount;
            offsetCache.length = Math.min(offsetCache.length, newCount + 1);
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

    let resizeObserver: ResizeObserver;
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

    $: widthStyle = typeof width === 'number' ? `${width}px` : width;
    $: heightStyle = typeof height === 'number' ? `${height}px` : height;
</script>

<div
    bind:this={rootNode}
    on:scroll={handleScroll}
    style="position: relative; overflow: auto; width: {widthStyle}; height: {heightStyle}; will-change: transform; -webkit-overflow-scrolling: touch; scrollbar-gutter: stable;"
>
    <div style="{scrollDirection === 'vertical' ? 'min-height' : 'min-width'}: {totalSize}px; width: 100%; height: 100%; position: relative;">
        {#each visibleItems as item (item.index)}
            <slot name="item" index={item.index} style={item.style} />
        {/each}
    </div>
</div>
