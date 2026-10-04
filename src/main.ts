import './app.css';

import { flushSync, mount, unmount } from 'svelte';

import App from './components/App.svelte';

const app = mount(App, {
	target: document.body,
	intro: false,
});

// Keep the embeddable build ready synchronously and preserve its teardown API.
flushSync();

export default {
	...app,
	$destroy: () => unmount(app),
};
