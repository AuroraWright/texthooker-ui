import type { LineItem } from '../types';

const isNotJapaneseRegex = /[^0-9A-Z○◯々-〇〻ぁ-ゖゝ-ゞァ-ヺー０-９Ａ-Ｚｦ-ﾝ\p{Radical}\p{Unified_Ideograph}]+/gimu;
const characterCounts = new WeakMap<LineItem, { text: string; count: number }>();

function countCharacters(text: string) {
	let count = 0;
	for (const _ of text.replace(isNotJapaneseRegex, '')) count += 1;
	return count;
}

export function cacheLineCharacterCounts(lines: LineItem[]) {
	for (const line of lines) {
		cacheLineCharacterCount(line);
	}
}

export function cacheLineCharacterCount(line: LineItem): LineItem {
	const cached = characterCounts.get(line);
	if (!cached || cached.text !== line.text) {
		characterCounts.set(line, { text: line.text, count: countCharacters(line.text) });
	}
	return line;
}

export function countLineCharacters(line: LineItem) {
	const cached = characterCounts.get(line);
	return cached?.text === line.text ? cached.count : countCharacters(line.text);
}
