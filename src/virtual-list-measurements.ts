// Store measured rows only. Unmeasured rows contribute the current estimate.
export class VirtualListMeasurements {
	#sizes = new Map<number, number>();
	#origin = 0;
	#indices: number[] = [];
	#sums: number[] = [0];
	#dirty = false;
	#changes = new Map<number, { before: number | undefined; after: number | undefined }>();

	get(index: number): number | undefined {
		return this.#sizes.get(this.#origin + index);
	}

	set(index: number, size: number) {
		const key = this.#origin + index;
		const previous = this.#sizes.get(key);
		if (previous === size) return;
		this.#sizes.set(key, size);
		this.#recordChange(key, previous, size);
	}

	delete(index: number) {
		const key = this.#origin + index;
		const previous = this.#sizes.get(key);
		if (this.#sizes.delete(key)) this.#recordChange(key, previous, undefined);
	}

	clear() {
		this.#sizes.clear();
		this.#origin = 0;
		this.#indices = [];
		this.#sums = [0];
		this.#dirty = false;
		this.#changes.clear();
	}

	shift(amount: number) {
		this.#origin -= amount;
	}

	remove(indices: number[]) {
		const removed = [...new Set(indices)].sort((a, b) => a - b);
		const next = new Map<number, number>();
		for (const [key, size] of this.#sizes) {
			const index = key - this.#origin;
			const before = lowerBound(removed, index);
			if (removed[before] !== index) next.set(key - before, size);
		}
		this.#sizes = next;
		this.#dirty = true;
	}

	insert(indices: number[]) {
		const inserted = [...indices].sort((a, b) => a - b);
		const next = new Map<number, number>();
		for (const [key, size] of this.#sizes) {
			let index = key - this.#origin;
			for (const position of inserted) {
				if (position <= index) index += 1;
			}
			next.set(this.#origin + index, size);
		}
		this.#sizes = next;
		this.#dirty = true;
	}

	offset(index: number, estimate: number): number {
		if (this.#dirty || this.#changes.size > 64) {
			this.#indices = [...this.#sizes.keys()].sort((a, b) => a - b);
			this.#sums = [0];
			for (const key of this.#indices) {
				this.#sums.push(this.#sums[this.#sums.length - 1] + this.#sizes.get(key)!);
			}
			this.#dirty = false;
			this.#changes.clear();
		}
		const start = lowerBound(this.#indices, this.#origin);
		const end = lowerBound(this.#indices, this.#origin + index);
		let offset = (index - (end - start)) * estimate + this.#sums[end] - this.#sums[start];
		for (const [key, change] of this.#changes) {
			if (key >= this.#origin && key < this.#origin + index) {
				offset += (change.after ?? estimate) - (change.before ?? estimate);
			}
		}
		return offset;
	}

	#recordChange(key: number, before: number | undefined, after: number | undefined) {
		const original = this.#changes.has(key) ? this.#changes.get(key)!.before : before;
		if (original === after) this.#changes.delete(key);
		else this.#changes.set(key, { before: original, after });
	}
}

function lowerBound(indices: number[], target: number): number {
	let low = 0;
	let high = indices.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (indices[middle] < target) low = middle + 1;
		else high = middle;
	}
	return low;
}
