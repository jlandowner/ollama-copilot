import * as vscode from 'vscode';

// LogLevelを文字列定数として定義
const LogLevel = {
	DEBUG: "DEBUG",
	INFO: "INFO",
	WARN: "WARN",
	ERROR: "ERROR"
};

type LogLevelType = typeof LogLevel[keyof typeof LogLevel];

type MessageButton = {
	label: string;
	callback: () => void;
};

const MessageButtonLabels = (buttons: MessageButton[]): string[] => {
	return buttons.map(v => v.label);
};

class Logger {
	private static instance: Logger | null = null;
	
	private outputChannel: vscode.OutputChannel;
	private logLevel: LogLevelType = LogLevel.INFO;

	private constructor(context: vscode.ExtensionContext) {
		this.outputChannel = vscode.window.createOutputChannel('Ollama Copilot');
		context.subscriptions.push(this.outputChannel);

		if (context.extensionMode === vscode.ExtensionMode.Development || context.extensionMode === vscode.ExtensionMode.Test) {
			console.log("DEBUG mode");
			this.logLevel = LogLevel.DEBUG;
		}
	}

	public static getLogger(context: vscode.ExtensionContext): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger(context);
		}
		return Logger.instance;
	}

	private getTimestamp(): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		const seconds = String(now.getSeconds()).padStart(2, '0');
		const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
		return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
	}

	private log(level: LogLevelType, message: string): void {
		if (level === LogLevel.DEBUG && this.logLevel !== LogLevel.DEBUG) {
			return;
		}
		
		const levelOrder = Object.values(LogLevel);
		if (levelOrder.indexOf(level) < levelOrder.indexOf(this.logLevel)) {
			return;
		}

		this.outputChannel.appendLine(`${this.getTimestamp()} [${level}] ${message}`);
		console.log(`${this.getTimestamp()} [${level}] ${message}`);
	}

	async info(message: string, buttons?: MessageButton[]): Promise<void> {
		this.log(LogLevel.INFO, message);
		if (buttons) {
			if (buttons.length === 0) {
				vscode.window.showInformationMessage(message);
			} else {
				const result = await vscode.window.showInformationMessage(message, ...MessageButtonLabels(buttons));
				const button = buttons.find((button) => button.label === result);
				if (button) {
					button.callback();
				}
			}
		}
	}

	async warn(message: string, buttons?: MessageButton[]): Promise<void> {
		this.log(LogLevel.WARN, message);
		if (buttons) {
			if (buttons.length === 0) {
				vscode.window.showWarningMessage(message);
			} else {
				const result = await vscode.window.showWarningMessage(message, ...MessageButtonLabels(buttons));
				const button = buttons.find((button) => button.label === result);
				if (button) {
					button.callback();
				}
			}
		}
	}

	async error(message: string, buttons?: MessageButton[]): Promise<void> {
		this.log(LogLevel.ERROR, message);
		if (buttons) {
			if (buttons.length === 0) {
				vscode.window.showErrorMessage(message);
			} else {
				const result = await vscode.window.showErrorMessage(message, ...MessageButtonLabels(buttons));
				const button = buttons.find((button) => button.label === result);
				if (button) {
					button.callback();
				}
			}
		}
	}

	debug(message: any, ...messages: any[]): void {
		if (this.logLevel === LogLevel.DEBUG) {
			console.log(`${this.getTimestamp()} [DEBUG] ${message}`, ...messages);
		}
	}

	async exception(e: any, message: string, buttons?: MessageButton[]) {
		console.error(`${message}: ${e}`);
		await this.error(`${message}: ${e}`, buttons || []);
	}
}

export { Logger };