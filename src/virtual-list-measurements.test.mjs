import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./virtual-list-measurements.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { VirtualListMeasurements } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

test('sparse offsets match a dense reference through measurements and structural edits', () => {
	const cache = new VirtualListMeasurements();
	let rows = Array(500).fill(undefined);
	let seed = 1729;
	const random = (limit) => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed % limit;
	};
	for (let step = 0; step < 2000; step++) {
		const index = random(rows.length);
		switch (random(6)) {
			case 0: {
				const size = 1 + random(400);
				cache.set(index, size);
				rows[index] = size;
				break;
			}
			case 1:
				cache.delete(index);
				rows[index] = undefined;
				break;
			case 2:
				cache.shift(3);
				rows.unshift(undefined, undefined, undefined);
				break;
			case 3: {
				const removed = [...new Set([index, random(rows.length), random(rows.length)])].sort((a, b) => b - a);
				cache.remove(removed);
				for (const position of removed) rows.splice(position, 1);
				break;
			}
			case 4: {
				const inserted = [index, index + 1];
				cache.insert(inserted);
				for (const position of inserted) rows.splice(position, 0, undefined);
				break;
			}
			case 5:
				cache.clear();
				rows.fill(undefined);
		}
		const estimate = 1 + random(100);
		let offset = 0;
		for (let i = 0; i <= rows.length; i++) {
			assert.equal(cache.offset(i, estimate), offset, `step ${step}, index ${i}`);
			if (i < rows.length) {
				assert.equal(cache.get(i), rows[i]);
				offset += rows[i] ?? estimate;
			}
		}
	}
});

test('prepending to a huge history retains measurements without materializing unmeasured rows', () => {
	const cache = new VirtualListMeasurements();
	cache.set(0, 30);
	cache.set(99999, 50);
	assert.equal(cache.offset(100000, 20), 2000040);
	cache.shift(10000);
	assert.equal(cache.get(10000), 30);
	assert.equal(cache.get(109999), 50);
	assert.equal(cache.offset(110000, 20), 2200040);
});

test('batched measurement deltas preserve offsets after a whole history has been measured', () => {
	const cache = new VirtualListMeasurements();
	const count = 100000;
	for (let i = 0; i < count; i++) cache.set(i, 40);
	assert.equal(cache.offset(count, 20), count * 40);
	for (let i = 1; i <= 200; i++) {
		cache.shift(1);
		cache.set(0, 50);
		assert.equal(cache.offset(count + i, 20), count * 40 + i * 50);
	}
	cache.delete(1000);
	assert.equal(cache.offset(count + 200, 20), count * 40 + 200 * 50 - 20);
	cache.set(1000, 40);
	assert.equal(cache.offset(count + 200, 30), count * 40 + 200 * 50);
});
