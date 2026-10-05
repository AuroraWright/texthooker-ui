import { dialogState } from './dialog-state.svelte';

export class AppState {
	isPaused = $state(true);
	socketState = $state(-1);
	secondarySocketState = $state(-1);
	readonly dialogOpen = $derived(dialogState.isOpen);
	showSpinner = $state(true);
	flashOnPauseTimeout = $state<number>(undefined);
}

export const appState = new AppState();
