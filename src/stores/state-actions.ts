import { appState } from './app-state.svelte';

export function setPaused(value: boolean) {
	appState.isPaused = value;
}

export function setSocketState(isPrimary: boolean, value: number) {
	if (isPrimary) appState.socketState = value;
	else appState.secondarySocketState = value;
}
