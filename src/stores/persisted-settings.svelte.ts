import { untrack } from 'svelte';

type SettingValue = string | number | boolean;

export function readSetting<T extends SettingValue>(key: string, defaultValue: T): T {
	const stored = window.localStorage.getItem(key);
	// An empty string is a deliberate value for text settings, e.g. a cleared WebSocket URL.
	if (stored === null || (stored === '' && typeof defaultValue !== 'string')) return defaultValue;
	return (typeof defaultValue === 'boolean' ? !!+stored : typeof defaultValue === 'number' ? +stored : stored) as T;
}

export function persistSetting<T extends SettingValue>(
	key: string,
	read: () => T,
	defaultValue: T,
	persist?: () => boolean,
) {
	let previous = untrack(read);
	$effect(() => {
		const value = read();
		if (Object.is(value, previous)) return;
		previous = value;
		untrack(() => {
			if (!persist || persist()) {
				const storedValue = value ?? defaultValue;
				window.localStorage.setItem(
					key,
					typeof storedValue === 'boolean' ? (storedValue ? '1' : '0') : String(storedValue),
				);
			}
		});
	});
}
