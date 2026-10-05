import type { LineType } from './types';

class AppEvent<T> {
	#target = new EventTarget();

	emit(value: T) {
		this.#target.dispatchEvent(new CustomEvent('message', { detail: value }));
	}

	subscribe(listener: (value: T) => void): () => void {
		const handler = (event: Event) => listener((event as CustomEvent<T>).detail);
		this.#target.addEventListener('message', handler);
		return () => this.#target.removeEventListener('message', handler);
	}
}

export const incomingLine = new AppEvent<[string, LineType]>();
export const reconnectPrimarySocket = new AppEvent<void>();
export const reconnectSecondarySocket = new AppEvent<void>();
