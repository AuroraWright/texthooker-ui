<script lang="ts">
	import { mdiConnection } from '@mdi/js';
	import { onMount } from 'svelte';
	import { SocketConnection } from '../socket';
	import {
		continuousReconnect$,
		isPaused$,
		openDialog$,
		reconnectSocket1$,
		reconnectSocket2$,
		socketState1$,
		socketState2$,
		websocketUrl1$,
		websocketUrl2$,
	} from '../stores/stores';
	import Icon from './Icon.svelte';

	export let socketId: int;
	let socketConnection: SocketConnection | undefined;
	let intitialAttemptDone = false;
	let wasConnected = false;
	let closeRequested = false;
	const reconnectSocket$ = socketId ? reconnectSocket2$ : reconnectSocket1$;
	const socketState$ = socketId ? socketState2$ : socketState1$;
	const websocketUrl$ = socketId ? websocketUrl2$ : websocketUrl1$;

	$: handleSocketState($socketState$);

	onMount(() => {
		toggleSocket();

		return () => {
			closeRequested = true;
			socketConnection?.cleanUp();
		};
	});

	function handleSocketState(socketState) {
		switch (socketState) {
			case 0:
				wasConnected = false;
				closeRequested = false;
				break;
			case 1:
				intitialAttemptDone = true;
				wasConnected = true;
				break;
			case 3:
				if (!closeRequested && intitialAttemptDone && (wasConnected || !$continuousReconnect$)) {
					$openDialog$ = {
						type: 'error',
						message: wasConnected ? `Lost Connection to Websocket` : 'Unable to connect to Websocket',
						showCancel: false,
					};
				}

				$isPaused$ = true;

				intitialAttemptDone = true;
				wasConnected = false;

				if (!closeRequested) {
					reconnectSocket$.next();
				}

				break;

			default:
				break;
		}
	}

	function updateConnectedWithLabel(hasConnection: boolean) {
		return hasConnection ? `Connected with ${$websocketUrl$}` : 'Not Connected';
	}

	async function toggleSocket() {
		if ($socketState$ === 1 && socketConnection) {
			closeRequested = true;
			socketConnection.disconnect();
		} else {
			socketConnection = socketConnection || new SocketConnection(reconnectSocket$, socketState$, websocketUrl$);
			socketConnection.connect();
		}
	}
</script>

{#if $socketState$ !== 0}
	<div
		class="hover:text-primary"
		class:text-red-500={$socketState$ !== -1}
		class:text-green-700={$socketState$ === 1}
		title={updateConnectedWithLabel(wasConnected)}
	>
		<Icon path={mdiConnection} class="cursor-pointer mx-2" on:click={toggleSocket} />
	</div>
{:else}
	<span class="animate-ping relative inline-flex rounded-full h-3 w-3 mx-3 bg-primary" />
{/if}
