export enum Theme {
	LIGHT = 'light',
	DARK = 'dark',
	CUPCAKE = 'cupcake',
	BUMBLEBEE = 'bumblebee',
	EMERALD = 'emerald',
	CORPORATE = 'corporate',
	SYNTHWAVE = 'synthwave',
	RETRO = 'retro',
	CYBERPUNK = 'cyberpunk',
	VALENTINE = 'valentine',
	HALLOWEEN = 'halloween',
	GARDEN = 'garden',
	FOREST = 'forest',
	AQUA = 'aqua',
	LOFI = 'lofi',
	PASTEL = 'pastel',
	FANTASY = 'fantasy',
	WIREFRAME = 'wireframe',
	BLACK = 'black',
	LUXURY = 'luxury',
	DRACULA = 'dracula',
	CMYK = 'cmyk',
	AUTUMN = 'autumn',
	BUSINESS = 'business',
	ACID = 'acid',
	LEMONADE = 'lemonade',
	NIGHT = 'night',
	COFFEE = 'coffee',
	WINTER = 'winter',
}

export enum OnlineFont {
	OFF = 'Off',
	NOTO = 'Noto Serif JP',
	KLEE = 'Klee One',
	SHIPPORI = 'Shippori Mincho',
}

export interface Settings {
	theme$: string;
	windowTitle$: string;
	websocketUrl1$: string;
	websocketUrl2$: string;
	fontSize$: number;
	onlineFont$: string;
	preventLastDuplicate$: number;
	afkTimer$: number;
	adjustTimerOnAfk$: boolean;
	enableExternalClipboardMonitor$: boolean;
	showPresetQuickSwitch$: boolean;
	skipResetConfirmations$: boolean;
	persistStats$: boolean;
	persistNotes$: boolean;
	persistLines$: boolean;
	persistActionHistory$: boolean;
	enablePaste$: boolean;
	blockCopyOnPage$: boolean;
	allowPasteDuringPause$: boolean;
	allowNewLineDuringPause$: boolean;
	autoStartTimerDuringPausePaste$: boolean;
	autoStartTimerDuringPause$: boolean;
	flashOnMissedLine$: boolean;
	preventGlobalDuplicate$: boolean;
	displayVertical$: boolean;
	reverseLineOrder$: boolean;
	preserveWhitespace$: boolean;
	removeAllWhitespace$: boolean;
	showTimer$: boolean;
	showSpeed$: boolean;
	showCharacterCount$: boolean;
	showLineCount$: boolean;
	blurStats$: boolean;
	enableLineAnimation$: boolean;
	continuousReconnect$: boolean;
	customCSS$: string;
}

export interface SettingPreset {
	name: string;
	settings: Settings;
}

export interface DialogResult<T = undefined> {
	canceled: boolean;
	data: T;
}

export enum LineType {
	SOCKET = 'socket',
	PASTE = 'paste',
	EXTERNAL = 'external',
	EDIT = 'edit',
	UNDO = 'undo',
}

export interface LineItem {
	id: string;
	text: string;
	index?: number;
}

export interface LineItemEditEvent {
	inEdit: boolean;
	data?: LineItemEditData;
}

export interface LineItemEditData {
	originalText: string;
	newText: string;
	lineIndex: number;
	line: LineItem;
}
