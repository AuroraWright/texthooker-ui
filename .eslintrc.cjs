module.exports = {
	root: true,
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:svelte/recommended', 'prettier'],
	parser: '@typescript-eslint/parser',
	parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
	overrides: [{
		files: ['*.svelte'],
		parser: 'svelte-eslint-parser',
		parserOptions: { parser: '@typescript-eslint/parser' },
	}],
	env: { browser: true, es2022: true, node: true },
};
