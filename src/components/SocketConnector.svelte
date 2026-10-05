<script lang="ts">
	import { appState } from '../stores/app-state.svelte';
	import { dialogState } from '../stores/dialog-state.svelte';
	import { setPaused } from '../stores/state-actions';

	import { settings } from '../stores/settings.svelte';

	import { mdiConnection } from '@mdi/js';
	import { onMount, untrack } from 'svelte';
	import { SocketConnection } from '../socket';
	import { reconnectSecondarySocket, reconnectPrimarySocket } from '../events';
	import Icon from './Icon.svelte';

	interface Props {
		isPrimary?: boolean;
	}

	let { isPrimary = true }: Props = $props();

	let socketConnection = $state.raw<SocketConnection>();
	let intitialAttemptDone = false;
	let wasConnected = $state(false);
	let closeRequested = false;
	let lastSocketState = -1;
	let socketState = $derived(isPrimary ? appState.socketState : appState.secondarySocketState);

	$effect(() => {
		const url = isPrimary ? settings.websocketUrl : settings.secondaryWebsocketUrl;
		const connection = socketConnection;
		untrack(() => connection?.setUrl(url));
	});

	onMount(() => {
		handleSocketState(socketState);
		toggleSocket();

		return () => {
			closeRequested = true;
			socketConnection?.cleanUp();
		};
	});

	function handleSocketState(socketStateValue: number) {
		if (lastSocketState === socketStateValue) return;
		lastSocketState = socketStateValue;
		switch (socketStateValue) {
			case 0:
				wasConnected = false;
				closeRequested = false;
				break;
			case 1:
				intitialAttemptDone = true;
				wasConnected = true;
				break;
			case 3:
				const socketType = isPrimary ? 'primary' : 'secondary';
				const socketUrl = isPrimary ? settings.websocketUrl : settings.secondaryWebsocketUrl;

				if (
					settings.showConnectionErrors &&
					!closeRequested &&
					intitialAttemptDone &&
					socketUrl &&
					(wasConnected || !settings.continuousReconnect)
				) {
					dialogState.open({
						type: 'error',
						message: wasConnected
							? `Lost Connection to ${socketType} Websocket`
							: `Unable to connect to ${socketType} Websocket`,
						showCancel: false,
					});
				}

				setPaused(true);

				intitialAttemptDone = true;
				wasConnected = false;

				if (!closeRequested) {
					(isPrimary ? reconnectPrimarySocket : reconnectSecondarySocket).emit();
				}

				break;

			default:
				break;
		}
	}

	function updateConnectedWithLabel(hasConnection: boolean) {
		return hasConnection
			? `Connected with ${isPrimary ? settings.websocketUrl : settings.secondaryWebsocketUrl}`
			: 'Not Connected';
	}

	async function toggleSocket() {
		if (socketState === 1 && socketConnection) {
			closeRequested = true;
			socketConnection.disconnect();
		} else {
			socketConnection = socketConnection || new SocketConnection(isPrimary, handleSocketState);
			socketConnection.connect();
		}
	}
	let connectedWithLabel = $derived(updateConnectedWithLabel(wasConnected));
</script>

{#if socketState !== 0}
	<div
		class="hover:text-primary"
		class:text-red-500={socketState !== -1}
		class:text-green-700={socketState === 1}
		class:hidden={!settings.showConnectionIcon}
		title={connectedWithLabel}
	>
		<Icon path={mdiConnection} class="cursor-pointer mx-2" onclick={toggleSocket} />
	</div>
{:else}
	<span
		class="animate-ping relative inline-flex rounded-full h-3 w-3 mx-3 bg-primary"
		class:hidden={!settings.showConnectionIcon}
	></span>
{/if}
