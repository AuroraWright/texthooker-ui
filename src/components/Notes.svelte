<script lang="ts">
	import { dataState } from '../stores/data-state.svelte';

	import { settings } from '../stores/settings.svelte';

	import { mdiClose } from '@mdi/js';
	import { dummyFn } from '../util';
	import Icon from './Icon.svelte';

	function handleBlur(event: FocusEvent) {
		dataState.userNotes = (event.target as HTMLTextAreaElement).value;
	}
</script>

<div class="flex justify-end p-4">
	<!-- svelte-ignore a11y_interactive_supports_focus -->
	<div
		role="button"
		aria-label="Close notes"
		class="flex cursor-pointer items-end md:items-center"
		onclick={() => (settings.notesOpen = false)}
		onkeyup={dummyFn}
	>
		<Icon path={mdiClose} />
	</div>
</div>
<textarea
	class="flex-1 overflow-auto ml-10 mr-2 mb-4 p-1 pb-2"
	style="resize: none;"
	value={dataState.userNotes}
	onblur={handleBlur}
></textarea>
