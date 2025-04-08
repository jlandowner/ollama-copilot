import * as vscode from 'vscode';
import { OllamaClient } from './Ollama';
import { Logger } from './log';
import { COMMAND_ID } from './constants';
import { exec } from 'child_process';
import path from 'path';
import { Debouncer } from './util';

export interface Recommendation {
	fileName: string;
	completion: string;
	weight: number;
	isNewLine?: boolean;
}

export class RecommendationCache {
	private readonly context: vscode.ExtensionContext;
	private readonly logger: Logger;
	private readonly ollama: OllamaClient;
	private cache: Recommendation[];

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.logger = Logger.getLogger(context);
		this.ollama = OllamaClient.getInstance(context);
		this.cache = context.workspaceState.get<Recommendation[]>('ollama-copilot.recommendation-cache') || [];

		context.subscriptions.push(
			vscode.commands.registerCommand(COMMAND_ID.ClearCompletionCache, () => {
				this.cache = [];
			})
		);

		// register keystroke handler
		const generateRecommendationsDebouncer = new Debouncer(async (document: vscode.TextDocument, position: vscode.Position, prefix: string) => {
			await this.generateRecommendations({document, position, prefix});
		}, 500);
		context.subscriptions.push(
			vscode.workspace.onDidChangeTextDocument(async (event) => {
				const editor = vscode.window.activeTextEditor;
				if (!editor) return;

				const document = editor.document;
				let position = editor.selection.active;
				let prefix = document.lineAt(position.line).text;

				// if the key is enter, prefix is empty
				this.logger.debug('🎹 event.contentChanges.text', event.contentChanges.map(v => v.text), 'position', position.line, 'prefix', prefix);
				if (event.contentChanges.length === 1 && event.contentChanges[0].text === '\n') {
					prefix = '';
					position = position.with(position.line + 1, 0);
				}

				// if the key is backsnace, not trigger generateRecommendations
				if (event.contentChanges.length === 1 && event.contentChanges[0].text === '' && event.contentChanges[0].rangeLength === 1) {
					this.logger.debug('🎹 backspace');
					return;
				}

				await generateRecommendationsDebouncer.debounce(document, position, prefix);
			})
		);
	}

	getRecommendations(args: {fileName: string, prefix: string, isNewLine?: boolean}): Recommendation[] {
		const recommendations = this.cache.filter((value) => {
			return value.fileName === args.fileName
				&& Boolean(value.isNewLine) === Boolean(args.isNewLine)
				&& value.completion.startsWith(args.prefix);
		}).map((value) => {
			return value;
		});
		return recommendations;
	}

	save(): void {
		this.context.workspaceState.update('ollama-copilot.recommendation-cache', this.cache);
	}

	async generateRecommendations(args: {
		document: vscode.TextDocument,
		position: vscode.Position,
		prefix: string,
		wait?: boolean,
	}): Promise<void> {
		const { document, position, prefix, wait } = args;
		this.logger.debug(`🚨 start generateRecommendations args:`, args);

		try {
			const languageId = document.languageId;
			const N = 5;
			const startLine = Math.max(0, position.line - N); // Ensure startLine is non-negative
			const previousLines = document.getText(new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(position.line, 0)));
			const gitDiff = await this.getGitDiff(document.fileName);

			let result = null;
			const isNewLine = prefix === "";
			result = await this.ollama.codeComplete({
				prefix,
				languageId,
				fileName: path.basename(document.fileName),
				previousLines: previousLines,
				gitDiff,
				wait,
			});

			if (result === null) return;

			for (const item of result.suggestions) {
				const completion = isNewLine
					? await this.completeTextMustStartWithPrefix(prefix, removeCodeBlockSyntax(item.code).trim())
					: item.code;
				if (completion === "") continue;
				if (completion === prefix) continue;
				if (!completion.startsWith(prefix)) continue;
				
				this.logger.debug(`✅ store cache: ${completion}`, `cache:`, this.cache);
				const i = this.cache.findIndex((cache) => cache.fileName === document.fileName && cache.completion === completion);
				if (i > 0) {
					const previousWeight = this.cache[i].weight;
					this.cache[i] = {
						fileName: document.fileName,
						completion: completion,
						weight: previousWeight + 1,
						isNewLine: isNewLine,
					};
				} else {
					this.cache.unshift({
						fileName: document.fileName,
						completion: completion,
						weight: 1,
						isNewLine: isNewLine,
					});
				}
			}

			const res = await this.ollama.reweightSuggestions({
				suggestions: this.cache.map((c) => {
					return {code: c.completion, weight: c.weight};
				}),
				languageId,
				fileName: path.basename(document.fileName),
				previousLines,
				// subsequentialLines,
			});
			if (res === null) return;
			this.cache = res.suggestions.map((s) => {
				return {
					fileName: document.fileName,
					completion: s.code,
					weight: s.weight,
					isNewLine: this.cache.find((c) => c.completion === s.code)?.isNewLine,
				};
			});
			
		} catch (e) {
			this.logger.debug(`❌ generateRecommendations error:`, e);
			return;
		}
	}

	async completeTextMustStartWithPrefix(prefix: string, text: string): Promise<string> {
		if (text.startsWith(prefix)) return text;
		const res = await this.ollama.mergeCodes({prefix, subsequesce: text});
		return res?.mergedCode || "";
	}

	// get current file's git diff using git command
	async getGitDiff(fileName: string): Promise<string | undefined> {
		const dirPath = path.dirname(fileName);
		return new Promise((resolve, reject) => {
			exec(`bash -c 'cd ${dirPath}; git diff ${fileName}'`, (error, stdout, stderr) => {
				if (error) {
					return resolve(undefined);
				}
				if (stderr) {
					return resolve(undefined);
				}
				return resolve(stdout);
			});
		});
	}
	
}

export function removeCodeBlockSyntax(text: string): string {
	return text.replace(/```.*\n/g, "").replace(/```/g, "");
}
