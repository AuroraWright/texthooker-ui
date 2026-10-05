import { setSocketState } from './stores/state-actions';
import { settings } from './stores/settings.svelte';
import { incomingLine, reconnectSecondarySocket, reconnectPrimarySocket } from './events';

import { LineType } from './types';

export class SocketConnection {
	private websocketUrl: string;

	private socket: WebSocket | undefined;

	private unsubscribeReconnect: () => void;

	constructor(private isPrimary = true, private onStateChange?: (state: number) => void) {
		this.websocketUrl = isPrimary ? settings.websocketUrl : settings.secondaryWebsocketUrl;
		this.unsubscribeReconnect = (isPrimary ? reconnectPrimarySocket : reconnectSecondarySocket).subscribe(() => {
			if (settings.continuousReconnect && this.socket?.readyState === 3) this.reloadSocket();
		});
	}

	setUrl(websocketUrl: string) {
		if (websocketUrl === this.websocketUrl) return;
		this.websocketUrl = websocketUrl;
		this.reloadSocket();
	}

	connect() {
		if (this.socket?.readyState < 2) {
			return;
		}

		if (!this.websocketUrl) {
			this.updateState(3);
			return;
		}

		this.updateState(0);

		try {
			this.socket = new WebSocket(this.websocketUrl);
			this.socket.onopen = this.updateSocketState.bind(this);
			this.socket.onclose = this.updateSocketState.bind(this);
			this.socket.onmessage = this.handleMessage.bind(this);
		} catch (error) {
			this.updateState(3);
		}
	}

	disconnect() {
		if (this.socket?.readyState === 1) {
			this.socket.close(1000, 'User Request');
		}
	}

	cleanUp() {
		this.onStateChange = undefined;
		this.disconnect();

		this.unsubscribeReconnect();
	}

	private reloadSocket() {
		this.disconnect();
		this.socket = undefined;
		this.connect();
	}

	private updateSocketState() {
		if (!this.socket) {
			return;
		}

		this.updateState(this.socket.readyState);
	}

	private updateState(state: number) {
		setSocketState(this.isPrimary, state);
		this.onStateChange?.(state);
	}

	private handleMessage(event: MessageEvent) {
		let line = event.data;

		try {
			line = JSON.parse(event.data)?.sentence || event.data;
		} catch (_) {
			// no-op
		}

		incomingLine.emit([line, LineType.SOCKET]);
	}
}
