export interface VirtualListCommands {
	invalidateIndices(indices: number[]): void;
	removeIndices(indices: number[]): void;
	insertIndices(indices: number[]): void;
	shiftIndices(amount: number): void;
	clearCache(): void;
	scrollListToIndex(
		index: number | undefined,
		behavior?: ScrollBehavior,
		alignment?: 'start' | 'center' | 'end' | 'auto',
	): void;
}

export class VirtualListController implements VirtualListCommands {
	#commands: VirtualListCommands | undefined;

	attach(commands: VirtualListCommands) {
		this.#commands = commands;
		return () => {
			if (this.#commands === commands) this.#commands = undefined;
		};
	}

	invalidateIndices(indices: number[]) {
		this.#commands?.invalidateIndices(indices);
	}

	removeIndices(indices: number[]) {
		this.#commands?.removeIndices(indices);
	}

	insertIndices(indices: number[]) {
		this.#commands?.insertIndices(indices);
	}

	shiftIndices(amount: number) {
		this.#commands?.shiftIndices(amount);
	}

	clearCache() {
		this.#commands?.clearCache();
	}

	scrollListToIndex(
		index: number | undefined,
		behavior: ScrollBehavior = 'auto',
		alignment: 'start' | 'center' | 'end' | 'auto' = 'auto',
	) {
		this.#commands?.scrollListToIndex(index, behavior, alignment);
	}
}
