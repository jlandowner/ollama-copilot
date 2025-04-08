const enum CONFIG {
	URL = 'URL',
	ChatModel = 'chat.model',
	ChatSystemPrompt = 'chat.systemPrompt',
	ChatInitialMessage = 'chat.initialMessage',
	ChatAutoApproval = 'chat.autoApproval',
	ChatOllamaOptions = 'chat.ollamaOptions',
	CodeCompletionEnable = 'codeCompletion.enable',
	CodeCompletionModel = 'codeCompletion.model',
	CodeCompletionFilePattern = 'codeCompletion.filePattern',
	CodeCompletionDebounceDelayMilliseconds = 'codeCompletion.typingDebounceDelayMillisecondsForApiCall',
	RequestConcurrency = 'apiRequestConcurrency',
}

const MODEL_NOT_SET = 'Unknown';

class ModelError extends Error {
	name: string = 'ModelError';
	constructor() {
		super('Model not set');
	}
}

const RESTART_EXTENTION_CONFIG_LIST = [
	CONFIG.CodeCompletionEnable,
	CONFIG.CodeCompletionFilePattern,
];

const enum COMMAND_ID {
	GenerateCommitMessage = 'ollama-copilot.generateCommitMessage',
	NewChat = 'ollama-copilot.newChat',
	History = 'ollama-copilot.history',
	Setting = 'ollama-copilot.setting',
	PullModel = 'ollama-copilot.pullModel',
	SelectChatModel = 'ollama-copilot.selectChatModel',
	SelectCodeCompletionModel = 'ollama-copilot.selectCodeCompletionModel',
	ClearCompletionCache = 'ollama-copilot.clearCompletionCache',
	AddAttachment = 'ollama-copilot.addAttachment',
}

const enum VIEW_ID {
	Chat = 'ollama-copilot.chat'
}

const EXTENTION_ID = 'ollama-copilot';

const OWNER = 'jlandowner';

export {
	CONFIG,
	RESTART_EXTENTION_CONFIG_LIST,
	COMMAND_ID,
	VIEW_ID,
	EXTENTION_ID,
	OWNER,
	MODEL_NOT_SET,
	ModelError,
};