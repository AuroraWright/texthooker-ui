import { defineConfig } from 'vite';
import { setDefaultResultOrder } from 'dns';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

const nodeVersion = Number.parseInt(process.versions.node.match(/^(\d+)\./)?.[1] || '17', 10);

if (nodeVersion < 17) {
	setDefaultResultOrder('verbatim');
}

export default defineConfig({
	plugins: [svelte(), viteSingleFile()],
	base: '/texthooker-ui',
	build: {
		copyPublicDir: false,
		emptyOutDir: true,
		outDir: './docs',
	},
});
