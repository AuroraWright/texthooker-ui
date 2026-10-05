<script lang="ts">
	import { onDestroy } from 'svelte';
	import { dialogState } from '../stores/dialog-state.svelte';
	import Dialog from './Dialog.svelte';
	onDestroy(() => dialogState.clear());
</script>

{#if dialogState.current}
	<Dialog {...dialogState.current} onclose={() => dialogState.close()} />
{/if}
