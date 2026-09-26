import { BehaviorSubject, debounceTime, skip } from 'rxjs';
import { getIDBItem, setIDBItem } from '../../idb';
import { writableSubject } from './writeable-subject';

export function writableIDBArraySubject<T>() {
	return (
		key: string,
		defaultValue: T[],
		persistenceBehavior?: BehaviorSubject<boolean>,
		onLoaded?: (items: T[]) => void
	) => {
		const subject = writableSubject<T[]>(defaultValue);
		let persist = true;

		if (persistenceBehavior) {
			persistenceBehavior.subscribe((shallPersist) => (persist = shallPersist));
		}

		let legacyData: T[] | undefined;
		try {
			const rawLegacy = window.localStorage.getItem(key);
			if (rawLegacy) {
				legacyData = JSON.parse(rawLegacy) as T[];
			}
		} catch (_) {
		}

		getIDBItem<T[]>(key)
			.then((stored) => {
				const isStoredEmpty = !stored || stored.length === 0;
				const dataToLoad = !isStoredEmpty ? stored : legacyData;

				if (dataToLoad && dataToLoad.length > 0) {
					const current = subject.getValue();
					if (current.length === 0) {
						subject.next(dataToLoad);
					} else {
						subject.next([...dataToLoad, ...current]);
					}
					onLoaded?.(dataToLoad);
				} else {
					onLoaded?.([]);
				}

				if (legacyData && legacyData.length > 0 && isStoredEmpty) {
					setIDBItem(key, legacyData).then(() => {
						window.localStorage.removeItem(key);
					}).catch(console.error);
				} else if (legacyData && stored) {
					window.localStorage.removeItem(key);
				}
			})
			.catch((error) => {
				console.error(`Error hydrating ${key} from IndexedDB:`, error);
				if (legacyData && legacyData.length > 0) {
					const current = subject.getValue();
					if (current.length === 0) {
						subject.next(legacyData);
					} else {
						subject.next([...legacyData, ...current]);
					}
					onLoaded?.(legacyData);
				} else {
					onLoaded?.([]);
				}
			});

		subject
			.pipe(skip(1), debounceTime(150))
			.subscribe((updatedValue) => {
				if (persist) {
					setIDBItem(key, updatedValue ?? defaultValue);
				}
			});

		return subject;
	};
}

export function writableIDBStringSubject() {
	return (
		key: string,
		defaultValue: string,
		persistenceBehavior?: BehaviorSubject<boolean>,
		onLoaded?: (item: string) => void
	) => {
		const subject = writableSubject<string>(defaultValue);
		let persist = true;

		if (persistenceBehavior) {
			persistenceBehavior.subscribe((shallPersist) => (persist = shallPersist));
		}

		let legacyData: string | undefined;
		try {
			const rawLegacy = window.localStorage.getItem(key);
			if (rawLegacy !== null) {
				legacyData = rawLegacy;
			}
		} catch (_) {
		}

		getIDBItem<string>(key)
			.then((stored) => {
				const isStoredEmpty = stored === undefined || stored === '';
				const dataToLoad = !isStoredEmpty ? stored : legacyData;

				if (dataToLoad !== undefined) {
					const current = subject.getValue();
					if (!current || current === defaultValue) {
						subject.next(dataToLoad);
					} else {
						subject.next(dataToLoad + '\n' + current);
					}
					onLoaded?.(dataToLoad);
				} else {
					onLoaded?.(defaultValue);
				}

				if (legacyData !== undefined && stored === undefined) {
					setIDBItem(key, legacyData).then(() => {
						window.localStorage.removeItem(key);
					}).catch(console.error);
				} else if (legacyData !== undefined && stored !== undefined) {
					window.localStorage.removeItem(key);
				}
			})
			.catch((error) => {
				console.error(`Error hydrating ${key} from IndexedDB:`, error);
				if (legacyData !== undefined && legacyData !== '' && isStoredEmpty) {
					const current = subject.getValue();
					if (!current || current === defaultValue) {
						subject.next(legacyData);
					} else {
						subject.next(legacyData + '\n' + current);
					}
					onLoaded?.(legacyData);
				} else {
					onLoaded?.(defaultValue);
				}
			});

		subject
			.pipe(skip(1), debounceTime(150))
			.subscribe((updatedValue) => {
				if (persist) {
					setIDBItem(key, updatedValue ?? defaultValue);
				}
			});

		return subject;
	};
}
