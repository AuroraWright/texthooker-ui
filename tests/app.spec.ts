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

test('replacements can be created, toggled and applied to existing text', async ({ page }) => {
	await page.goto('/');
	await paste(page, '猫の文章。');
	await expect(lines(page)).toHaveCount(1);
	await openSettings(page);
	await page.getByText('Replacements', { exact: true }).click();
	await page.getByTitle('Add replacement', { exact: true }).click();
	await page.getByPlaceholder('text pattern', { exact: true }).fill('猫');
	await page.getByPlaceholder('replacement pattern', { exact: true }).fill('犬');
	await page.getByTitle('Save', { exact: true }).click();
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

test('search navigation resets when the query changes', async ({ page }) => {
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
	await page.keyboard.press('Escape');
	await expect(page.locator('main mark')).toHaveCount(0);
});

test('primary and secondary websocket messages update the list', async ({ page }) => {
	let primary: import('@playwright/test').WebSocketRoute;
	let secondary: import('@playwright/test').WebSocketRoute;
	await page.routeWebSocket('ws://localhost:6677', (socket) => {
		primary = socket;
	});
	await page.routeWebSocket('ws://localhost:6678', (socket) => {
		secondary = socket;
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
});

test('external clipboard intake and copy blocking preserve filtering', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('bannou-texthooker-enableExternalClipboardMonitor', '1');
		localStorage.setItem('bannou-texthooker-blockCopyOnPage', '1');
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
	await closeSettings(page);
	await page.reload();
	await expect(page.locator('main')).toHaveCSS('font-size', '36px');
});

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

test('embeddable IIFE build mounts and tears down cleanly', async ({ page }) => {
	await page.route('**/embed-test', (route) =>
		route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
	);
	await page.goto('/embed-test');
	await page.addStyleTag({ path: resolve('texthooker-ui/texthooker-ui.css') });
	await page.addScriptTag({ path: resolve('texthooker-ui/texthooker-ui.iife.js') });
	await expect(page.locator('header')).toBeVisible();
	await paste(page, '埋め込みの文章。');
	await expect(lines(page)).toHaveText(['埋め込みの文章。']);
	await page.evaluate(() => (window as any).texthooker.$destroy());
	await expect(page.locator('header')).toHaveCount(0);
	await expect(page.locator('main')).toHaveCount(0);
});
