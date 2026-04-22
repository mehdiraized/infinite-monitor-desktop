"use strict";

const { Menu, shell, app } = require("electron");
const { openSettingsWindow } = require("./settings-window");
const { checkForUpdates } = require("./updater");

/**
 * Builds and sets the application menu.
 *
 * @param {{ isDevMode: boolean, mainWindow: Electron.BrowserWindow }} opts
 */
function buildMenu({ isDevMode, mainWindow }) {
	const isMac = process.platform === "darwin";

	/** @type {Electron.MenuItemConstructorOptions[]} */
	const template = [
		// ── macOS app menu ──
		...(isMac
			? [
					{
						label: app.name,
						submenu: [
							{ role: "about" },
							{
								label: "Check for Updates…",
								click() {
									checkForUpdates(mainWindow, true);
								},
							},
							{ type: "separator" },
							{
								label: "Settings…",
								accelerator: "CmdOrCtrl+,",
								click() {
									openSettingsWindow();
								},
							},
							{ type: "separator" },
							{ role: "services" },
							{ type: "separator" },
							{ role: "hide" },
							{ role: "hideOthers" },
							{ role: "unhide" },
							{ type: "separator" },
							{ role: "quit" },
						],
					},
				]
			: []),

		// ── File ──
		{
			label: "File",
			submenu: [
				{
					label: "New Dashboard",
					accelerator: "CmdOrCtrl+N",
					click() {
						if (mainWindow) {
							mainWindow.webContents.loadURL(
								mainWindow.webContents.getURL().split("?")[0].split("#")[0],
							);
						}
					},
				},
				{ type: "separator" },
				{
					label: "Add Widget",
					submenu: [
						{
							label: "Widget",
							accelerator: "CmdOrCtrl+Shift+W",
							click() {
								if (mainWindow) {
									mainWindow.webContents.executeJavaScript(
										`document.querySelector('[data-add-menu-trigger]')?.click()`,
									);
								}
							},
						},
						{
							label: "Text",
							accelerator: "CmdOrCtrl+Shift+T",
							click() {
								if (mainWindow) {
									mainWindow.webContents.executeJavaScript(
										`document.querySelector('[data-add-text-trigger]')?.click()`,
									);
								}
							},
						},
					],
				},
				{ type: "separator" },
				{
					label: "Settings",
					accelerator: "CmdOrCtrl+,",
					click() {
						openSettingsWindow();
					},
				},
				{ type: "separator" },
				isMac ? { role: "close" } : { role: "quit" },
			],
		},

		// ── Edit ──
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},

		// ── View ──
		{
			label: "View",
			submenu: [
				{
					label: "Dashboard",
					accelerator: "CmdOrCtrl+1",
					click() {
						if (mainWindow) {
							mainWindow.webContents.executeJavaScript(
								`document.querySelector('[data-view-dashboard]')?.click()`,
							);
						}
					},
				},
				{
					label: "Widget Store",
					accelerator: "CmdOrCtrl+2",
					click() {
						if (mainWindow) {
							mainWindow.webContents.executeJavaScript(
								`document.querySelector('[data-view-widgets]')?.click()`,
							);
						}
					},
				},
				{ type: "separator" },
				{
					label: "Reload",
					accelerator: "CmdOrCtrl+R",
					click() {
						if (mainWindow) mainWindow.webContents.reload();
					},
				},
				{
					label: "Force Reload",
					accelerator: "CmdOrCtrl+Shift+R",
					click() {
						if (mainWindow) mainWindow.webContents.reloadIgnoringCache();
					},
				},
				{
					label: "Toggle Developer Tools",
					accelerator: isMac ? "Alt+Cmd+I" : "Ctrl+Shift+I",
					click() {
						if (mainWindow) mainWindow.webContents.toggleDevTools();
					},
				},
				{ type: "separator" },
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
				{ type: "separator" },
				{ role: "togglefullscreen" },
			],
		},

		// ── Window ──
		{
			label: "Window",
			submenu: [
				{ role: "minimize" },
				{ role: "zoom" },
				...(isMac
					? [
							{ type: "separator" },
							{ role: "front" },
							{ type: "separator" },
							{ role: "window" },
						]
					: [{ role: "close" }]),
			],
		},

		// ── Help ──
		{
			role: "help",
			submenu: [
				{
					label: "Show Intro…",
					click() {
						if (mainWindow) {
							mainWindow.webContents.executeJavaScript(
								`window.dispatchEvent(new CustomEvent('im-show-onboarding'))`,
							);
						}
					},
				},
				{
					label: "Check for Updates…",
					click() {
						checkForUpdates(mainWindow, true);
					},
				},
				{ type: "separator" },
				{
					label: "Infinite Monitor on GitHub",
					click() {
						shell.openExternal(
							"https://github.com/mehdiraized/infinite-monitor-desktop",
						);
					},
				},
				{
					label: "Report an Issue",
					click() {
						shell.openExternal(
							"https://github.com/mehdiraized/infinite-monitor-desktop/issues",
						);
					},
				},
				{ type: "separator" },
				{
					label: "Support — Buy Me a Coffee",
					click() {
						shell.openExternal("https://buymeacoffee.com/farobox");
					},
				},
				{ type: "separator" },
				{
					label: "Open Data Directory",
					click() {
						const { app: electronApp } = require("electron");
						shell.openPath(electronApp.getPath("userData"));
					},
				},
			],
		},
	];

	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildMenu };
