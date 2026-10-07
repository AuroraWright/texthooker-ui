import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect, type Page } from '@playwright/test';

const lines = (page: Page) => page.locator('main p[data-line-id]');
const setting = (page: Page, label: string) =>
	page.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]');
async function paste(page: Page, text: string) {
	await page.evaluate((text) => {
		const data = new DataTransfer();
		data.setData('text/plain', text);
		document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
	}, text);
}
async function toolbar(page: Page, title: string) {
	await page.getByTitle(title, { exact: true }).locator('svg').click();
}
async function openSettings(page: Page) {
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await expect(page.getByText('Font Size', { exact: true })).toBeVisible();
}
async function closeSettings(page: Page) {
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await expect(page.getByText('Font Size', { exact: true })).toBeHidden();
}
async function storedLines(page: Page) {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open('bannou-texthooker', 1);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		const data = await new Promise<any[]>((resolve, reject) => {
			const req = db.transaction('data').objectStore('data').get('bannou-texthooker-lineData');
			req.onsuccess = () => resolve(req.result || []);
			req.onerror = () => reject(req.error);
		});
		db.close();
		return data;
	});
}

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		const settings = {
			websocketUrl: '',
			enablePaste: '1',
			allowPasteDuringPause: '1',
			allowNewLineDuringPause: '1',
			flashOnMissedLine: '0',
		};
		for (const [key, value] of Object.entries(settings)) {
			const name = `bannou-texthooker-${key}`;
			if (localStorage.getItem(name) === null) localStorage.setItem(name, value);
		}
	});
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error' && !message.text().includes('net::ERR')) errors.push(message.text());
		if (message.type() === 'warning' && message.text().includes('svelte')) errors.push(message.text());
	});
	(page as any).runtimeErrors = errors;
});

test.afterEach(async ({ page }) => {
	expect((page as any).runtimeErrors).toEqual([]);
});

test('paste, edit, delete, undo and selection preserve text and statistics', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('header')).toBeVisible();
	await paste(page, '日本語の文章です。');
	await expect(lines(page)).toHaveText(['日本語の文章です。']);
	await paste(page, '次の文章です。');
	await expect(lines(page)).toHaveCount(2);
	await expect(page.locator('.timer')).toContainText('/ 2');
	await lines(page).last().dblclick();
	await expect(lines(page).last()).toHaveAttribute('contenteditable', 'true');
	await lines(page).last().fill('編集した文章。');
	await page.locator('main').click({ position: { x: 10, y: 10 } });
	await expect(lines(page).last()).toHaveText('編集した文章。');
	await toolbar(page, 'Undo last Action');
	await expect(lines(page).last()).toHaveText('次の文章です。');
	await toolbar(page, 'Delete last Line');
	await expect(lines(page)).toHaveCount(1);
	await toolbar(page, 'Undo last Action');
	await expect(lines(page)).toHaveCount(2);
	await lines(page)
		.first()
		.dblclick({ modifiers: ['Meta'] });
	await toolbar(page, 'Remove selected Lines');
	await expect(lines(page)).toHaveText(['次の文章です。']);
	await toolbar(page, 'Undo last Action');
	await expect(lines(page)).toHaveCount(2);
});

test('smooth scroll targets survive hiding the tab and resume unless manually cancelled', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('bannou-texthooker-enableLineAnimation', '1');
		localStorage.setItem('bannou-texthooker-lineData', JSON.stringify(
			Array.from({ length: 100 }, (_, index) => ({ id: `stored-${index}`, text: '保存された文章。' })),
		));
	});
	await page.goto('/');
	await expect(lines(page).last()).toHaveAttribute('data-line-id', 'stored-99');
	await page.waitForTimeout(250);
	await page.evaluate(() => {
		const scroller = document.querySelector<HTMLElement>('[aria-label="Text history"]')!;
		let visibility: DocumentVisibilityState = 'visible';
		Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
		(window as any).setTabVisibility = (value: DocumentVisibilityState) => {
			visibility = value;
			document.dispatchEvent(new Event('visibilitychange'));
		};
		(window as any).scrollRequests = [];
		// Model a browser suspending a smooth scroll when the tab becomes hidden.
		scroller.scrollTo = ((options: ScrollToOptions) => {
			(window as any).scrollRequests.push(options);
			(window as any).setTabVisibility('hidden');
		}) as typeof scroller.scrollTo;
	});
	await paste(page, '新しい文章。');
	await expect.poll(() => page.evaluate(() => (window as any).scrollRequests.length)).toBeGreaterThan(0);
	await page.waitForTimeout(200);
	const beforeResume = await page.evaluate(() => (window as any).scrollRequests.length);
	await page.evaluate(() => (window as any).setTabVisibility('visible'));
	await expect.poll(() => page.evaluate(() => (window as any).scrollRequests.length)).toBeGreaterThan(beforeResume);
	expect(await page.evaluate(() => (window as any).scrollRequests.at(-1).behavior)).toBe('smooth');
	await page.locator('[aria-label="Text history"]').dispatchEvent('wheel');
	const beforeCancelledResume = await page.evaluate(() => (window as any).scrollRequests.length);
	await page.evaluate(() => (window as any).setTabVisibility('visible'));
	await page.waitForTimeout(200);
	expect(await page.evaluate(() => (window as any).scrollRequests.length)).toBe(beforeCancelledResume);
});

for (const vertical of [false, true]) {
	test(`new lines animate in ${vertical ? 'vertical' : 'horizontal'} mode`, async ({ page }) => {
		await page.addInitScript(({ vertical }) => {
			localStorage.setItem('bannou-texthooker-enableLineAnimation', '1');
			localStorage.setItem('bannou-texthooker-displayVertical', vertical ? '1' : '0');
			(window as any).lineAnimations = [];
			const animate = Element.prototype.animate;
			Element.prototype.animate = function (keyframes, options) {
				if (this.matches('main p[data-line-id]') && typeof options === 'object' && Number(options.duration) > 0) {
					(window as any).lineAnimations.push(this.textContent);
				}
				return animate.call(this, keyframes, options);
			};
		}, { vertical });
		await page.goto('/');
		await expect(page.locator('header')).toBeVisible();
		await paste(page, '動く文章。');
		await expect.poll(() => page.evaluate(() => (window as any).lineAnimations)).toContain('動く文章。');
		await expect.poll(async () => (await storedLines(page)).length).toBe(1);
		await page.reload();
		await expect(lines(page)).toHaveText(['動く文章。']);
		await expect(page.evaluate(() => (window as any).lineAnimations)).resolves.toEqual([]);
		await openSettings(page);
		await setting(page, 'Enable Line Animation').uncheck();
		await closeSettings(page);
		await paste(page, '動かない文章。');
		await expect(lines(page)).toHaveCount(2);
		await expect(page.evaluate(() => (window as any).lineAnimations)).resolves.toEqual([]);
	});
}

test('settings reflow text, reverse order, and persist across reloads', async ({ page }) => {
	await page.goto('/');
	await paste(page, '最初の文章。');
	await paste(page, '最後の文章。');
	await expect(lines(page)).toHaveCount(2);
	await openSettings(page);
	await setting(page, 'Font Size').fill('32');
	await setting(page, 'Line Padding').fill('0.5');
	await setting(page, 'Reverse Line Order').check();
	await setting(page, 'Display Text vertically').check();
	await setting(page, 'Window Title').fill('読書');
	await closeSettings(page);
	await expect(page.locator('main')).toHaveCSS('writing-mode', 'vertical-rl');
	await expect(page.locator('main')).toHaveCSS('font-size', '32px');
	await expect(lines(page).first()).toHaveText('最後の文章。');
	await expect(page).toHaveTitle('読書');
	await expect.poll(async () => (await storedLines(page)).length).toBe(2);
	await page.reload();
	await expect(lines(page)).toHaveCount(2);
	await expect(lines(page).first()).toHaveText('最後の文章。');
	await expect(page.locator('main')).toHaveCSS('writing-mode', 'vertical-rl');
	await expect(page.locator('main')).toHaveCSS('font-size', '32px');
});

test('live settings switch paste intake and rebuild duplicate filtering after hydration', async ({ page }) => {
	await page.goto('/');
	await paste(page, '保存された文章。');
	await expect.poll(async () => (await storedLines(page)).length).toBe(1);
	await openSettings(page);
	await setting(page, 'Prevent Global Duplicate').check();
	await setting(page, 'Enable Paste').uncheck();
	await closeSettings(page);
	await paste(page, '無視する文章。');
	await expect(lines(page)).toHaveText(['保存された文章。']);
	await openSettings(page);
	await setting(page, 'Enable Paste').check();
	await closeSettings(page);
	await page.reload();
	await expect(lines(page)).toHaveText(['保存された文章。']);
	await paste(page, '保存された文章。');
	await paste(page, '新しい文章。');
	await expect(lines(page)).toHaveText(['保存された文章。', '新しい文章。']);
});

test('persistence toggles gate timer and history writes without clearing canceled data', async ({ page }) => {
	await page.goto('/');
	await paste(page, '保存する文章。');
	await expect.poll(async () => (await storedLines(page)).length).toBe(1);
	await openSettings(page);
	const setTimer = async (time: string) => {
		await page.getByRole('button', { name: 'Set Timer', exact: true }).click();
		await page.locator('.alert input').fill(time);
		await page.getByRole('button', { name: 'Confirm', exact: true }).click();
	};
	const savedTime = () => page.evaluate(() => localStorage.getItem('bannou-texthooker-timeValue'));
	await setTimer('00:01:30');
	await expect.poll(savedTime).toBe('90');
	await setting(page, 'Store Stats persistently').uncheck();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await setTimer('00:02:00');
	await expect(page.locator('.timer')).toContainText('00:02:00');
	expect(await savedTime()).toBe('90');
	await setting(page, 'Store Lines persistently').uncheck();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await closeSettings(page);
	await paste(page, '一時的な文章。');
	await expect(lines(page)).toHaveCount(2);
	// Allow the history persistence debounce to finish before checking the disabled write.
	await page.waitForTimeout(250);
	expect((await storedLines(page)).length).toBe(1);
	await openSettings(page);
	await setting(page, 'Store Stats persistently').check();
	await setting(page, 'Store Lines persistently').check();
	expect(await savedTime()).toBe('90');
	await setTimer('00:03:00');
	await expect.poll(savedTime).toBe('180');
	await closeSettings(page);
	await paste(page, '再び保存する文章。');
	await expect.poll(async () => (await storedLines(page)).length).toBe(3);
	await page.reload();
	await expect(lines(page)).toHaveCount(3);
	await expect(page.locator('.timer')).toContainText('00:03:00');
});

test('notes, timer and confirmation dialogs work', async ({ page }) => {
	await page.goto('/');
	await toolbar(page, 'Open Notes');
	await page.locator('textarea').fill('保存するメモ');
	await page.getByRole('button', { name: 'Close notes' }).click();
	await toolbar(page, 'Continue');
	await expect(page.locator('.timer')).not.toContainText('00:00:00');
	await toolbar(page, 'Pause');
	await openSettings(page);
	await page.getByRole('button', { name: 'Set Timer', exact: true }).click();
	await page.locator('.alert input').fill('00:01:30');
	await page.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(page.locator('.timer')).toContainText('00:01:30');
	await page.getByRole('button', { name: 'Reset Timer', exact: true }).click();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.locator('.timer')).toContainText('00:01:30');
	await closeSettings(page);
	await page.reload();
	await toolbar(page, 'Open Notes');
	await expect(page.locator('textarea')).toHaveValue('保存するメモ');
});

test('rune dialog queue preserves order, callbacks and connection-error deduplication', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('header')).toBeVisible();
	await page.evaluate(async () => {
		const mainUrl = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src;
		const { dialogState } = await import(new URL('./stores/dialog-state.svelte.ts', mainUrl).href);
		(window as any).dialogResults = [];
		dialogState.open({ message: 'First request', callback: (result: any) => (window as any).dialogResults.push(result.canceled) });
		dialogState.open({ askForData: 'text', dataValue: 'Initial value', callback: (result: any) => (window as any).dialogResults.push(result.data) });
		dialogState.open({ message: 'Lost Connection to primary Websocket', showCancel: false });
		dialogState.open({ message: 'Lost Connection to primary Websocket', showCancel: false });
	});
	await expect(page.locator('.alert')).toContainText('First request');
	await paste(page, 'ダイアログ中は受け取らない文章。');
	await expect(lines(page)).toHaveCount(0);
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.locator('.alert input')).toHaveValue('Initial value');
	await page.locator('.alert input').fill('Entered value');
	await page.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(page.locator('.alert')).toContainText('Lost Connection to primary Websocket');
	await page.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(page.locator('.alert')).toHaveCount(0);
	expect(await page.evaluate(() => (window as any).dialogResults)).toEqual([true, 'Entered value']);
	await paste(page, 'ダイアログ終了後の文章。');
	await expect(lines(page)).toHaveCount(1);
});

test('global duplicate lookup survives removing one of several matching lines', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('bannou-texthooker-preventGlobalDuplicate', '1');
		localStorage.setItem('bannou-texthooker-lineData', JSON.stringify([
			{ id: 'same-1', text: '同じ文章。' }, { id: 'same-2', text: '同じ文章。' },
		]));
	});
	await page.goto('/');
	await expect(lines(page)).toHaveCount(2);
	await toolbar(page, 'Delete last Line');
	await paste(page, '同じ文章。');
	await expect(lines(page)).toHaveCount(1);
	await lines(page).last().dblclick();
	await lines(page).last().fill('編集した文章。');
	await page.locator('main').click({ position: { x: 10, y: 10 } });
	await toolbar(page, 'Undo last Action');
	await expect(lines(page)).toHaveText(['同じ文章。']);
	await paste(page, '同じ文章。');
	await expect(lines(page)).toHaveCount(1);
});

test('raw history edits and persisted undo survive reloads', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('bannou-texthooker-persistActionHistory', '1'));
	await page.goto('/');
	await paste(page, '元の文章。');
	await lines(page).last().dblclick();
	await lines(page).last().fill('編集した文章。');
	await page.locator('main').click({ position: { x: 10, y: 10 } });
	await expect.poll(async () => (await storedLines(page))[0]?.text).toBe('編集した文章。');
	await page.reload();
	await expect(lines(page)).toHaveText(['編集した文章。']);
	await toolbar(page, 'Undo last Action');
	await expect(lines(page)).toHaveText(['元の文章。']);
	await expect.poll(async () => (await storedLines(page))[0]?.text).toBe('元の文章。');
	await page.reload();
	await expect(lines(page)).toHaveText(['元の文章。']);
});

test('legacy notes and lines replace empty IndexedDB values before legacy storage is removed', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('header')).toBeVisible();
	await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('bannou-texthooker', 1);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction('data', 'readwrite');
			transaction.objectStore('data').put('', 'bannou-texthooker-userNotes');
			transaction.objectStore('data').put([], 'bannou-texthooker-lineData');
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
		db.close();
		localStorage.setItem('bannou-texthooker-userNotes', '以前のメモ');
		localStorage.setItem('bannou-texthooker-lineData', JSON.stringify([{ id: 'legacy-line', text: '以前の文章。' }]));
	});
	await page.reload();
	await expect(lines(page)).toHaveText(['以前の文章。']);
	await toolbar(page, 'Open Notes');
	await expect(page.locator('textarea')).toHaveValue('以前のメモ');
	await expect.poll(() => page.evaluate(() => localStorage.getItem('bannou-texthooker-userNotes'))).toBeNull();
	await expect.poll(() => page.evaluate(() => localStorage.getItem('bannou-texthooker-lineData'))).toBeNull();
	await page.getByRole('button', { name: 'Close notes' }).click();
	await page.reload();
	await expect(lines(page)).toHaveText(['以前の文章。']);
	await toolbar(page, 'Open Notes');
	await expect(page.locator('textarea')).toHaveValue('以前のメモ');
});

test('reset callbacks preserve confirmation and distinguish lines from all data', async ({ page }) => {
	await page.goto('/');
	await paste(page, '最初の文章。');
	await openSettings(page);
	await page.getByRole('button', { name: 'Set Timer', exact: true }).click();
	await page.locator('.alert input').fill('00:01:30');
	await page.getByRole('button', { name: 'Confirm', exact: true }).click();
	await page.getByRole('button', { name: 'Reset Lines', exact: true }).click();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(lines(page)).toHaveCount(1);
	await page.getByRole('button', { name: 'Reset Lines', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(lines(page)).toHaveCount(0);
	await expect(page.locator('.timer')).toContainText('00:01:30');
	await closeSettings(page);
	await paste(page, '次の文章。');
	await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', altKey: true })));
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(lines(page)).toHaveCount(1);
	await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', altKey: true })));
	await page.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(lines(page)).toHaveCount(0);
	await expect(page.locator('.timer')).toContainText('00:00:00');
	await expect.poll(async () => (await storedLines(page)).length).toBe(0);
	expect(await page.evaluate(() => localStorage.getItem('bannou-texthooker-timeValue'))).toBeNull();
	await page.reload();
	await expect(lines(page)).toHaveCount(0);
	await expect(page.locator('.timer')).toContainText('00:00:00');
});

test('replacements can be created, toggled and applied to existing text', async ({ page }) => {
	await page.goto('/');
	await paste(page, '猫の文章。');
	await expect(lines(page)).toHaveCount(1);
	await openSettings(page);
	await page.getByText('Replacements', { exact: true }).click();
	await page.getByTitle('Add replacement', { exact: true }).click();
	await page.getByPlaceholder('text pattern', { exact: true }).fill('猫');
	await page.getByPlaceholder('replacement pattern', { exact: true }).fill('犬');
	await page.getByPlaceholder('test value', { exact: true }).fill('猫の文章。');
	await expect(page.getByText('犬の文章。', { exact: true })).toBeVisible();
	await page.getByPlaceholder('text pattern', { exact: true }).fill('[');
	await expect(page.getByText(/^Error: /)).toBeVisible();
	await page.getByPlaceholder('text pattern', { exact: true }).fill('猫');
	await expect(page.getByText('犬の文章。', { exact: true })).toBeVisible();
	await page.getByTitle('Save', { exact: true }).click();
	await page.locator('[data-id="猫"]').evaluate((node) => { (window as any).replacementRow = node; });
	await page.locator('[data-id="猫"] input[type=checkbox]').uncheck();
	await page.getByTitle('Enable all', { exact: true }).click();
	expect(await page.locator('[data-id="猫"]').evaluate((node) => node === (window as any).replacementRow)).toBe(true);
	await page.getByTitle('Apply to current lines', { exact: true }).click();
	await page.getByRole('button', { name: 'Confirm', exact: true }).click();
	await closeSettings(page);
	await expect(lines(page)).toHaveText(['犬の文章。']);
	await paste(page, '猫もいる。');
	await expect(lines(page).last()).toHaveText('犬もいる。');
	await expect
		.poll(async () => (await storedLines(page)).map((line) => line.text))
		.toEqual(['犬の文章。', '犬もいる。']);
});

test('replacement sorting and toggles update existing rows and persist', async ({ page }) => {
	await page.addInitScript(() => {
		const key = 'bannou-texthooker-replacements';
		if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(
			['猫', '犬', '鳥'].map((pattern) => ({ pattern, replaces: pattern, flags: [], enabled: true })),
		));
	});
	await page.goto('/');
	await openSettings(page);
	await page.getByText('Replacements', { exact: true }).click();
	const rows = page.locator('[data-id]');
	await page.locator('[data-id="犬"]').evaluate((node) => { (window as any).retainedReplacement = node; });
	await page.locator('[data-id="猫"]').dragTo(page.locator('[data-id="鳥"]'));
	await expect.poll(() => page.evaluate(() =>
		JSON.parse(localStorage.getItem('bannou-texthooker-replacements')!).map((entry: any) => entry.pattern)))
		.not.toEqual(['猫', '犬', '鳥']);
	const sortedOrder = await page.evaluate(() =>
		JSON.parse(localStorage.getItem('bannou-texthooker-replacements')!).map((entry: any) => entry.pattern));
	await expect.poll(() => rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id'))))
		.toEqual(sortedOrder);
	await page.getByTitle('Disable all', { exact: true }).click();
	await expect(page.locator('[data-id="犬"] input')).not.toBeChecked();
	expect(await page.locator('[data-id="犬"]').evaluate((node) => node === (window as any).retainedReplacement)).toBe(true);
	await page.locator('[data-id="犬"] input').check();
	await page.locator('[data-id="猫"]').getByTitle('Remove', { exact: true }).click();
	await page.reload();
	await openSettings(page);
	await page.getByText('Replacements', { exact: true }).click();
	await expect.poll(() => rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id'))))
		.toEqual(sortedOrder.filter((pattern: string) => pattern !== '猫'));
	await expect(page.locator('[data-id="犬"] input')).toBeChecked();
	await expect(page.locator('[data-id="鳥"] input')).not.toBeChecked();
});

for (const vertical of [false, true]) {
	test(`multiline scroll estimates stay stable in ${vertical ? 'vertical' : 'horizontal'} writing`, async ({ page }) => {
		await page.addInitScript((vertical) => {
			for (const [key, value] of Object.entries({
				displayVertical: vertical ? '1' : '0',
				preserveWhitespace: '1',
				enableLineAnimation: '0',
				characterMilestone: '0',
			})) localStorage.setItem(`bannou-texthooker-${key}`, value);
			localStorage.setItem('bannou-texthooker-lineData', JSON.stringify(
				Array.from({ length: 600 }, (_, index) => ({
					id: `multiline-${index}`,
					text: ('長い文章が複数行に折り返されます。'.repeat(12) + '\n').repeat(4),
				})),
			));
		}, vertical);
		await page.goto('/');
		await expect(lines(page).last()).toHaveAttribute('data-line-id', 'multiline-599');
		await page.waitForTimeout(250);
		const result = await page.getByRole('region', { name: 'Text history' }).evaluate(async (root, vertical) => {
			const extent = () => vertical ? root.scrollWidth : root.scrollHeight;
			const viewport = vertical ? root.clientWidth : root.clientHeight;
			const initial = extent();
			let maximumCorrection = 0;
			for (let step = 1; step <= 12; step++) {
				const target = (extent() - viewport) * step / 13;
				root.scrollTo(vertical ? { left: -target } : { top: target });
				await new Promise((resolve) => setTimeout(resolve, 75));
				const actual = vertical ? Math.abs(root.scrollLeft) : root.scrollTop;
				maximumCorrection = Math.max(maximumCorrection, Math.abs(target - actual));
			}
			return { extentChange: Math.abs(extent() / initial - 1), maximumCorrection };
		}, vertical);
		expect(result.extentChange).toBeLessThan(0.02);
		expect(result.maximumCorrection).toBeLessThan(2);
		expect(await lines(page).count()).toBeLessThan(50);
	});
}

test.describe('native scrollbar dragging', () => {
	for (const vertical of [false, true]) {
		test(`history-limit removals during dragging keep text visible (vertical=${vertical})`, async ({ page }) => {
			let socket: import('@playwright/test').WebSocketRoute;
			await page.routeWebSocket('ws://localhost:6677', (route) => { socket = route; });
			const text = '複数行になる日本語の文章。'.repeat(25);
			await page.addInitScript(({ vertical, text }) => {
				localStorage.setItem('bannou-texthooker-displayVertical', vertical ? '1' : '0');
				localStorage.setItem('bannou-texthooker-enableLineAnimation', '0');
				localStorage.setItem('bannou-texthooker-maxLines', '100');
				localStorage.setItem('bannou-texthooker-lineData', JSON.stringify(
					Array.from({ length: 100 }, (_, index) => ({ id: `limit-drag-${index}`, text })),
				));
			}, { vertical, text });
			await page.goto('/');
			await expect(page.getByTitle('Connected with ws://localhost:6677')).toBeVisible();
			await expect(page.locator('[data-line-id="limit-drag-99"]')).toBeInViewport();
			await page.addStyleTag({ content: `
				[aria-label="Text history"]::-webkit-scrollbar { width: 16px; height: 16px; }
				[aria-label="Text history"]::-webkit-scrollbar-thumb { background: gray; min-width: 24px; min-height: 24px; }
			` });
			await page.waitForTimeout(250);
			const root = page.getByRole('region', { name: 'Text history' });
			const initial = await root.evaluate((node, vertical) => {
				const rect = node.getBoundingClientRect();
				return { x: rect.x, y: rect.y, width: node.clientWidth, height: node.clientHeight,
					extent: vertical ? node.scrollWidth : node.scrollHeight,
					offset: vertical ? Math.abs(node.scrollLeft) : node.scrollTop };
			}, vertical);
			const viewport = vertical ? initial.width : initial.height;
			const thumb = Math.max(24, viewport * viewport / initial.extent);
			const axis = vertical ? initial.x : initial.y;
			const progress = initial.offset / (initial.extent - viewport);
			const start = axis + (vertical ? 1 - progress : progress) * (viewport - thumb) + thumb / 2;
			const cross = vertical ? initial.y + initial.height + 8 : initial.x + initial.width + 8;
			await page.mouse.move(vertical ? start : cross, vertical ? cross : start);
			await page.mouse.down();
			socket!.send(`${text}到着`);
			await expect(root.getByText(`${text}到着`, { exact: true })).toHaveCount(1);
			const visibleRows = () => root.evaluate((node, vertical) => {
				const viewport = node.getBoundingClientRect();
				return [...node.querySelectorAll('[data-line-id]')].some((row) => {
					const rect = row.getBoundingClientRect();
					return vertical ? rect.left < viewport.right && rect.right > viewport.left
						: rect.top < viewport.bottom && rect.bottom > viewport.top;
				});
			}, vertical);
			for (let step = 1; step <= 8; step++) {
				const position = start + (axis + viewport / 2 - start) * step / 8;
				await page.mouse.move(vertical ? position : cross, vertical ? cross : position);
				await page.waitForTimeout(25);
				expect(await visibleRows()).toBe(true);
				expect(await root.evaluate((node, vertical) => vertical ? node.scrollWidth : node.scrollHeight, vertical))
					.toBe(initial.extent);
			}
			await page.mouse.up();
			await page.waitForTimeout(150);
			expect(await visibleRows()).toBe(true);
			await expect.poll(async () => (await storedLines(page))[0]?.id).toBe('limit-drag-1');
			expect(await storedLines(page)).toHaveLength(100);
		});

		test(`keeps the thumb range fixed with changing multiline measurements (vertical=${vertical})`, async ({ page }) => {
			await page.addInitScript((vertical) => {
				localStorage.setItem('bannou-texthooker-displayVertical', vertical ? '1' : '0');
				localStorage.setItem('bannou-texthooker-enableLineAnimation', '0');
				// Deliberately make the representative sample underestimate the other rows.
				const sampled = new Set(Array.from({ length: 32 }, (_, i) => Math.floor(i * 599 / 31)));
				localStorage.setItem('bannou-texthooker-lineData', JSON.stringify(
					Array.from({ length: 600 }, (_, index) => ({
						id: `drag-${index}`,
						text: sampled.has(index) ? '短い文章。' : ('複数行になる長い文章。'.repeat(25) + '\n').repeat(3),
					})),
				));
			}, vertical);
			await page.goto('/');
			await expect(lines(page).last()).toHaveAttribute('data-line-id', 'drag-599');
			await page.addStyleTag({ content: `
				[aria-label="Text history"]::-webkit-scrollbar { width: 16px; height: 16px; }
				[aria-label="Text history"]::-webkit-scrollbar-thumb { background: gray; min-width: 24px; min-height: 24px; }
			` });
			await page.waitForTimeout(250);
			const root = page.getByRole('region', { name: 'Text history' });
			const initial = await root.evaluate((node, vertical) => {
				const rect = node.getBoundingClientRect();
				return { x: rect.x, y: rect.y, width: node.clientWidth, height: node.clientHeight,
					extent: vertical ? node.scrollWidth : node.scrollHeight,
					offset: vertical ? Math.abs(node.scrollLeft) : node.scrollTop };
			}, vertical);
			const viewport = vertical ? initial.width : initial.height;
			const thumb = Math.max(24, viewport * viewport / initial.extent);
			const axis = vertical ? initial.x : initial.y;
			const progress = initial.offset / (initial.extent - viewport);
			const start = axis + (vertical ? 1 - progress : progress) * (viewport - thumb) + thumb / 2;
			const cross = vertical ? initial.y + initial.height + 8 : initial.x + initial.width + 8;
			await page.mouse.move(vertical ? start : cross, vertical ? cross : start);
			await page.mouse.down();
			const end = axis + (vertical ? viewport - thumb / 2 - 20 : thumb / 2 + 20);
			for (let step = 1; step <= 12; step++) {
				const position = start + (end - start) * step / 12;
				await page.mouse.move(vertical ? position : cross, vertical ? cross : position);
				await page.waitForTimeout(75);
				const state = await root.evaluate((node, vertical) => {
					const viewport = node.getBoundingClientRect();
					return { extent: vertical ? node.scrollWidth : node.scrollHeight,
						visible: [...node.querySelectorAll('[data-line-id]')].some((row) => {
							const rect = row.getBoundingClientRect();
							return vertical ? rect.left < viewport.right && rect.right > viewport.left
								: rect.top < viewport.bottom && rect.bottom > viewport.top;
						}) };
				}, vertical);
				expect(state.extent).toBe(initial.extent);
				expect(state.visible).toBe(true);
			}
			const offset = await root.evaluate((node, vertical) => vertical ? Math.abs(node.scrollLeft) : node.scrollTop, vertical);
			expect(Math.abs(offset - initial.offset)).toBeGreaterThan(initial.extent / 2);
			const anchor = await root.evaluate((node, vertical) => {
				const viewport = node.getBoundingClientRect();
				const center = vertical ? (viewport.left + viewport.right) / 2 : (viewport.top + viewport.bottom) / 2;
				for (const row of node.querySelectorAll<HTMLElement>('[data-line-id]')) {
					const rect = row.getBoundingClientRect();
					if (vertical ? rect.left <= center && rect.right >= center : rect.top <= center && rect.bottom >= center)
						return { id: row.dataset.lineId, position: vertical ? rect.left : rect.top };
				}
			}, vertical);
			expect(anchor).toBeDefined();
			await page.mouse.up();
			await expect.poll(() => root.evaluate((node, vertical) => vertical ? node.scrollWidth : node.scrollHeight, vertical))
				.not.toBe(initial.extent);
			await expect.poll(async () => {
				const rect = await page.locator(`[data-line-id="${anchor.id}"]`).boundingBox();
				return rect ? Math.abs((vertical ? rect.x : rect.y) - anchor.position) : Infinity;
			}).toBeLessThan(2);
		});
	}
});

for (const vertical of [false, true]) {
	test(`header is flush with the scroller and leaves the native scrollbar usable (vertical=${vertical})`, async ({ page }) => {
		await page.addInitScript((vertical) => {
			localStorage.setItem('bannou-texthooker-displayVertical', vertical ? '1' : '0');
			localStorage.setItem('bannou-texthooker-enableLineAnimation', '0');
			localStorage.setItem('bannou-texthooker-lineData', JSON.stringify(
				Array.from({ length: 300 }, (_, index) => ({ id: `header-${index}`, text: '複数行になる文章。'.repeat(30) })),
			));
		}, vertical);
		await page.goto('/');
		await expect(lines(page).last()).toHaveAttribute('data-line-id', 'header-299');
		await page.addStyleTag({ content: `
			[aria-label="Text history"]::-webkit-scrollbar { width: 16px; height: 16px; }
			[aria-label="Text history"]::-webkit-scrollbar-thumb { background: gray; min-width: 24px; min-height: 24px; }
		` });
		const root = page.getByRole('region', { name: 'Text history' });
		const header = page.locator('header');
		await root.evaluate((node, vertical) => node.scrollTo(vertical
			? { left: -(node.scrollWidth - node.clientWidth) / 2 }
			: { top: (node.scrollHeight - node.clientHeight) / 2 }), vertical);
		await page.waitForTimeout(200);
		const geometry = await root.evaluate((node, vertical) => {
			const rect = node.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: node.clientWidth, height: node.clientHeight,
				extent: vertical ? node.scrollWidth : node.scrollHeight,
				offset: vertical ? Math.abs(node.scrollLeft) : node.scrollTop };
		}, vertical);
		const initial = await header.boundingBox();
		expect(initial.y).toBe(0);
		expect(Math.abs(initial.x + initial.width - geometry.x - geometry.width)).toBeLessThan(1);
		const viewport = vertical ? geometry.width : geometry.height;
		const thumb = Math.max(24, viewport * viewport / geometry.extent);
		const progress = geometry.offset / (geometry.extent - viewport);
		const center = (vertical ? geometry.x : geometry.y)
			+ (vertical ? 1 - progress : progress) * (viewport - thumb) + thumb / 2;
		const x = vertical ? center : geometry.x + geometry.width + 8;
		const y = vertical ? geometry.y + geometry.height + 8 : center;
		expect(await root.evaluate((node, { x, y }) => document.elementFromPoint(x, y) === node, { x, y })).toBe(true);
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(vertical ? x + viewport / 5 : x, vertical ? y : y - viewport / 5, { steps: 10 });
		await page.waitForTimeout(100);
		await page.mouse.up();
		const after = await header.boundingBox();
		expect(Math.abs(after.x - initial.x)).toBeLessThan(1);
		expect(after.y).toBe(0);
		const offset = await root.evaluate((node, vertical) => vertical ? Math.abs(node.scrollLeft) : node.scrollTop, vertical);
		expect(Math.abs(offset - geometry.offset)).toBeGreaterThan(geometry.extent / 10);
		await openSettings(page);
		await expect(header.getByText('Font Size', { exact: true })).toBeVisible();
		await closeSettings(page);
		await page.setViewportSize({ width: 390, height: 720 });
		await expect.poll(async () => (await header.boundingBox()).x).toBeGreaterThanOrEqual(0);
		await openSettings(page);
		await closeSettings(page);
	});
}

for (const vertical of [false, true]) {
	for (const reversed of [false, true]) {
		test(`repeated multiline tail deletions preserve the viewing position (vertical=${vertical}, reversed=${reversed})`, async ({ page }) => {
			await page.addInitScript(({ vertical, reversed }) => {
				localStorage.setItem('bannou-texthooker-displayVertical', vertical ? '1' : '0');
				localStorage.setItem('bannou-texthooker-reverseLineOrder', reversed ? '1' : '0');
				localStorage.setItem('bannou-texthooker-enableLineAnimation', '0');
				localStorage.setItem('bannou-texthooker-lineData', JSON.stringify(
					Array.from({ length: 600 }, (_, index) => ({
						id: `delete-${index}`,
						text: ('長さの異なる文章が複数行に折り返されます。'.repeat(1 + index % 19) + '\n').repeat(1 + index % 3),
					})),
				));
			}, { vertical, reversed });
			await page.goto('/');
			const root = page.getByRole('region', { name: 'Text history' });
			await expect(page.locator('[data-line-id="delete-599"]')).toBeInViewport();
			for (let index = 598; index >= 587; index--) {
				await toolbar(page, 'Delete last Line');
				await expect(page.locator(`[data-line-id="delete-${index}"]`)).toBeInViewport();
				await expect.poll(() => root.evaluate((node, { vertical, reversed }) => {
					const offset = vertical ? Math.abs(node.scrollLeft) : node.scrollTop;
					const range = vertical ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
					return reversed ? offset : Math.abs(range - offset);
				}, { vertical, reversed })).toBeLessThan(2);
				await page.waitForTimeout(120);
			}
			await root.evaluate((node, vertical) => node.scrollTo(vertical
				? { left: -(node.scrollWidth - node.clientWidth) * 0.45 }
				: { top: (node.scrollHeight - node.clientHeight) * 0.45 }), vertical);
			await page.waitForTimeout(200);
			const anchor = await root.evaluate((node, vertical) => {
				const viewport = node.getBoundingClientRect();
				for (const row of node.querySelectorAll<HTMLElement>('[data-line-id]')) {
					const rect = row.getBoundingClientRect();
					if (vertical ? rect.left < viewport.right && rect.right > viewport.left : rect.top < viewport.bottom && rect.bottom > viewport.top)
						return { id: row.dataset.lineId, position: vertical ? rect.right : rect.top };
				}
			}, vertical);
			expect(anchor).toBeDefined();
			await toolbar(page, 'Delete last Line');
			await page.waitForTimeout(200);
			const rect = await page.locator(`[data-line-id="${anchor.id}"]`).boundingBox();
			expect(rect).not.toBeNull();
			expect(Math.abs((vertical ? rect.x + rect.width : rect.y) - anchor.position)).toBeLessThan(2);
		});
	}
}

test('large stored history remains virtualized and searchable in both writing modes', async ({ page }) => {
	await page.addInitScript(() => {
		if (localStorage.getItem('seeded-history')) return;
		localStorage.setItem('seeded-history', 'true');
		localStorage.setItem(
			'bannou-texthooker-lineData',
			JSON.stringify(
				Array.from({ length: 600 }, (_, i) => ({
					id: `line-${i}`,
					text: `文章${i}。` + '長い文章が複数行に折り返されます。'.repeat(8),
				})),
			),
		);
	});
	await page.goto('/');
	await expect(lines(page).last()).toContainText('文章599。');
	expect(await lines(page).count()).toBeLessThan(50);
	await page.keyboard.press('Control+f');
	await page.getByPlaceholder('Search text...').fill('文章250。');
	await expect(page.locator('main mark')).toHaveText('文章250。');
	await expect(page.locator('main mark')).toBeInViewport();
	await page.keyboard.press('Escape');
	await openSettings(page);
	await setting(page, 'Display Text vertically').check();
	await closeSettings(page);
	await page.keyboard.press('Control+f');
	await page.getByPlaceholder('Search text...').fill('文章10。');
	await expect(page.locator('main mark')).toHaveText('文章10。');
	await expect(page.locator('main mark')).toBeInViewport();
	await page.setViewportSize({ width: 800, height: 600 });
	await expect(page.locator('main mark')).toBeInViewport();
});

test('search navigation resets with the query and stays valid when results shrink', async ({ page }) => {
	await page.goto('/');
	await paste(page, '猫の文章。');
	await paste(page, '犬の文章。');
	await paste(page, 'もう一匹の猫。');
	await page.keyboard.press('Control+f');
	const search = page.getByPlaceholder('Search text...');
	const count = page.locator('.font-mono');
	await search.fill('猫');
	await expect(count).toHaveText('1 / 2');
	await page.getByRole('button', { name: 'Next match', exact: true }).click();
	await expect(count).toHaveText('2 / 2');
	await expect(page.locator('main mark.bg-amber-500')).toBeInViewport();
	await page.getByRole('button', { name: 'Previous match', exact: true }).click();
	await expect(count).toHaveText('1 / 2');
	await page.getByRole('button', { name: 'Next match', exact: true }).click();
	await search.fill('犬');
	await expect(count).toHaveText('1 / 1');
	await expect(page.locator('main mark.bg-amber-500')).toHaveText('犬');
	await search.fill('見つからない');
	await expect(count).toHaveText('0 / 0');
	await expect(page.getByRole('button', { name: 'Next match', exact: true })).toBeDisabled();
	await search.fill('猫');
	await expect(count).toHaveText('1 / 2');
	await page.getByRole('button', { name: 'Next match', exact: true }).click();
	await toolbar(page, 'Delete last Line');
	await expect(count).toHaveText('1 / 1');
	await expect(page.locator('main mark.bg-amber-500')).toHaveText('猫');
	await page.keyboard.press('Escape');
	await expect(page.locator('main mark')).toHaveCount(0);
});

test('primary and secondary websocket messages update the list', async ({ page }) => {
	let primary: import('@playwright/test').WebSocketRoute;
	let secondary: import('@playwright/test').WebSocketRoute;
	let replacement: import('@playwright/test').WebSocketRoute;
	await page.routeWebSocket('ws://localhost:6677', (socket) => {
		primary = socket;
	});
	await page.routeWebSocket('ws://localhost:6678', (socket) => {
		secondary = socket;
	});
	await page.routeWebSocket('ws://localhost:6679', (socket) => {
		replacement = socket;
	});
	await page.addInitScript(() =>
		localStorage.setItem('bannou-texthooker-secondary-websocketUrl', 'ws://localhost:6678'),
	);
	await page.goto('/');
	await expect(page.getByTitle('Connected with ws://localhost:6677')).toBeVisible();
	await expect(page.getByTitle('Connected with ws://localhost:6678')).toBeVisible();
	primary!.send('接続からの文章。');
	await expect(lines(page)).toHaveText(['接続からの文章。']);
	secondary!.send(JSON.stringify({ sentence: '二つ目の接続。' }));
	await expect(lines(page)).toHaveText(['接続からの文章。', '二つ目の接続。']);
	await page.getByTitle('Connected with ws://localhost:6677').locator('svg').click();
	await expect(page.getByTitle('Not Connected')).toBeVisible();
	await openSettings(page);
	await setting(page, 'Primary Websocket').fill('ws://localhost:6679');
	expect(await page.evaluate(() => localStorage.getItem('bannou-texthooker-websocketUrl'))).not.toBe('ws://localhost:6679');
	await setting(page, 'Primary Websocket').blur();
	await closeSettings(page);
	await expect(page.getByTitle('Connected with ws://localhost:6679')).toBeVisible();
	replacement!.send('変更後の接続。');
	await expect(lines(page)).toHaveText(['接続からの文章。', '二つ目の接続。', '変更後の接続。']);
	await openSettings(page);
	await setting(page, 'Secondary Websocket').fill('ws://localhost:6679');
	await setting(page, 'Secondary Websocket').blur();
	await expect(setting(page, 'Secondary Websocket')).toHaveValue('');
	expect(await setting(page, 'Secondary Websocket').evaluate((input: HTMLInputElement) => input.validationMessage))
		.toBe('Duplicate Websocket');
});

for (const vertical of [false, true]) {
	for (const reversed of [false, true]) {
		test(`rapid identical websocket lines retain spacing (vertical=${vertical}, reversed=${reversed})`, async ({ page }) => {
			let socket: import('@playwright/test').WebSocketRoute;
			await page.routeWebSocket('ws://localhost:6677', (route) => { socket = route; });
			await page.addInitScript(({ vertical, reversed }) => {
				localStorage.setItem('bannou-texthooker-displayVertical', vertical ? '1' : '0');
				localStorage.setItem('bannou-texthooker-reverseLineOrder', reversed ? '1' : '0');
				localStorage.setItem('bannou-texthooker-preventLastDuplicate', '0');
			}, { vertical, reversed });
			await page.goto('/');
			await expect(page.getByTitle('Connected with ws://localhost:6677')).toBeVisible();
			const text = '複数行に折り返される同じ文章。'.repeat(20);
			socket!.send(text);
			await expect(lines(page)).toHaveCount(1);
			await expect.poll(() => lines(page).first().evaluate((node, vertical) => {
				const box = node.getBoundingClientRect();
				return vertical ? box.width : box.height;
			}, vertical)).toBeGreaterThan(100);
			socket!.send(text);
			socket!.send(text);
			await expect(lines(page)).toHaveCount(3);
			await expect.poll(() => lines(page).evaluateAll((nodes, vertical) => {
				const boxes = nodes.map((node) => node.getBoundingClientRect())
					.sort((a, b) => vertical ? a.left - b.left : a.top - b.top);
				return boxes.every((box, i) => !i || (vertical
					? box.left >= boxes[i - 1].right
					: box.top >= boxes[i - 1].bottom));
			}, vertical)).toBe(true);
		});
	}
}

test('external clipboard intake and copy blocking preserve filtering', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('bannou-texthooker-enableExternalClipboardMonitor', '1');
		localStorage.setItem('bannou-texthooker-blockCopyOnPage', '1');
		localStorage.setItem('bannou-texthooker-enableExternalClipboardMonitor', '1');
	});
	await page.goto('/');
	await expect(page.locator('header')).toBeVisible();
	await page.evaluate(() => {
		const first = document.createElement('p');
		first.textContent = '外部の文章。';
		const second = document.createElement('p');
		second.textContent = '次の外部文章。';
		document.body.append(first, second);
	});
	await expect(lines(page)).toHaveText(['外部の文章。', '次の外部文章。']);
	await page.evaluate(() => {
		document.body.dispatchEvent(new ClipboardEvent('copy', { bubbles: true }));
		const copied = document.createElement('p');
		copied.textContent = 'ブロックされる文章。';
		document.body.append(copied);
	});
	await expect.poll(async () => (await storedLines(page)).length).toBe(2);
	await expect(page.locator('body > p')).toHaveCount(0);
});

test('preset save and restore retains bound settings and callbacks', async ({ page }) => {
	await page.goto('/');
	await openSettings(page);
	await setting(page, 'Font Size').fill('36');
	await page.getByText('Presets', { exact: true }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.locator('.alert input').fill('大きな文字');
	await page.getByRole('button', { name: 'Confirm', exact: true }).click();
	await setting(page, 'Font Size').fill('18');
	await page.getByRole('button', { name: 'Reload', exact: true }).click();
	await expect(setting(page, 'Font Size')).toHaveValue('36');
	await setting(page, 'Font Size').fill('40');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm', exact: true }).click();
	await setting(page, 'Font Size').fill('18');
	await page.getByRole('button', { name: 'Reload', exact: true }).click();
	await expect(setting(page, 'Font Size')).toHaveValue('40');
	await closeSettings(page);
	await page.reload();
	await expect(page.locator('main')).toHaveCSS('font-size', '40px');
});

test('settings and preset imports use shared actions and preserve the export format', async ({ page }) => {
	await page.goto('/');
	await openSettings(page);
	await setting(page, 'Font Size').fill('36');
	const downloaded = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Ex-/Import Settings', exact: true }).click();
	const download = await downloaded;
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
	const data = JSON.parse(Buffer.concat(chunks).toString());
	expect(data.currentSettings.fontSize$).toBe(36);
	expect(data.currentSettings.replacements$).toEqual([]);
	data.currentSettings.fontSize$ = 32;
	data.currentSettings.linePadding$ = 0.5;
	data.currentSettings.reverseLineOrder$ = true;
	data.lastSettingsPreset = '読み込んだ設定';
	await page.getByText('Replacements', { exact: true }).click();
	await page.getByTitle('Add replacement', { exact: true }).click();
	await page.getByPlaceholder('text pattern', { exact: true }).fill('未保存の置換');
	await page.locator('input[type=file]').nth(1).setInputFiles({
		name: 'texthooker-ui_settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
	});
	await expect(setting(page, 'Font Size')).toHaveValue('32');
	await expect(page.getByPlaceholder('text pattern', { exact: true })).toHaveCount(0);
	await expect(page.getByTitle('Add replacement', { exact: true })).toBeVisible();
	await expect(setting(page, 'Line Padding')).toHaveValue('0.5');
	await expect(setting(page, 'Reverse Line Order')).toBeChecked();
	expect(await page.evaluate(() => localStorage.getItem('bannou-texthooker-lastSettingPreset'))).toBe('読み込んだ設定');
	await page.locator('input[type=file]').nth(2).setInputFiles({
		name: 'texthooker-ui_preset.json', mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ name: '部分的な設定', settings: { fontSize$: 28, websocketUrl$: '' } })),
	});
	await expect(setting(page, 'Font Size')).toHaveValue('28');
	await expect(setting(page, 'Line Padding')).toHaveValue('1');
	await expect(setting(page, 'Reverse Line Order')).not.toBeChecked();
	expect(await page.evaluate(() => localStorage.getItem('bannou-texthooker-lastSettingPreset'))).toBe('部分的な設定');
	await closeSettings(page);
	await page.reload();
	await expect(page.locator('main')).toHaveCSS('font-size', '28px');
});

for (const [index, type] of ['data', 'settings', 'preset'].entries()) {
	test(`${type} import rejects wrong JSON types without changing existing state`, async ({ page }) => {
		await page.goto('/');
		await paste(page, '保存された文章。');
		await expect.poll(async () => (await storedLines(page)).length).toBe(1);
		await openSettings(page);
		const exports = [
			{ 'bannou-texthooker-timeValue': 90, 'bannou-texthooker-lineData': [{ id: 'new', text: '新しい文章。' }] },
			{ currentSettings: { fontSize$: 28, websocketUrl$: '' }, settingPresets: [{ name: 'Saved', settings: { fontSize$: 28 } }], lastSettingsPreset: 'Saved' },
			{ name: 'Imported', settings: { fontSize$: 32, websocketUrl$: '' } },
		];
		await page.locator('input[type=file]').nth(1).setInputFiles({
			name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exports[1])),
		});
		await expect(setting(page, 'Font Size')).toHaveValue('28');
		const snapshot = () => page.evaluate(() => Object.fromEntries(
			['fontSize', 'settingPresets', 'lastSettingPreset', 'timeValue'].map((key) => [key, localStorage.getItem(`bannou-texthooker-${key}`)]),
		));
		await expect.poll(async () => (await snapshot()).lastSettingPreset).toBe('Saved');
		const before = await snapshot();
		const beforeLines = await storedLines(page);
		const malformed = [
			{ ...exports[0], 'bannou-texthooker-lineData': [{ id: 'bad', text: 123 }] },
			{ ...exports[1], currentSettings: { fontSize$: 36 }, settingPresets: [{}] },
			{ name: 'Bad', settings: { fontSize$: '36' } },
		];
		for (const file of [...exports.filter((_, fileIndex) => fileIndex !== index), malformed[index], null]) {
			await page.locator('input[type=file]').nth(index).setInputFiles({
				name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)),
			});
			await expect(page.locator('.alert')).toContainText(`Invalid ${type} file`);
			await page.getByRole('button', { name: 'Confirm', exact: true }).click();
			await expect(page.locator('input[type=file]').nth(index)).toHaveValue('');
			expect(await snapshot()).toEqual(before);
			expect(await storedLines(page)).toEqual(beforeLines);
		}
		await page.locator('input[type=file]').nth(index).setInputFiles({
			name: 'import.JSON', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exports[index])),
		});
		if (index === 0) await expect.poll(async () => (await storedLines(page))[0]?.text).toBe('新しい文章。');
		else await expect(setting(page, 'Font Size')).toHaveValue(index === 1 ? '28' : '32');
	});
}

test('data export and import preserves the existing file format', async ({ page }) => {
	await page.goto('/');
	await paste(page, '書き出す文章。');
	await expect(lines(page)).toHaveCount(1);
	await openSettings(page);
	const downloaded = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Ex-/Import Data', exact: true }).click();
	const download = await downloaded;
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
	const data = JSON.parse(Buffer.concat(chunks).toString());
	expect(data['bannou-texthooker-lineData'][0].text).toBe('書き出す文章。');
	data['bannou-texthooker-lineData'] = [{ id: 'imported-line', text: '読み込んだ文章。' }];
	await page
		.locator('input[type=file]')
		.first()
		.setInputFiles({
			name: 'texthooker-ui_data.json',
			mimeType: 'application/json',
			buffer: Buffer.from(JSON.stringify(data)),
		});
	await closeSettings(page);
	await expect(lines(page)).toHaveText(['読み込んだ文章。']);
	await expect.poll(async () => (await storedLines(page))[0]?.text).toBe('読み込んだ文章。');
});

test('milestones, whitespace and maximum history size remain reactive', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('bannou-texthooker-characterMilestone', '5');
		localStorage.setItem('bannou-texthooker-maxLines', '2');
		localStorage.setItem('bannou-texthooker-preserveWhitespace', '1');
	});
	await page.goto('/');
	await paste(page, '日本語\n次の行');
	await expect(lines(page)).toHaveText(['日本語\n次の行']);
	await expect(page.locator('main .milestone')).toHaveText('Milestone 5 (6)');
	await paste(page, '追加文');
	await expect(lines(page)).toHaveCount(2);
	await paste(page, '最後文');
	await expect(lines(page)).toHaveText(['追加文', '最後文']);
	await expect(page.locator('.timer')).toContainText('6 / 2');
});

test('enabling statistics counts stored and newly appended lines after starting with statistics disabled', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('bannou-texthooker-showCharacterCount', '0');
		localStorage.setItem('bannou-texthooker-showSpeed', '0');
		localStorage.setItem('bannou-texthooker-lineData', JSON.stringify([
			{ id: 'stored-a', text: '日本語𠮷' }, { id: 'stored-b', text: '次の文' },
		]));
	});
	await page.goto('/');
	await expect(lines(page)).toHaveCount(2);
	await paste(page, '追加文');
	await expect(lines(page)).toHaveCount(3);
	await openSettings(page);
	await setting(page, 'Show Character Count').check();
	await closeSettings(page);
	await expect(page.locator('.timer')).toContainText('10 / 3');
	await paste(page, '最後文');
	await expect(page.locator('.timer')).toContainText('13 / 4');
});

for (const reversed of [false, true]) {
	test(`incremental duplicate counts survive history limits and prefix merging (reversed=${reversed})`, async ({ page }) => {
		await page.addInitScript((reversed) => {
			localStorage.setItem('bannou-texthooker-preventGlobalDuplicate', '1');
			localStorage.setItem('bannou-texthooker-maxLines', '3');
			localStorage.setItem('bannou-texthooker-mergeEqualLineStarts', '1');
			localStorage.setItem('bannou-texthooker-reverseLineOrder', reversed ? '1' : '0');
		}, reversed);
		await page.goto('/');
		for (const text of ['猫', '猫の文章', '犬', '鳥', '魚', '猫の文章', '魚']) await paste(page, text);
		await expect(lines(page)).toHaveText(reversed ? ['猫の文章', '魚', '鳥'] : ['鳥', '魚', '猫の文章']);
		await expect(page.locator('.timer')).toContainText('6 / 3');
		await expect.poll(async () => (await storedLines(page)).map((line) => line.text)).toEqual(['鳥', '魚', '猫の文章']);
	});
}

test('derived counts stay current with hidden totals, edits, undo and milestone toggles', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('bannou-texthooker-showCharacterCount', '0');
		localStorage.setItem('bannou-texthooker-showLineCount', '0');
		localStorage.setItem('bannou-texthooker-showTimer', '0');
		localStorage.setItem('bannou-texthooker-timeValue', '3600');
	});
	await page.goto('/');
	await paste(page, '日本語𠮷');
	await expect(page.locator('.timer')).toHaveText('(4/h)');
	await paste(page, '次の文');
	await expect(page.locator('.timer')).toHaveText('(7/h)');
	await lines(page).last().dblclick();
	await lines(page).last().fill('あいうえお');
	await page.locator('main').click({ position: { x: 10, y: 10 } });
	await expect(page.locator('.timer')).toHaveText('(9/h)');
	await toolbar(page, 'Undo last Action');
	await expect(page.locator('.timer')).toHaveText('(7/h)');
	await toolbar(page, 'Delete last Line');
	await expect(page.locator('.timer')).toHaveText('(4/h)');
	await toolbar(page, 'Undo last Action');
	await expect(page.locator('.timer')).toHaveText('(7/h)');
	await openSettings(page);
	await setting(page, 'Character Milestone').fill('5');
	await closeSettings(page);
	await expect(page.locator('main .milestone')).toHaveText('Milestone 5 (7)');
	await openSettings(page);
	await setting(page, 'Character Milestone').fill('0');
	await closeSettings(page);
	await expect(page.locator('main .milestone')).toHaveCount(0);
	await expect(page.locator('.timer')).toHaveText('(7/h)');
});

test('floating window stays synchronized and can be reopened', async ({ page, context }) => {
	await page.goto('/');
	await paste(page, '浮かぶ文章。');
	await expect(lines(page)).toHaveCount(1);
	const pipOpened = context.waitForEvent('page');
	await toolbar(page, 'Open Floating Window');
	const pip = await pipOpened;
	await expect(pip.locator('p[data-line-id]')).toHaveText(['浮かぶ文章。']);
	await paste(page, '次に浮かぶ文章。');
	await expect(pip.locator('p[data-line-id]')).toHaveText(['次に浮かぶ文章。']);
	await toolbar(page, 'Close Floating Window');
	await expect(page.getByTitle('Open Floating Window')).toBeVisible();
	const reopened = context.waitForEvent('page');
	await toolbar(page, 'Open Floating Window');
	const secondPip = await reopened;
	await expect(secondPip.locator('p[data-line-id]')).toHaveText(['次に浮かぶ文章。']);
	await toolbar(page, 'Close Floating Window');
});

test('AFK pause and blur still invoke the parent callback', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('bannou-texthooker-afkTimer', '1');
		localStorage.setItem('bannou-texthooker-enableAfkBlur', '1');
	});
	await page.goto('/');
	await toolbar(page, 'Continue');
	await expect(page.locator('body')).toHaveCSS('filter', 'blur(8px)', { timeout: 5000 });
	await page.locator('body').dispatchEvent('dblclick');
	await expect(page.locator('body')).toHaveCSS('filter', 'none');
	await expect(page.getByTitle('Continue', { exact: true })).toBeVisible();
	await openSettings(page);
	await setting(page, 'AFK Timer (s)').fill('0');
	await closeSettings(page);
	await toolbar(page, 'Continue');
	await page.waitForTimeout(1100);
	await expect(page.locator('body')).toHaveCSS('filter', 'none');
	await expect(page.getByTitle('Pause', { exact: true })).toBeVisible();
	await openSettings(page);
	await setting(page, 'AFK Timer (s)').fill('1');
	await closeSettings(page);
	await expect(page.locator('body')).toHaveCSS('filter', 'blur(8px)', { timeout: 5000 });
	await page.locator('body').dispatchEvent('dblclick');
});

test('native timer preserves AFK activity, adjustment, restart and disabling', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('bannou-texthooker-afkTimer', '3');
		localStorage.setItem('bannou-texthooker-adjustTimerOnAfk', '1');
		localStorage.setItem('bannou-texthooker-enableAfkBlur', '1');
		localStorage.setItem('bannou-texthooker-enableAfkBlurRestart', '1');
		localStorage.setItem('bannou-texthooker-timeValue', '10');
	});
	await page.clock.install();
	await page.goto('/');
	await toolbar(page, 'Continue');
	await page.clock.runFor(1000);
	await expect(page.locator('.timer')).toContainText('00:00:11');
	await paste(page, '活動中の文章。');
	await page.clock.runFor(2000);
	await expect(page.getByTitle('Pause', { exact: true })).toBeVisible();
	await page.clock.runFor(1000);
	await expect(page.getByTitle('Continue', { exact: true })).toBeVisible();
	await expect(page.locator('.timer')).toContainText('00:00:11');
	await page.locator('body').dispatchEvent('dblclick');
	await expect(page.getByTitle('Pause', { exact: true })).toBeVisible();
	await page.clock.runFor(1000);
	await expect(page.locator('.timer')).toContainText('00:00:12');
	await openSettings(page);
	await setting(page, 'AFK Timer (s)').fill('0');
	await closeSettings(page);
	await page.clock.runFor(4000);
	await expect(page.getByTitle('Pause', { exact: true })).toBeVisible();
	await expect(page.locator('.timer')).toContainText('00:00:16');
	await toolbar(page, 'Pause');
	await page.clock.runFor(2000);
	await expect(page.locator('.timer')).toContainText('00:00:16');
});

test('offline single-file build mounts and retains text interactions', async ({ page }) => {
	await page.goto(pathToFileURL(resolve('docs/index.html')).href);
	await expect(page.locator('header')).toBeVisible();
	await paste(page, 'オフラインでも読める文章。');
	await expect(lines(page)).toHaveText(['オフラインでも読める文章。']);
	await toolbar(page, 'Delete last Line');
	await expect(lines(page)).toHaveCount(0);
	await toolbar(page, 'Undo last Action');
	await expect(lines(page)).toHaveCount(1);
});

test('bootstrap flushes pending settings and stops persistence on teardown', async ({ page }) => {
	await page.clock.install();
	await page.goto('/');
	await expect(page.locator('header')).toBeVisible();
	await toolbar(page, 'Continue');
	await page.clock.runFor(1000);
	const saved = await page.evaluate(async () => {
		const mainUrl = (document.querySelector('script[src*="/src/main.ts"]') as HTMLScriptElement).src;
		const { default: app } = await import(mainUrl);
		const { settings } = await import(new URL('./stores/settings.svelte.ts', mainUrl).href);
		settings.windowTitle = 'Pending before teardown';
		await app.$destroy();
		const before = localStorage.getItem('bannou-texthooker-windowTitle');
		settings.windowTitle = 'Changed after teardown';
		await Promise.resolve();
		(window as any).timerAfterDestroy = () => settings.timeValue;
		return { before, after: localStorage.getItem('bannou-texthooker-windowTitle') };
	});
	expect(saved).toEqual({ before: 'Pending before teardown', after: 'Pending before teardown' });
	await expect(page.locator('header')).toHaveCount(0);
	const timeAfterDestroy = await page.evaluate(() => (window as any).timerAfterDestroy());
	await page.clock.runFor(3000);
	expect(await page.evaluate(() => (window as any).timerAfterDestroy())).toBe(timeAfterDestroy);
});

test('embeddable IIFE build mounts and tears down cleanly', async ({ page }) => {
	await page.route('**/embed-test', (route) =>
		route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
	);
	await page.goto('/embed-test');
	await page.evaluate(() => {
		localStorage.setItem('bannou-texthooker-blockCopyOnPage', '1');
		const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
		const add = EventTarget.prototype.addEventListener;
		const remove = EventTarget.prototype.removeEventListener;
		const tracked = (target: EventTarget, type: string) =>
			(target === document && ['paste', 'copy', 'visibilitychange'].includes(type)) ||
			(target === window && type === 'resize');
		EventTarget.prototype.addEventListener = function (type, listener, options) {
			if (listener && tracked(this, type)) {
				if (!listeners.has(type)) listeners.set(type, new Set());
				listeners.get(type)!.add(listener);
			}
			add.call(this, type, listener, options);
		};
		EventTarget.prototype.removeEventListener = function (type, listener, options) {
			if (listener && tracked(this, type)) listeners.get(type)?.delete(listener);
			remove.call(this, type, listener, options);
		};
		(window as any).streamListenerCounts = () =>
			Object.fromEntries(Array.from(listeners, ([type, active]) => [type, active.size]));
	});
	await page.addStyleTag({ path: resolve('texthooker-ui/texthooker-ui.css') });
	await page.addScriptTag({ path: resolve('texthooker-ui/texthooker-ui.iife.js') });
	await expect(page.locator('header')).toBeVisible();
	await paste(page, '埋め込みの文章。');
	await expect(lines(page)).toHaveText(['埋め込みの文章。']);
	await expect.poll(() => page.evaluate(() => (window as any).streamListenerCounts())).toEqual({
		paste: 1, copy: 1, visibilitychange: 2, resize: 1,
	});
	await page.evaluate(() => (window as any).texthooker.$destroy());
	await expect(page.locator('header')).toHaveCount(0);
	await expect(page.locator('main')).toHaveCount(0);
	await expect.poll(() => page.evaluate(() => (window as any).streamListenerCounts())).toEqual({
		paste: 0, copy: 0, visibilitychange: 0, resize: 0,
	});
	await page.evaluate(async () => {
		const paragraph = document.createElement('p');
		paragraph.id = 'after-teardown';
		paragraph.textContent = 'Clipboard monitor stopped';
		document.body.append(paragraph);
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	await expect(page.locator('#after-teardown')).toHaveText('Clipboard monitor stopped');
});
