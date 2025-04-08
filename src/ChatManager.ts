import { randomUUID } from "crypto";
import * as vscode from "vscode";
import { z } from "zod";
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Logger } from "./log";
import { OllamaClient } from './Ollama';
import { COMMAND_ID, CONFIG } from "./constants";
import { Message, newMessage, Role } from "./api";
import config from "./config";

export class Chat {
	readonly id: string;
	title: string;
	messages: Message[];

	constructor(args?: {id?: string, title?: string, messages?: Message[], lastTimestamp?: number}) {
		this.id = args?.id || randomUUID().toString();
		this.title = args?.title || "New chat";
		this.messages = args?.messages || [
			newMessage({ role: Role.System, content: config.get<string>(CONFIG.ChatSystemPrompt) }),
			newMessage({ role: Role.Assistant,  content: config.get<string>(CONFIG.ChatInitialMessage)}),
		];
	}

	set(messages: Message[]) {
		this.messages = messages;
	}

	lastTimestamp(): number {
		return this.messages[this.messages.length - 1].timestamp || Date.now();
	}

	lastTimestampString(): string {
		return new Date(this.lastTimestamp()).toLocaleString();
	}

	isInitialState(): boolean {
		return this.messages.filter((value: Message) => value.role === 'user').length === 0;
	}
}

const HISTORY_FILE = 'chat-history.json';
const CURRENT_CHAT_FILE = 'current-chat.json';

export class ChatManager {
	private readonly context: vscode.ExtensionContext;
	private readonly logger: Logger;
	private readonly ollama: OllamaClient;
	history: Chat[];
	currentChat: Chat;
	private updateChatCallbacks: ((messages: Message[]) => void)[];
	private finishStreamingCallbacks: ((messages: Message[]) => void)[];

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.ollama = OllamaClient.getInstance(context);
		this.logger = Logger.getLogger(context);

		this.history = [];
		this.currentChat = new Chat();
		this.updateChatCallbacks = [];
		this.finishStreamingCallbacks = [];

		this.registerCommands();
	}

	private registerCommands() {
		this.context.subscriptions.push(
			vscode.commands.registerCommand(COMMAND_ID.History, () => {
				try {
					const quickPick = vscode.window.createQuickPick();
					quickPick.title = 'History';
					quickPick.placeholder = 'Select a chat history';
					const updateQuickPickItems = () => {
						const historyItems = this.history
							.sort((a, b) => b.lastTimestamp() - a.lastTimestamp())
							.filter(chat => chat.id !== this.currentChat.id)
							.map(chat => ({
								label: chat.lastTimestampString(),
								description: chat.id,
								detail: chat.title,
								buttons: [{ iconPath: new vscode.ThemeIcon('trash') }]
							}));
						quickPick.items = [
							{ kind: vscode.QuickPickItemKind.Separator, label: 'current' },
							{ description: this.currentChat.id, detail: this.currentChat.title, label: this.currentChat.lastTimestampString() },
							...historyItems,
						];
					};
					updateQuickPickItems();
					quickPick.onDidChangeSelection(selection => {
						this.logger.debug(JSON.stringify(selection[0]));
						if (selection[0].description) this.changeCurrentChat(selection[0].description);
						quickPick.dispose();
					});
					quickPick.onDidTriggerItemButton(item => {
						if (item.item.description) {
							this.removeChatFromHistory(item.item.description);
							updateQuickPickItems();
						}
					});
					quickPick.show();

				} catch (e) {
					this.logger.exception(e, 'Error occuered in showing history');
				}
			}),
			vscode.commands.registerCommand(COMMAND_ID.NewChat, () => {
				try {
					this.newChat();
				} catch (e) {
					this.logger.exception(e, 'Error occuered in creating new chat');
				}
			}),
		);
	}

	public async loadHistory(): Promise<void> {
		this.currentChat = new Chat(await this.readJSONFileInUserStorage(CURRENT_CHAT_FILE));
		this.history = (await this.readJSONFileInUserStorage(HISTORY_FILE) || []).map((v: any) => new Chat(v));
	}

	save(): void {
		if (!this.currentChat.isInitialState()) {
			const i = this.history.findIndex(chat => chat.id=== this.currentChat.id);
			if (i > -1) {
				this.history[i] = this.currentChat;
			} else {
				this.history.push(this.currentChat);
			}
		}

		this.saveJSONFileInUserStorage(HISTORY_FILE, this.history);
		this.saveJSONFileInUserStorage(CURRENT_CHAT_FILE, this.currentChat);
	}

	private async readJSONFileInUserStorage(fileName: string): Promise<any> {
		const uri = vscode.Uri.file(this.context.globalStorageUri.fsPath + '/' + fileName);
		try {
			this.logger.info(`read file: ${uri.fsPath}`);
			const data = await vscode.workspace.fs.readFile(uri);
			return JSON.parse(data.toString());
		} catch (error) {
			if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
				this.logger.info(`File not found: ${uri.fsPath}`);
				return undefined;
			}
			this.logger.error(`Failed to read file: ${uri.fsPath}: ${error}`, []);
			return undefined;
		}
	}

	private async saveJSONFileInUserStorage(fileName: string, obj: any): Promise<void> {
		const uri = vscode.Uri.file(this.context.globalStorageUri.fsPath + '/' + fileName);
		try {
			this.logger.info(`saving file: ${uri.fsPath}`);
			const data = Buffer.from(JSON.stringify(obj, null, 2));
			await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
			await vscode.workspace.fs.writeFile(uri, data);
		} catch (error) {
			this.logger.exception(error, `Failed to save file: ${uri.fsPath}`);
		}
	}

	updateChatMessages(messages: Message[]): void {
		this.currentChat.set(messages);
		this.doUpdateChatCallbacks();
	}

	private doUpdateChatCallbacks(): void {
		for (const f of this.updateChatCallbacks) {
			f(this.currentChat.messages);
		}
	}

	registerUpdateChatCallback(callback: (messages: Message[]) => void): void {
		this.updateChatCallbacks.push(callback);
	}

	private doFinishStreamingCallbacks(): void {
		for (const f of this.finishStreamingCallbacks) {
			f(this.currentChat.messages);
		}
	}

	registerFinishStreamingCallback(callback: (messages: Message[]) => void): void {
		this.finishStreamingCallbacks.push(callback);
	}

	newChat(): void {
		this.save();
		this.currentChat = new Chat();
		this.doUpdateChatCallbacks();
	}

	get(id: string): Chat | undefined {
		return this.history.find(chat => chat.id === id);
	}

	changeCurrentChat(id: string): void {
		const newChat = this.get(id);
		if (!newChat) {
			console.error("Chat not found", id);
			return;
		}
		this.currentChat = newChat;
		this.doUpdateChatCallbacks();
		this.save();
	}

	removeChatFromHistory(id: string): void {
		this.history = this.history.filter(chat => chat.id !== id);
		this.save();
	}

	async askAssistant(messages: Message[], id: string): Promise<void> {
		messages.push(newMessage({ id, role: Role.Assistant, model: this.ollama.chatModel() }));
		try {
			const res = await this.ollama.chat(messages);
			for await (const part of res) {
				messages[messages.length - 1].content += part.message.content;
				this.updateChatMessages(messages);
			}
		} catch (e) {
			if (e instanceof Error && e.name === 'AbortError') {
				this.logger.info('Aborted');
				return;
			}
			messages[messages.length - 1].content = '🚨 Failed to get response from assistant';
			this.updateChatMessages(messages);
			throw e;
		} finally {
			this.doFinishStreamingCallbacks();
		}

		// update chat title
		await this.updateCurrentChatTitle();
		this.save();
	}

	abortAskAssistant() {
		this.ollama.getOllamaInstance().abort();
	}

	private async updateCurrentChatTitle(): Promise<string> {
		const res = await this.ollama.generate({
			prompt: `Generate a simple and understandable title of the conversation.
Just answer the title, without any quotes.
The title must be short and clear. It shouled be less than 100 characters, a single line(just title), plain text(not markdown).
It is better to be a title that can be used as a commit message.

Here is the current title. Now user added some messages and think the title should be updated.
Current title: ${this.currentChat.title}

If you think it is better to keep the current title, just answer the current title.

Here is the current conversation:
${JSON.stringify(this.currentChat.messages)}
`,
			// @ts-expect-error zodToJsonSchema returns any
			format: zodToJsonSchema(GenerateTitleResponse),
		});
		this.logger.info(`Generate title response: ${res.response}`);
		const generated =  GenerateTitleResponse.parse(JSON.parse(res.response));
		this.currentChat.title = generated.title;
		return this.currentChat.title;
	}
}

const GenerateTitleResponse = z.object({
	title: z.string(),
	isNotChangedFromCurrentTitle: z.boolean(),
});
