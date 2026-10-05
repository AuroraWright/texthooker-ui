<script lang="ts">
	import { dataState } from '../stores/data-state.svelte';
	import { cacheLineCharacterCount, cacheLineCharacterCounts } from '../stores/line-character-counts';
	import { dialogState } from '../stores/dialog-state.svelte';
	import { appState } from '../stores/app-state.svelte';

	import { settings } from '../stores/settings.svelte';
	import { getCurrentSettings, updateSettingsWithPreset } from '../stores/presets';

	import {
		mdiClose,
		mdiDatabaseSync,
		mdiDelete,
		mdiHelpCircle,
		mdiTimerCancel,
		mdiTimerEdit,
		mdiWeatherNight,
		mdiWhiteBalanceSunny,
	} from '@mdi/js';
	import { removeIDBItem } from '../idb';
	import { resetAllData } from '../stores/stores';
	import { incomingLine, reconnectSecondarySocket, reconnectPrimarySocket } from '../events';
	import {
		LineType,
		OnlineFont,
		Theme,
		type DialogResult,
		type ExportedData,
		type ExportedSettings,
		type LineItem,
		type SettingPreset,
	} from '../types';
	import { clickOutside } from '../use-click-outside';
	import { applyCustomCSS, dummyFn, timeStringToSeconds } from '../util';
	import Icon from './Icon.svelte';
	import Presets from './Presets.svelte';
	import ReplacementSettings from './ReplacementSettings.svelte';

	interface Props {
		onreset: (linesOnly: boolean) => void | Promise<void>;
		onlayoutChange?: () => void;
		onmaxLinesChange?: () => void;
		onlinesRemoved?: (ids: string[], indices: number[]) => void;
		onlinesChanged?: (ids: string[], indices: number[]) => void;
		ondataResetOrImported?: () => void;
		onapplyReplacements?: () => void;
		selectedLineIds: string[];
		settingsOpen: boolean;
		settingsElement: SVGElement;
		pipAvailable: boolean;
	}

	let {
		onreset,
		onlayoutChange,
		onmaxLinesChange,
		onlinesRemoved,
		onlinesChanged,
		ondataResetOrImported,
		onapplyReplacements,
		selectedLineIds = $bindable(),
		settingsOpen = $bindable(),
		settingsElement,
		pipAvailable,
	}: Props = $props();

	const onlineFonts = [
		OnlineFont.OFF,
		OnlineFont.NOTO,
		OnlineFont.KLEE,
		OnlineFont.SHIPPORI,
		OnlineFont.ACKAISYO,
		OnlineFont.CINECAPTION226,
	];

	let dataFileInput: HTMLInputElement = $state();
	let settingsFileInput: HTMLInputElement = $state();
	let presetFileInput: HTMLInputElement = $state();

	function handleSecondaryWebsocketChange(event: Event) {
		const target = event.target as HTMLInputElement;

		target.setCustomValidity('');

		if (target.value === settings.websocketUrl) {
			target.setCustomValidity('Duplicate Websocket');
			target.value = '';
			settings.secondaryWebsocketUrl = '';
		} else {
			settings.secondaryWebsocketUrl = target.value;
		}

		target.reportValidity();
	}

	function clipboardMutationObserverCallback(mutations: MutationRecord[]) {
		for (let index = 0, { length } = mutations; index < length; index += 1) {
			const { addedNodes } = mutations[index];

			for (let index2 = 0, { length: length2 } = addedNodes; index2 < length2; index2 += 1) {
				const addedNode = addedNodes[index2] as HTMLElement;

				if (addedNode?.tagName === 'P') {
					incomingLine.emit([addedNode.textContent, LineType.EXTERNAL]);
					addedNode.remove();
				}
			}
		}
	}

	function handleSettingsClick(event: MouseEvent) {
		const target = event.target as any;

		if (
			!appState.showSpinner &&
			target !== settingsElement &&
			target.parentElement !== settingsElement &&
			target !== dataFileInput &&
			target !== settingsFileInput &&
			target !== presetFileInput &&
			!appState.dialogOpen
		) {
			settingsOpen = false;
		}
	}

	async function handleSetTimer() {
		const { canceled, data } = await new Promise<DialogResult<string>>((resolve) => {
			dialogState.open({
				icon: mdiHelpCircle,
				askForData: 'text',
				dataValue: '00:00:00',
				message: 'New Time',
				callback: resolve,
			});
		});

		if (canceled) {
			return;
		}

		if (!/^[\d]{1,}:[\d]{1,2}:[\d]{1,2}$/.test(data)) {
			return new Promise<DialogResult<string>>((resolve) => {
				dialogState.open({
					icon: mdiClose,
					type: 'error',
					message: 'Invalid Time value (x:xx:xx)',
					showCancel: false,
					callback: resolve,
				});
			});
		}

		settings.timeValue = timeStringToSeconds(data);
	}

	async function handleResetTimer() {
		if (!settings.skipResetConfirmations) {
			const { canceled } = await new Promise<DialogResult>((resolve) => {
				dialogState.open({
					icon: mdiHelpCircle,
					message: 'Timer will be set to 00:00:00',
					callback: resolve,
				});
			});

			if (canceled) {
				return;
			}
		}

		settings.timeValue = 0;
	}

	async function handleExportImportData(event: MouseEvent) {
		if (event.altKey) {
			await handleImport(dataFileInput, 'Existing Data will be overwritten');
		} else {
			handleExport<ExportedData>('texthooker-ui_data.json', {
				'bannou-texthooker-timeValue': settings.timeValue,
				'bannou-texthooker-userNotes': dataState.userNotes,
				'bannou-texthooker-lineData': dataState.lines,
				'bannou-texthooker-actionHistory': dataState.actionHistory,
			});
		}
	}

	async function handleExportImportSettings(event: MouseEvent) {
		if (event.altKey) {
			await handleImport(settingsFileInput, 'Presets, Settings etc. will be overwritten');
		} else {
			handleExport<ExportedSettings>('texthooker-ui_settings.json', {
				currentSettings: getCurrentSettings(),
				settingPresets: dataState.settingPresets,
				lastSettingsPreset: settings.lastSettingPreset,
			});
		}
	}

	async function handleExportImportPreset(event: MouseEvent) {
		if (event.altKey) {
			await handleImport(presetFileInput, 'Preset will be overwritten or otherwise added');
		} else if (settings.lastSettingPreset) {
			const existingEntry = dataState.settingPresets.find((entry) => entry.name === settings.lastSettingPreset);

			if (existingEntry) {
				handleExport<SettingPreset>('texthooker-ui_preset.json', {
					name: existingEntry.name,
					settings: existingEntry.settings,
				});
			}
		}
	}

	async function handleDataFileChange() {
		const data = await loadFile<ExportedData>(dataFileInput).catch(({ message }) => {
			dialogState.open({
				type: 'error',
				message,
				showCancel: false,
			});
		});

		if (data) {
			const entries = Object.entries(data);

			for (let index = 0, { length } = entries; index < length; index += 1) {
				const [key, value] = entries[index];

				switch (key) {
					case 'bannou-texthooker-timeValue':
						settings.timeValue = value;
						break;
					case 'bannou-texthooker-userNotes':
						dataState.userNotes = value;
						break;
					case 'bannou-texthooker-lineData':
						cacheLineCharacterCounts(value);
						dataState.lines = value;
						break;
					case 'bannou-texthooker-actionHistory':
						dataState.actionHistory = value;
						break;
					default:
						break;
				}
			}
		}

		dataFileInput.value = null;
		ondataResetOrImported?.();
	}

	async function handleSettingsFileChange() {
		const data = await loadFile<ExportedSettings>(settingsFileInput).catch(({ message }) => {
			dialogState.open({
				type: 'error',
				message,
				showCancel: false,
			});
		});

		if (data) {
			dataState.settingPresets = data.settingPresets || [];
			settings.lastSettingPreset = data.lastSettingsPreset || '';

			if (data.currentSettings) {
				updateSettingsWithPreset({ name: '', settings: data.currentSettings }, false, onlayoutChange);
			}
		}

		settingsFileInput.value = null;
	}

	async function handlePresetFileChange() {
		const data = await loadFile<SettingPreset>(presetFileInput).catch(({ message }) => {
			dialogState.open({
				type: 'error',
				message,
				showCancel: false,
			});
		});

		if (data && data.name && data.settings) {
			const presetIndex = dataState.settingPresets.findIndex((entry) => entry.name === data.name);

			if (presetIndex > -1) {
				dataState.settingPresets = dataState.settingPresets.map((preset, index) => index === presetIndex ? data : preset);
			} else {
				dataState.settingPresets = [...dataState.settingPresets, data];
			}

			settings.lastSettingPreset = data.name;
			updateSettingsWithPreset(data, true, onlayoutChange);
		}

		presetFileInput.value = null;
	}

	async function handlePersistenceChange(settingEnabled: boolean, message: string, storageKey: string) {
		if (settingEnabled) {
			return;
		}

		const { canceled } = await new Promise<DialogResult>((resolve) => {
			dialogState.open({
				icon: mdiHelpCircle,
				message,
				callback: resolve,
			});
		});

		if (!canceled) {
			window.localStorage.removeItem(storageKey);
			await removeIDBItem(storageKey);
		}
	}

	function handleCharacterMilestoneBlur(event) {
		const target = event.target as HTMLInputElement;
		const value = Number.parseInt(target.value || '0');

		if (!value || value < 2) {
			settings.characterMilestone = 0;
		} else {
			settings.characterMilestone = value;
		}

		target.value = `${settings.characterMilestone}`;
		onlayoutChange?.();
	}

	function handlePreventLastDuplicateBlur(event) {
		const target = event.target as HTMLInputElement;
		const value = Number.parseInt(target.value || '0');
		const wasChange = value !== settings.preventLastDuplicate;

		if (!value || value < 0) {
			settings.preventLastDuplicate = 0;
		} else {
			settings.preventLastDuplicate = value;
		}

		target.value = `${settings.preventLastDuplicate}`;

		if (wasChange) {
			handlePreventLastDuplicateChange();
		}
	}

	async function handlePreventLastDuplicateChange() {
		if (!settings.preventLastDuplicate || dataState.lines.length < 2) {
			return;
		}

		const { canceled } = await new Promise<DialogResult>((resolve) => {
			dialogState.open({
				icon: mdiHelpCircle,
				message: 'Apply to current lines',
				callback: resolve,
			});
		});

		if (canceled) {
			return;
		}

		const nonDuplicateLines: LineItem[] = [];
		const nonDuplicateLineText = new Set<string>();
		const removedIds = new Set<string>();
		const removedIndices: number[] = [];
		const startIndex = Math.max(0, dataState.lines.length - settings.preventLastDuplicate - 1);
		const lines = dataState.lines.slice(startIndex);

		for (let index = 0, { length } = lines; index < length; index += 1) {
			const line = lines[index];

			if (nonDuplicateLineText.has(line.text)) {
				removedIds.add(line.id);
				removedIndices.push(startIndex + index);
			} else {
				nonDuplicateLines.push(line);
				nonDuplicateLineText.add(line.text);
			}
		}

		dataState.lines = [...dataState.lines.slice(0, startIndex), ...nonDuplicateLines];
		selectedLineIds = selectedLineIds.filter((selectedLineId) => !removedIds.has(selectedLineId));

		if (removedIds.size > 0) {
			onlinesRemoved?.(Array.from(removedIds), removedIndices);
		}
	}

	function handleMaxLinesBlur(event) {
		const target = event.target as HTMLInputElement;
		const value = Number.parseInt(target.value || '0');
		const wasChange = value !== settings.maxLines;

		if (!value || value < 0) {
			settings.maxLines = 0;
		} else {
			settings.maxLines = value;
		}

		target.value = `${settings.maxLines}`;

		if (wasChange) {
			handleMaxLinesChange();
		}
	}

	function handleMaxPipLinesBlur(event) {
		const target = event.target as HTMLInputElement;
		const value = Number.parseInt(target.value || '0');

		if (!value || value < 0) {
			settings.maxPipLines = 1;
		} else {
			settings.maxPipLines = value;
		}

		target.value = `${settings.maxPipLines}`;
	}

	async function handleMaxLinesChange() {
		const lineDiff = dataState.lines.length - settings.maxLines;

		if (!settings.maxLines || lineDiff < 1) {
			return;
		}

		const { canceled } = await new Promise<DialogResult>((resolve) => {
			dialogState.open({
				icon: mdiHelpCircle,
				message: `This will remove the first ${lineDiff} line(s)`,
				callback: resolve,
			});
		});

		if (canceled) {
			settings.maxLines = 0;
		} else {
			onmaxLinesChange?.();
			onlayoutChange?.();
		}
	}

	async function handlePreventGlobalDuplicateChange() {
		if (!settings.preventGlobalDuplicate || dataState.lines.length < 2) {
			return;
		}

		const { canceled } = await new Promise<DialogResult>((resolve) => {
			dialogState.open({
				icon: mdiHelpCircle,
				message: 'Apply to current lines',
				callback: resolve,
			});
		});

		if (!canceled) {
			const uniqueLines = new Set<string>();
			const removedLineIds = new Set<string>();
			const removedIndices: number[] = [];

			dataState.lines = dataState.lines.filter((line, index) => {
				if (uniqueLines.has(line.text)) {
					removedLineIds.add(line.id);
					removedIndices.push(index);
					return false;
				}

				uniqueLines.add(line.text);
				return true;
			});
			selectedLineIds = selectedLineIds.filter((selectedLineId) => !removedLineIds.has(selectedLineId));

			if (removedLineIds.size > 0) {
				onlinesRemoved?.(Array.from(removedLineIds), removedIndices);
			}
		}
	}

	async function handleRemoveAllWhiteSpaceChange() {
		if (settings.removeAllWhitespace) {
			const { canceled } = await new Promise<DialogResult>((resolve) => {
				dialogState.open({
					icon: mdiHelpCircle,
					message: 'Apply to current Lines',
					callback: resolve,
				});
			});

			if (!canceled) {
				const changedIds: string[] = [];
				const changedIndices: number[] = [];
				dataState.lines = dataState.lines.map((oldLine, index) => {
					const text = oldLine.text.replace(/\s/g, '').trim();
					if (text !== oldLine.text) {
						oldLine.text = text;
						cacheLineCharacterCount(oldLine);
						changedIds.push(oldLine.id);
						changedIndices.push(index);
					}
					return oldLine;
				});
				if (changedIds.length > 0) {
					onlinesChanged?.(changedIds, changedIndices);
				}
			}
		}
	}

	function handleCustomCSSBlur(event: FocusEvent) {
		settings.customCSS = (event.target as HTMLTextAreaElement).value;
		onlayoutChange?.();
	}

	async function handleImport(fileInput: HTMLInputElement, message: string) {
		if (!settings.skipResetConfirmations) {
			const { canceled } = await new Promise<DialogResult>((resolve) => {
				dialogState.open({
					icon: mdiHelpCircle,
					message,
					callback: resolve,
				});
			});

			if (canceled) {
				return;
			}
		}

		fileInput.click();
	}

	function handleExport<T>(fileName: string, exportData: T) {
		const a = document.createElement('a');

		a.href = URL.createObjectURL(new Blob([JSON.stringify(exportData)], { type: `application/json` }));
		a.rel = 'noopener';
		a.download = fileName;

		setTimeout(() => {
			URL.revokeObjectURL(a.href);
		}, 1e4);

		setTimeout(() => {
			a.click();
		});
	}

	function loadFile<T>(inputElement: HTMLInputElement) {
		return new Promise<T | void>((resolve, reject) => {
			const [file] = inputElement.files;
			const fileReader = new FileReader();

			if (!file) {
				return resolve();
			}

			if (!file.name.endsWith('.json')) {
				dialogState.open({
					type: 'error',
					message: `Expected json File`,
					showCancel: false,
				});

				inputElement.value = null;
				return resolve();
			}

			fileReader.addEventListener('loadend', (event) => {
				try {
					const data = JSON.parse(event.target.result as string);

					resolve(data);
				} catch (error) {
					reject(new Error('Error parsing File'));
				}
			});
			fileReader.addEventListener('error', () => reject(new Error('Failed to read File')));
			fileReader.readAsText(file, 'utf-8');
		});
	}
	$effect(() => {
		document.body.dataset.theme = settings.theme;
	});
	$effect(() => {
		if (!settings.enableExternalClipboardMonitor) return;
		const observer = new MutationObserver(clipboardMutationObserverCallback);
		observer.observe(document.body, { childList: true });
		return () => observer.disconnect();
	});
	$effect(() => {
		applyCustomCSS(document, settings.customCSS);
	});
</script>

<svelte:head>
	<title>{settings.windowTitle || 'Texthooker UI'}</title>
</svelte:head>

{#if settingsOpen}
	<input class="hidden" type="file" bind:this={dataFileInput} onchange={handleDataFileChange} />
	<input class="hidden" type="file" bind:this={settingsFileInput} onchange={handleSettingsFileChange} />
	<input class="hidden" type="file" bind:this={presetFileInput} onchange={handlePresetFileChange} />
	<div
		class="flex flex-col max-[800px]:w-[90vw] min-[800px]:grid grid-cols-[max-content,auto,max-content,auto] gap-3 absolute overflow-auto h-[90vh] top-11 z-10 py-4 pr-8 pl-4 border bg-base-200 overscroll-contain"
		use:clickOutside={handleSettingsClick}
	>
		<div class="mb-2" style="grid-column: 1/5;">
			<div class="flex text-sm gap-x-5 min-[600px]:justify-between max-[600px]:flex-wrap max-[600px]:gap-y-5">
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					role="button"
					class="flex flex-col items-center hover:text-primary"
					onclick={handleSetTimer}
					onkeyup={dummyFn}
				>
					<Icon path={mdiTimerEdit} />
					<span class="label-text">Set Timer</span>
				</div>
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					role="button"
					class="flex flex-col items-center hover:text-primary"
					onclick={handleResetTimer}
					onkeyup={dummyFn}
				>
					<Icon path={mdiTimerCancel} />
					<span class="label-text">Reset Timer</span>
				</div>
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					role="button"
					class="flex flex-col items-center hover:text-primary"
					onclick={() => onreset(true)}
					onkeyup={dummyFn}
				>
					<Icon path={mdiDelete} />
					<span class="label-text">Reset Lines</span>
				</div>
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					role="button"
					class="flex flex-col items-center hover:text-primary"
					onclick={() => onreset(false)}
					onkeyup={dummyFn}
				>
					<Icon path={mdiDelete} />
					<span class="label-text">Reset Data</span>
				</div>
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					role="button"
					class="flex flex-col items-center hover:text-primary"
					onclick={() => resetAllData(onlayoutChange)}
					onkeyup={dummyFn}
				>
					<Icon path={mdiDelete} />
					<span class="label-text">Reset All</span>
				</div>
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					role="button"
					class="flex flex-col items-center hover:text-primary"
					onclick={handleExportImportData}
					onkeyup={dummyFn}
				>
					<Icon path={mdiDatabaseSync} />
					<span class="label-text">Ex-/Import Data</span>
				</div>
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					role="button"
					class="flex flex-col items-center hover:text-primary"
					onclick={handleExportImportSettings}
					onkeyup={dummyFn}
				>
					<Icon path={mdiDatabaseSync} />
					<span class="label-text">Ex-/Import Settings</span>
				</div>
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					role="button"
					class="flex flex-col items-center hover:text-primary"
					onclick={() => (settings.theme = settings.theme === Theme.BUSINESS ? Theme.GARDEN : Theme.BUSINESS)}
					onkeyup={dummyFn}
				>
					<label class="swap swap-rotate">
						<input
							type="checkbox"
							checked={settings.theme === Theme.BUSINESS}
							onchange={() => (settings.theme = settings.theme === Theme.BUSINESS ? Theme.GARDEN : Theme.BUSINESS)}
						/>
						<Icon class="swap-on" path={mdiWeatherNight} />
						<Icon class="swap-off" path={mdiWhiteBalanceSunny} />
					</label>
					<span class="label-text">Theme</span>
				</div>
			</div>
		</div>
		<Presets {onlayoutChange} onexportImportPreset={(detail) => handleExportImportPreset(detail)} />
		<ReplacementSettings {onapplyReplacements} />
		<span class="label-text col-span-2">Window Title</span>
		<input class="input input-bordered h-8 col-span-2" bind:value={settings.windowTitle} />
		<span class="label-text col-span-2">Primary Websocket</span>
		<input
			class="input input-bordered h-8 col-span-2"
			value={settings.websocketUrl}
			onchange={(event) => (settings.websocketUrl = event.currentTarget.value)}
		/>
		<span class="label-text col-span-2">Secondary Websocket</span>
		<input
			class="input input-bordered h-8 col-span-2"
			value={settings.secondaryWebsocketUrl}
			onchange={handleSecondaryWebsocketChange}
		/>
		<span class="label-text col-span-2">Font Size</span>
		<input
			type="number"
			class="input input-bordered h-8 col-span-2"
			min="1"
			bind:value={settings.fontSize}
			oninput={() => onlayoutChange?.()}
			onblur={() => {
				if (!settings.fontSize || settings.fontSize < 1) {
					settings.fontSize = 24;
				}
				onlayoutChange?.();
			}}
		/>
		<span class="label-text col-span-2">Line Padding</span>
		<input
			type="number"
			class="input input-bordered h-8 col-span-2"
			min="0"
			bind:value={settings.linePadding}
			oninput={() => onlayoutChange?.()}
			onblur={() => {
				if (settings.linePadding === null || settings.linePadding < 0) {
					settings.linePadding = 1;
				}
				onlayoutChange?.();
			}}
		/>
		<span class="label-text col-span-2">Character Milestone</span>
		<input
			type="number"
			class="input input-bordered h-8 col-span-2"
			min="0"
			value={settings.characterMilestone}
			onblur={handleCharacterMilestoneBlur}
		/>
		<span class="label-text mr-4 col-span-2">Online Font</span>
		<select class="select col-span-2" bind:value={settings.onlineFont} onchange={() => onlayoutChange?.()}>
			{#each onlineFonts as font (font)}
				<option value={font}>
					{font}
				</option>
			{/each}
		</select>
		<span class="label-text col-span-2">Prevent Last Line Duplicate</span>
		<input
			type="number"
			class="input input-bordered h-8 col-span-2"
			min="0"
			value={settings.preventLastDuplicate}
			onblur={handlePreventLastDuplicateBlur}
		/>
		<span class="label-text col-span-2">Max lines</span>
		<input
			type="number"
			class="input input-bordered h-8 mb-2 col-span-2"
			min="0"
			value={settings.maxLines}
			onblur={handleMaxLinesBlur}
		/>
		{#if pipAvailable}
			<span class="label-text col-span-2">Max lines (floating window)</span>
			<input
				type="number"
				class="input input-bordered h-8 mb-2 col-span-2"
				min="0"
				value={settings.maxPipLines}
				onblur={handleMaxPipLinesBlur}
			/>
		{/if}
		<span class="label-text col-span-2">AFK Timer (s)</span>
		<input
			type="number"
			class="input input-bordered h-8 mb-2 col-span-2"
			min="0"
			bind:value={settings.afkTimer}
			onblur={() => {
				if (settings.afkTimer === null || settings.afkTimer < 0) {
					settings.afkTimer = 0;
				}
			}}
		/>
		<span class="label-text">Adjust Timer after AFK</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.adjustTimerOnAfk} />
		<span class="label-text">Enable external Clipboard Monitor</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.enableExternalClipboardMonitor} />
		<span class="label-text">Show Preset Quick Switch</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.showPresetQuickSwitch} />
		<span class="label-text">Skip Reset Confirmations</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.skipResetConfirmations} />
		<span class="label-text">Store Stats persistently</span>
		<input
			type="checkbox"
			class="checkbox checkbox-primary ml-2"
			bind:checked={settings.persistStats}
			onchange={() =>
				handlePersistenceChange(settings.persistStats, 'Clear stored stats', 'bannou-texthooker-timeValue')}
		/>
		<span class="label-text">Store Notes persistently</span>
		<input
			type="checkbox"
			class="checkbox checkbox-primary ml-2"
			bind:checked={settings.persistNotes}
			onchange={() =>
				handlePersistenceChange(settings.persistNotes, 'Clear stored notes', 'bannou-texthooker-userNotes')}
		/>
		<span class="label-text">Store Lines persistently</span>
		<input
			type="checkbox"
			class="checkbox checkbox-primary ml-2"
			bind:checked={settings.persistLines}
			onchange={() => handlePersistenceChange(settings.persistLines, 'Clear stored lines', 'bannou-texthooker-lineData')}
		/>
		<span class="label-text">Store Action History persistently</span>
		<input
			type="checkbox"
			class="checkbox checkbox-primary ml-2"
			bind:checked={settings.persistActionHistory}
			onchange={() =>
				handlePersistenceChange(
					settings.persistActionHistory,
					'Clear action history',
					'bannou-texthooker-actionHistory',
				)}
		/>
		<span class="label-text">Enable Paste</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.enablePaste} />
		<span class="label-text">Block Copy from Page</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.blockCopyOnPage} />
		<span class="label-text">Allow Paste during Pause</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.allowPasteDuringPause} />
		<span class="label-text">Allow new Line during Pause</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.allowNewLineDuringPause} />
		<span class="label-text">Autostart Timer by Paste during Pause</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.autoStartTimerDuringPausePaste} />
		<span class="label-text">Autostart Timer by Line during Pause</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.autoStartTimerDuringPause} />
		<span class="label-text">Prevent Global Duplicate</span>
		<input
			type="checkbox"
			class="checkbox checkbox-primary ml-2"
			bind:checked={settings.preventGlobalDuplicate}
			onchange={handlePreventGlobalDuplicateChange}
		/>
		<span class="label-text">Merge equal Line Starts</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.mergeEqualLineStarts} />
		<span class="label-text">Filter lines without jp content</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.filterNonCJKLines} />
		<span class="label-text">Flash on missed Line</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.flashOnMissedLine} />
		<span class="label-text">Display Text vertically</span>
		<input
			type="checkbox"
			class="checkbox checkbox-primary ml-2"
			bind:checked={settings.displayVertical}
			onchange={() => onlayoutChange?.()}
		/>
		<span class="label-text">Reverse Line Order</span>
		<input
			type="checkbox"
			class="checkbox checkbox-primary ml-2"
			bind:checked={settings.reverseLineOrder}
			onchange={() => onlayoutChange?.()}
		/>
		<span class="label-text">Preserve Whitespace</span>
		<input
			type="checkbox"
			class="checkbox checkbox-primary ml-2"
			bind:checked={settings.preserveWhitespace}
			onchange={() => onlayoutChange?.()}
		/>
		<span class="label-text">Remove all Whitespace</span>
		<input
			type="checkbox"
			class="checkbox checkbox-primary ml-2"
			bind:checked={settings.removeAllWhitespace}
			onchange={handleRemoveAllWhiteSpaceChange}
		/>
		<span class="label-text">Show Bullet Points</span>
		<input
			type="checkbox"
			class="checkbox checkbox-primary ml-2"
			bind:checked={settings.showLinePoints}
			onchange={() => onlayoutChange?.()}
		/>
		<span class="label-text">Show Timer</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.showTimer} />
		<span class="label-text">Show Speed</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.showSpeed} />
		<span class="label-text">Show Character Count</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.showCharacterCount} />
		<span class="label-text">Show Line Count</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.showLineCount} />
		<span class="label-text">Blur Stats</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.blurStats} />
		<span class="label-text">Enable Line Animation</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.enableLineAnimation} />
		<span class="label-text">Enable AFK Blur</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.enableAfkBlur} />
		<span class="label-text">Restart Timer after AFK Blur</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.enableAfkBlurRestart} />
		<span class="label-text">Continuous Reconnect</span>
		<input
			type="checkbox"
			class="checkbox checkbox-primary ml-2"
			bind:checked={settings.continuousReconnect}
			onchange={() => {
				reconnectPrimarySocket.emit();
				reconnectSecondarySocket.emit();
			}}
		/>
		<span class="label-text">Show Connection Errors</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.showConnectionErrors} />
		<span class="label-text">Show Connection Icon</span>
		<input type="checkbox" class="checkbox checkbox-primary ml-2" bind:checked={settings.showConnectionIcon} />
		<span class="label-text" style="grid-column: 1/5;">Custom CSS</span>
		<textarea
			class="p-1 min-h-[10rem] font-mono"
			style="grid-column: 1/5;"
			rows="5"
			value={settings.customCSS}
			onblur={handleCustomCSSBlur}
		></textarea>
	</div>
{/if}
