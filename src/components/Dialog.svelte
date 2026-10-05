<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		onclose?: () => void;
		icon?: string;
		message?: string;
		type?: string;
		showCancel?: boolean;
		askForData?: string;
		dataValue?: string | number;
		callback?: (param: { canceled: boolean; data: string | number | undefined }) => void;
	}

	let {
		onclose,
		icon,
		message,
		type = 'info',
		showCancel = true,
		askForData = '',
		dataValue = $bindable(),
		callback,
	}: Props = $props();

	function handleChange(event: Event) {
		const target = event.target as HTMLInputElement;

		dataValue = target.value;
	}
</script>

<div class="fixed top-12 flex justify-center w-full z-30">
	<div class="alert shadow-lg max-w-xl" class:alert-info={type === 'info'} class:alert-error={type === 'error'}>
		<div>
			{#if icon}
				<Icon path={icon} />
			{/if}
			<span>
				{#if askForData}
					<div>
						{#if askForData === 'text'}
							<input
								type={askForData}
								class="input input-bordered h-8 ml-2"
								value={dataValue}
								onchange={handleChange}
							/>
						{/if}
					</div>
				{:else}
					{message}
				{/if}
			</span>
		</div>
		<div class="flex-none">
			{#if showCancel}
				<button
					class="btn btn-sm btn-ghost"
					onclick={() => {
						callback?.({ canceled: true, data: dataValue });
						onclose?.();
					}}>Cancel</button
				>
			{/if}
			<button
				class="btn btn-sm btn-primary"
				onclick={() => {
					callback?.({ canceled: false, data: dataValue });
					onclose?.();
				}}>Confirm</button
			>
		</div>
	</div>
</div>
