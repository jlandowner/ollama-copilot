export const enum WEBVIEW_EVENT_TYPES {
	Init = 'ollama-copilot.init',
	UpdateMessages = 'ollama-copilot.update-messages',
	PostMessage = 'ollama-copilot.post-message',
	AbortAskAssistant = 'ollama-copilot.abort-ask-assistant',
	CopyClipboard = 'ollama-copilot.copy-clipboard',
	Command = 'ollama-copilot.command',
	Error = 'ollama-copilot.error',
	SyncInput = 'ollama-copilot.sync-input',
	ApplyCodeToEditor = 'ollama-copilot.apply-code-to-editor',
	RunCommandInTerminal = 'ollama-copilot.run-command-in-terminal',
	RemoveAttachment = 'ollama-copilot.remove-attachment',
}

export const enum WEBVIEW_ERROR_EVENT_TYPES {
	ModelNotSet = 'model-not-set',
}

export const enum EXTENTION_EVENT_TYPES {
	Input = 'ollama-copilot.input',
	Messages = 'ollama-copilot.messages',
	LastMessage = 'ollama-copilot.last-message',
	Attachments = 'ollama-copilot.attachments',
	ChatModel = 'ollama-copilot.chat-model',
	Thinking = 'ollama-copilot.thinking',
}
