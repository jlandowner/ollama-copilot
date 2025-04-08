import * as vscode from 'vscode';
import { COMMAND_ID, CONFIG } from './constants';
import { Logger } from './log';
import { OllamaClient } from './Ollama';
import config from './config';

export class StatusBar {
	private readonly context: vscode.ExtensionContext;
	private readonly logger: Logger;
	private readonly ollama: OllamaClient;
	private statusBarItem: vscode.StatusBarItem;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.logger = Logger.getLogger(context);
		this.ollama = OllamaClient.getInstance(context);
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.statusBarItem.command = COMMAND_ID.SelectCodeCompletionModel;
		this.statusBarItem.text = `$(alert) Unknown`;
		this.statusBarItem.text = `$(sparkle) ${this.ollama.codeCompletionModel()}`;
	}
	
	async init() {
		this.statusBarItem.show();
		// register config change handler
		config.onChange(CONFIG.CodeCompletionModel, (value: string) => {
			this.statusBarItem.text = `$(sparkle) ${value}`;
		});

		this.context.subscriptions.push(this.statusBarItem);
	}
}