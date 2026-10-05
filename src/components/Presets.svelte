<script lang="ts">
	import { dataState } from '../stores/data-state.svelte';
	import { dialogState } from '../stores/dialog-state.svelte';

	import { settings } from '../stores/settings.svelte';
	import { getCurrentSettings, updateSettingsWithPreset } from '../stores/presets';

	import { mdiContentSave, mdiDatabaseSync, mdiDelete, mdiHelpCircle, mdiReload } from '@mdi/js';
	import type { DialogResult, SettingPreset } from '../types';
	import { dummyFn } from '../util';
	import Icon from './Icon.svelte';

	interface Props {
		onlayoutChange?: () => void;
		onexportImportPreset?: (value: MouseEvent) => void;
		isQuickSwitch?: boolean;
	}

	let { onlayoutChange, onexportImportPreset, isQuickSwitch = false }: Props = $props();

	const fallbackPresetEntry = [{ name: '' }];

	function selectPreset(event: Event) {
		const target = event.target as HTMLSelectElement;

		changePreset(target.selectedOptions[0].value);
	}

	function changePreset(presetName: string) {
		const existingEntry = dataState.settingPresets.find((entry) => entry.name === presetName);

		if (existingEntry) {
			updateSettingsWithPreset(existingEntry, true, onlayoutChange);
		}
	}

	async function savePreset() {
		const { canceled, data } = await new Promise<DialogResult<string>>((resolve) => {
			dialogState.open({
				icon: mdiHelpCircle,
				askForData: 'text',
				dataValue: settings.lastSettingPreset || 'Preset Name',
				message: '',
				callback: resolve,
			});
		});

		if (canceled || !data) {
			return;
		}

		const existingEntryIndex = dataState.settingPresets.findIndex((entry) => entry.name === data);
		const entry: SettingPreset = {
			name: data,
			settings: getCurrentSettings(),
		};

		if (existingEntryIndex > -1) {
			dataState.settingPresets = dataState.settingPresets.map((preset, index) => index === existingEntryIndex ? entry : preset);
		} else {
			dataState.settingPresets = [...dataState.settingPresets, entry];
		}

		settings.lastSettingPreset = data;
	}

	async function deletePreset() {
		if (!settings.skipResetConfirmations) {
			const { canceled } = await new Promise<DialogResult>((resolve) => {
				dialogState.open({
					icon: mdiHelpCircle,
					message: 'Preset will be deleted',
					callback: resolve,
				});
			});

			if (canceled) {
				return;
			}
		}

		dataState.settingPresets = dataState.settingPresets.filter((entry) => entry.name !== settings.lastSettingPreset);
		settings.lastSettingPreset = '';
	}
</script>

{#if isQuickSwitch}
	<select
		class="w-48 hidden sm:block"
		class:sm:hidden={!settings.showPresetQuickSwitch || dataState.settingPresets.length < 2}
		value={settings.lastSettingPreset}
		onchange={selectPreset}
	>
		{#each dataState.settingPresets.length ? dataState.settingPresets : fallbackPresetEntry as preset (preset.name)}
			<option value={preset.name}>
				{preset.name}
			</option>
		{/each}
	</select>
{:else}
	<details class="col-span-4 mb-2 cursor-pointer">
		<summary>Presets</summary>
		<div class="flex items-center justify-between mt-2">
			<select class="select flex-1 max-w-md" value={settings.lastSettingPreset} onchange={selectPreset}>
				{#each dataState.settingPresets.length ? dataState.settingPresets : fallbackPresetEntry as preset (preset.name)}
					<option value={preset.name}>
						{preset.name || 'No Presets stored'}
					</option>
				{/each}
			</select>
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				role="button"
				class="flex flex-col items-center hover:text-primary ml-3"
				onclick={savePreset}
				onkeyup={dummyFn}
			>
				<Icon path={mdiContentSave} />
				<span class="label-text">Save</span>
			</div>
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				role="button"
				class="flex flex-col items-center hover:text-primary ml-3"
				onclick={(event) => onexportImportPreset?.(event)}
				onkeyup={dummyFn}
			>
				<Icon path={mdiDatabaseSync} />
				<span class="label-text">Export/Import</span>
			</div>
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				role="button"
				class="flex flex-col items-center hover:text-primary ml-3"
				class:invisible={!settings.lastSettingPreset}
				onclick={() => changePreset(settings.lastSettingPreset)}
				onkeyup={dummyFn}
			>
				<Icon path={mdiReload} />
				<span class="label-text">Reload</span>
			</div>
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				role="button"
				class="flex flex-col items-center hover:text-primary ml-3"
				class:invisible={!settings.lastSettingPreset}
				onclick={deletePreset}
				onkeyup={dummyFn}
			>
				<Icon path={mdiDelete} />
				<span class="label-text">Delete</span>
			</div>
		</div>
	</details>
{/if}
