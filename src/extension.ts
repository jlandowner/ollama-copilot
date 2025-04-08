import * as vscode from 'vscode';
import { WebViewProvider } from "./WebviewProvider";
import { Logger } from "./log";
import { COMMAND_ID, CONFIG } from "./constants";
import { CopilotInlineCompletionItemProvider } from './InlineCompletionItemProvider';
import config from './config';
import { StatusBar } from './StatusBar';

export async function activate(context: vscode.ExtensionContext) {
	console.log("Start activation Ollama Copilot");
	const logger = Logger.getLogger(context);
	try {
		// initialize sidebar webview
		const webViewProvider = new WebViewProvider(context);
		await webViewProvider.init();

		// register InlineCompletionItemProvider
		const isCodeCompletionEnabled = config.get(CONFIG.CodeCompletionEnable);
		if (isCodeCompletionEnabled) {
			const inlineCompletionProvider = new CopilotInlineCompletionItemProvider(context);
			await inlineCompletionProvider.init();
			
			// status bar
			const statusBar = new StatusBar(context);
			await statusBar.init();
		}

		// TODO: generate commit message
		context.subscriptions.push(
			vscode.commands.registerCommand(COMMAND_ID.GenerateCommitMessage, async () => {
				await new Promise(resolve => setTimeout(resolve, 3000));
				logger.warn('TODO: Gen commit message command executed');
			}),
		);

		// register configuration change event handler
		config.registerConfigChangeHandler(context);

	} catch(e) {
		logger.exception(e, 'Failed to activate extention');
	}
}

export function deactivate() {}
