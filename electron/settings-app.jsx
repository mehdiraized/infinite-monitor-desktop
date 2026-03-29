import React, { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const TABS = [
	{ id: "about", label: "About" },
	{ id: "apikeys", label: "API Keys" },
	{ id: "appearance", label: "Appearance" },
];

const THEME_OPTIONS = [
	{ id: "dark", label: "Dark", disabled: false, previewClass: "theme-preview-dark" },
	{ id: "light", label: "Light", disabled: true, previewClass: "theme-preview-light", badge: "Soon" },
	{ id: "auto", label: "System", disabled: true, previewClass: "theme-preview-auto", badge: "Soon" },
];

function InfinityIcon() {
	return (
		<svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M100,50 C100,25 82,6 56,6 C30,6 4,24 4,50 C4,76 30,94 56,94 C82,94 100,75 100,50 C100,25 118,6 144,6 C170,6 196,24 196,50 C196,76 170,94 144,94 C118,94 100,75 100,50 Z"
				stroke="#6366f1"
				strokeWidth="6"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function DownloadIcon() {
	return (
		<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="7 10 12 15 17 10" />
			<line x1="12" y1="15" x2="12" y2="3" />
		</svg>
	);
}

function HeartIcon() {
	return (
		<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
		</svg>
	);
}

function PlusIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
	);
}

function EditIcon() {
	return (
		<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
			<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
		</svg>
	);
}

function SaveIcon() {
	return (
		<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
			<polyline points="20 6 9 17 4 12" />
		</svg>
	);
}

function DeleteIcon() {
	return (
		<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<polyline points="3 6 5 6 21 6" />
			<path d="M19 6l-1 14H6L5 6" />
			<path d="M10 11v6M14 11v6" />
			<path d="M9 6V4h6v2" />
		</svg>
	);
}

function CloseIcon() {
	return (
		<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<line x1="18" y1="6" x2="6" y2="18" />
			<line x1="6" y1="6" x2="18" y2="18" />
		</svg>
	);
}

function maskKey(key) {
	if (!key) return "";
	if (key.length <= 8) return "••••••••";
	return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function KeyRow({ provider, secret, onSave, onDelete, pushToast }) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(secret);

	useEffect(() => {
		setDraft(secret);
	}, [secret]);

	async function handleSave() {
		const next = draft.trim();
		if (!next) return;
		await onSave(provider, next);
		setEditing(false);
		pushToast("API key updated");
	}

	return (
		<div className="key-row">
			<span className="key-provider">{provider}</span>
			{editing ? (
				<input
					className="key-edit-input"
					type="password"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") void handleSave();
						if (event.key === "Escape") {
							setDraft(secret);
							setEditing(false);
						}
					}}
				/>
			) : (
				<span className="key-value">{maskKey(secret)}</span>
			)}
			<div className="key-actions">
				{editing ? (
					<>
						<button className="btn btn-icon" type="button" title="Save" onClick={() => void handleSave()}>
							<SaveIcon />
						</button>
						<button
							className="btn btn-icon"
							type="button"
							title="Cancel"
							onClick={() => {
								setDraft(secret);
								setEditing(false);
							}}
						>
							<CloseIcon />
						</button>
					</>
				) : (
					<>
						<button className="btn btn-icon" type="button" title="Edit" onClick={() => setEditing(true)}>
							<EditIcon />
						</button>
						<button
							className="btn btn-icon btn-danger"
							type="button"
							title="Delete"
							onClick={() => void onDelete(provider).then(() => pushToast("API key removed"))}
						>
							<DeleteIcon />
						</button>
					</>
				)}
			</div>
		</div>
	);
}

function SettingsApp() {
	const [activeTab, setActiveTab] = useState("about");
	const [appInfo, setAppInfo] = useState({
		name: "Infinite Monitor",
		description: "AI-powered dashboard builder",
		version: "—",
		platform: "—",
		nodeVersion: "—",
		electronVersion: "—",
	});
	const [apiKeys, setApiKeys] = useState({});
	const [theme, setTheme] = useState("dark");
	const [toast, setToast] = useState("");
	const [showAddForm, setShowAddForm] = useState(false);
	const [newProvider, setNewProvider] = useState("");
	const [newKey, setNewKey] = useState("");

	useEffect(() => {
		let mounted = true;
		let timeoutId = null;

		function pushToast(message) {
			setToast(message);
			if (timeoutId) window.clearTimeout(timeoutId);
			timeoutId = window.setTimeout(() => setToast(""), 2200);
		}

		Promise.all([window.settingsAPI.getAppInfo(), window.settingsAPI.getAll()])
			.then(([info, data]) => {
				if (!mounted) return;
				setAppInfo({
					name: info.name || "Infinite Monitor",
					description: info.description || "AI-powered dashboard builder",
					version: info.version || "—",
					platform: info.platform || "—",
					nodeVersion: info.nodeVersion || "—",
					electronVersion: info.electronVersion || "—",
				});
				setApiKeys(data.apiKeys || {});
				setTheme(data.theme || "dark");
			})
			.catch(() => {
				if (!mounted) return;
				pushToast("Could not load settings");
			});

		const unsubscribe = window.settingsAPI.onThemeChanged?.((nextTheme) => {
			if (mounted) setTheme(nextTheme || "dark");
		});

		return () => {
			mounted = false;
			if (timeoutId) window.clearTimeout(timeoutId);
			unsubscribe?.();
		};
	}, []);

	const orderedApiKeys = useMemo(
		() => Object.entries(apiKeys).sort(([left], [right]) => left.localeCompare(right)),
		[apiKeys],
	);

	function pushToast(message) {
		setToast(message);
		window.clearTimeout(window.__imSettingsToastTimer__);
		window.__imSettingsToastTimer__ = window.setTimeout(() => setToast(""), 2200);
	}

	async function saveApiKey(provider, secret) {
		await window.settingsAPI.setApiKey(provider, secret);
		setApiKeys((current) => ({ ...current, [provider]: secret }));
	}

	async function removeApiKey(provider) {
		await window.settingsAPI.removeApiKey(provider);
		setApiKeys((current) => {
			const next = { ...current };
			delete next[provider];
			return next;
		});
	}

	async function saveNewKey() {
		const provider = newProvider.trim().toLowerCase();
		const secret = newKey.trim();
		if (!provider || !secret) return;
		await saveApiKey(provider, secret);
		setNewProvider("");
		setNewKey("");
		setShowAddForm(false);
		pushToast("API key saved");
	}

	async function selectTheme(nextTheme) {
		await window.settingsAPI.setTheme(nextTheme);
		setTheme(nextTheme);
		pushToast("Theme updated");
	}

	return (
		<>
			<div className="titlebar">
				<span className="titlebar-text">Settings</span>
			</div>

			<div className="tabs">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						className={`tab-btn${activeTab === tab.id ? " active" : ""}`}
						type="button"
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.label}
					</button>
				))}
			</div>

			<div className="content">
				<div className={`panel${activeTab === "about" ? " active" : ""}`}>
					<div className="about-header">
						<div className="about-icon">
							<InfinityIcon />
						</div>
						<div>
							<div className="about-name">{appInfo.name}</div>
							<div className="about-desc">{appInfo.description}</div>
						</div>
					</div>

					<div className="section-label">App Info</div>
					<div className="info-grid">
						<div className="info-row">
							<span className="info-key">Version</span>
							<span className="info-val">v{appInfo.version}</span>
						</div>
						<div className="info-row">
							<span className="info-key">Platform</span>
							<span className="info-val">{appInfo.platform}</span>
						</div>
						<div className="info-row">
							<span className="info-key">Node</span>
							<span className="info-val">{appInfo.nodeVersion}</span>
						</div>
						<div className="info-row">
							<span className="info-key">Electron</span>
							<span className="info-val">{appInfo.electronVersion}</span>
						</div>
					</div>

					<button className="btn" type="button" onClick={() => window.settingsAPI.checkUpdates()}>
						<DownloadIcon />
						Check for Updates
					</button>

					<div style={{ marginTop: 20 }}>
						<div className="section-label">Support</div>
						<button
							className="btn"
							type="button"
							onClick={() => window.settingsAPI.openURL("https://buymeacoffee.com/farobox")}
							style={{
								background: "linear-gradient(135deg, #ff813f, #ff5f5f)",
								borderColor: "transparent",
								color: "#fff",
								fontWeight: 600,
							}}
						>
							<HeartIcon />
							Buy Me a Coffee
						</button>
					</div>
				</div>

				<div className={`panel${activeTab === "apikeys" ? " active" : ""}`}>
					<div className="section-label">Configured API Keys</div>
					<div className="key-list">
						{orderedApiKeys.length === 0 ? (
							<div className="key-empty">
								No API keys configured.
								<br />
								Add a key below to get started.
							</div>
						) : (
							orderedApiKeys.map(([provider, secret]) => (
								<KeyRow
									key={provider}
									provider={provider}
									secret={secret}
									onSave={saveApiKey}
									onDelete={removeApiKey}
									pushToast={pushToast}
								/>
							))
						)}
					</div>

					{showAddForm ? (
						<div className="add-key-form open">
							<div className="form-row">
								<label className="form-label">Provider</label>
								<input
									className="form-input"
									placeholder="e.g. openai, anthropic, google..."
									autoComplete="off"
									spellCheck="false"
									value={newProvider}
									onChange={(event) => setNewProvider(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") void saveNewKey();
									}}
								/>
							</div>
							<div className="form-row">
								<label className="form-label">API Key</label>
								<input
									className="form-input"
									type="password"
									placeholder="sk-..."
									autoComplete="off"
									spellCheck="false"
									value={newKey}
									onChange={(event) => setNewKey(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") void saveNewKey();
									}}
								/>
							</div>
							<div className="form-actions">
								<button
									className="btn"
									type="button"
									onClick={() => {
										setShowAddForm(false);
										setNewProvider("");
										setNewKey("");
									}}
								>
									Cancel
								</button>
								<button className="btn btn-primary" type="button" onClick={() => void saveNewKey()}>
									Save Key
								</button>
							</div>
						</div>
					) : null}

					<div style={{ marginTop: 12 }}>
						<button className="btn" type="button" onClick={() => setShowAddForm(true)}>
							<PlusIcon />
							Add API Key
						</button>
					</div>
				</div>

				<div className={`panel${activeTab === "appearance" ? " active" : ""}`}>
					<div className="section-label">Color Theme</div>
					<div className="theme-grid">
						{THEME_OPTIONS.map((option) => (
							<div
								key={option.id}
								className={`theme-card${theme === option.id ? " active" : ""}${option.disabled ? " disabled" : ""}`}
								data-theme={option.id}
								onClick={() => {
									if (!option.disabled) void selectTheme(option.id);
								}}
							>
								<div className={`theme-preview ${option.previewClass}`}></div>
								<div className="theme-name">{option.label}</div>
								{option.badge ? <span className="theme-soon">{option.badge}</span> : null}
								<div className="theme-check">
									<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
										<polyline points="20 6 9 17 4 12" />
									</svg>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>

			<div className={`toast${toast ? " show" : ""}`}>{toast}</div>
		</>
	);
}

createRoot(document.getElementById("root")).render(
	<StrictMode>
		<SettingsApp />
	</StrictMode>,
);