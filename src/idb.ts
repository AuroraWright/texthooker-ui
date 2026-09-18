const DB_NAME = 'bannou-texthooker';
const DB_VERSION = 1;
const STORE_NAME = 'data';

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
	if (!dbPromise) {
		dbPromise = new Promise((resolve, reject) => {
			if (typeof window === 'undefined' || !('indexedDB' in window)) {
				return reject(new Error('IndexedDB is not supported in this environment'));
			}
			try {
				const request = indexedDB.open(DB_NAME, DB_VERSION);
				request.onupgradeneeded = () => {
					const db = request.result;
					if (!db.objectStoreNames.contains(STORE_NAME)) {
						db.createObjectStore(STORE_NAME);
					}
				};
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => {
					dbPromise = null;
					reject(request.error);
				};
			} catch (error) {
				dbPromise = null;
				reject(error);
			}
		});
	}
	return dbPromise;
}

export async function getIDBItem<T>(key: string): Promise<T | undefined> {
	try {
		const db = await getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readonly');
			const store = tx.objectStore(STORE_NAME);
			const req = store.get(key);
			req.onsuccess = () => resolve(req.result as T | undefined);
			req.onerror = () => reject(req.error);
		});
	} catch (error) {
		console.error(`Failed to get "${key}" from IndexedDB:`, error);
		return undefined;
	}
}

export async function setIDBItem<T>(key: string, value: T): Promise<void> {
	try {
		const db = await getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			store.put(value, key);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	} catch (error) {
		console.error(`Failed to set "${key}" in IndexedDB:`, error);
	}
}

export async function removeIDBItem(key: string): Promise<void> {
	try {
		const db = await getDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			store.delete(key);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	} catch (error) {
		console.error(`Failed to remove "${key}" from IndexedDB:`, error);
	}
}
