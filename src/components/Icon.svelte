<script lang="ts">
	interface Props {
		onclick?: (event: MouseEvent) => void;
		onkeyup?: (event: KeyboardEvent) => void;
		path: string;
		label?: string;
		width?: string;
		height?: string;
		element?: SVGElement | undefined;
		class?: string;
	}

	let {
		onclick,
		onkeyup,
		label,
		path,
		width = '1.5rem',
		height = '1.5rem',
		element = $bindable(undefined),
		class: _class = '',
	}: Props = $props();
</script>

<svg
	role={onclick ? 'button' : 'img'}
	aria-label={label}
	style="width: {width}; height: {height};"
	viewBox="0 0 24 24"
	fill="currentColor"
	class={_class}
	bind:this={element}
	{onclick}
	{onkeyup}
>
	<path d={path} />
</svg>
