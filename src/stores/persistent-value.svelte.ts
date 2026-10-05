import { getIDBItem, setIDBItem } from '../idb';
import { untrack } from 'svelte';

export class JSONValue<T> {
	#value: T;
	constructor(
		private key: string,
		private defaultValue: T,
	) {
		const stored = window.localStorage.getItem(key);
		this.#value = $state.raw(stored ? JSON.parse(stored) : defaultValue);
	}

	get value() {
		return this.#value;
	}
	set value(value: T) {
		this.#value = value;
		untrack(() => window.localStorage.setItem(this.key, JSON.stringify(value ?? this.defaultValue)));
	}
}

interface IDBOptions<T> {
	key: string;
	defaultValue: T;
	parseLegacy: (stored: string) => T;
	isEmpty: (value: T | undefined) => boolean;
	merge: (loaded: T, current: T) => T;
	shallPersist: () => boolean;
	onLoaded?: () => void;
}

export class IDBValue<T> {
	#value: T;
	#timeout: ReturnType<typeof setTimeout>;

	constructor(private options: IDBOptions<T>) {
		this.#value = $state.raw(options.defaultValue);
		void this.hydrate();
	}

	get value() {
		return this.#value;
	}
	set value(value: T) {
		this.#value = value;
		clearTimeout(this.#timeout);
		this.#timeout = setTimeout(() => {
			if (this.options.shallPersist()) {
				void setIDBItem(this.options.key, value ?? this.options.defaultValue).catch(console.error);
			}
		}, 150);
	}

	private load(value: T | undefined) {
		if (value !== undefined && (typeof value === 'string' || !this.options.isEmpty(value))) {
			this.value = this.options.merge(value, this.value);
		}
		this.options.onLoaded?.();
	}

	private async hydrate() {
		const { key, parseLegacy, isEmpty } = this.options;
		let legacy: T | undefined;
		try {
			const stored = window.localStorage.getItem(key);
			if (stored !== null) legacy = parseLegacy(stored);
		} catch (_) {}

		try {
			const stored = await getIDBItem<T>(key);
			const storedEmpty = isEmpty(stored);
			this.load(storedEmpty ? legacy : stored);

			if (legacy !== undefined && (typeof legacy === 'string' || !isEmpty(legacy)) && storedEmpty) {
				void setIDBItem(key, legacy)
					.then(() => {
						window.localStorage.removeItem(key);
					})
					.catch(console.error);
			} else if (legacy !== undefined && stored !== undefined) {
				window.localStorage.removeItem(key);
			}
		} catch (error) {
			console.error(`Error hydrating ${key} from IndexedDB:`, error);
			if (legacy !== undefined && !isEmpty(legacy)) this.load(legacy);
			else this.options.onLoaded?.();
		}
	}
}
