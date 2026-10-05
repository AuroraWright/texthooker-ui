import type { DialogResult } from '../types';

export interface DialogRequest<T = any> {
	icon?: string;
	message?: string;
	type?: string;
	showCancel?: boolean;
	askForData?: string;
	dataValue?: string | number;
	callback?: (result: DialogResult<T>) => void;
}

export class DialogState {
	#queue = $state.raw<DialogRequest[]>([]);
	readonly current = $derived(this.#queue[0]);
	readonly isOpen = $derived(!!this.current);

	open<T>(request: DialogRequest<T>) {
		const message = request.message;
		if (
			message &&
			(message.includes('Lost Connection to') || message.includes('Unable to connect to')) &&
			this.#queue.some((dialog) => dialog.message === message)
		)
			return;
		this.#queue = [...this.#queue, request];
	}

	close() {
		this.#queue = this.#queue.slice(1);
	}

	clear() {
		this.#queue = [];
	}
}

export const dialogState = new DialogState();
