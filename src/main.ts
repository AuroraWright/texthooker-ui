import './app.css';

import { flushSync, mount, unmount } from 'svelte';

import App from './components/App.svelte';
import { settings } from './stores/settings.svelte';

const stopPersistence = settings.startPersistence();

const app = mount(App, {
	target: document.body,
	intro: false,
});

// Keep the embeddable build ready synchronously and preserve its teardown API.
flushSync();

export default {
	...app,
	$destroy: () => {
		flushSync();
		stopPersistence();
		return unmount(app);
	},
};
