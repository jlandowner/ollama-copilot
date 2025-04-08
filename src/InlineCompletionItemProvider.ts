import * as vscode from 'vscode';
import { Logger } from './log';
import { RecommendationCache, Recommendation } from './RecommendationCache';
import { Debouncer } from './util';
import config from './config';
import { CONFIG } from './constants';

export class CopilotInlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {
	private readonly context: vscode.ExtensionContext;
	private readonly logger: Logger;
	private readonly recommendationCache: RecommendationCache;
	private readonly debouncer: Debouncer<any>;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.logger = Logger.getLogger(context);
		this.recommendationCache = new RecommendationCache(context);
		this.debouncer = new Debouncer(async (document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken) => {
			return await this._provideInlineCompletionItems(document, position, context, token);
		}, 300);
	}

	async init() {
		const filePattern = config.get<string>(CONFIG.CodeCompletionFilePattern);
		this.context.subscriptions.push(
			vscode.languages.registerInlineCompletionItemProvider({ pattern: filePattern }, this),
		);
	}

	async provideInlineCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.InlineCompletionContext,
		token: vscode.CancellationToken
	): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null | undefined> {
		const res = await this.debouncer.debounce(document, position, context, token);
		this.logger.debug(`🚀 provideInlineCompletionItems completionItem[2]: `, res);
		return res;
	}

	async _provideInlineCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.InlineCompletionContext,
		token: vscode.CancellationToken
	): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null | undefined> {
		this.logger.debug(`🚀 start provideInlineCompletionItems`);
		if (token.isCancellationRequested) return null;
		
		const prefix = document.lineAt(position).text.substring(0, position.character).trimStart();
		const isNewLineOrEndOfBlock = prefix === ""
			|| prefix.endsWith("}")
			|| prefix.endsWith(";");
		
		let recommendations = this.recommendationCache.getRecommendations({
			fileName: document.fileName,
			prefix,
		});
		// this.logger.debug(`🚀 provideInlineCompletionItems prefix: ${prefix}, recommendations:`, recommendations);

		if (recommendations.length === 0 || isNewLineOrEndOfBlock) {
			await this.recommendationCache.generateRecommendations({document, position, prefix, wait: true});
			recommendations = this.recommendationCache.getRecommendations({
				fileName: document.fileName,
				prefix,
				isNewLine: isNewLineOrEndOfBlock,
			});
		}

		if (recommendations.length === 0) {
			return null;
		}

		const completionItems = recommendations
			.sort((a: Recommendation, b: Recommendation) => a.weight - b.weight)
			.map((r) => {
				// remove the sufix of the completion
				const suffix = document.lineAt(position).text.substring(position.character);
				const completion = r.completion.replace(suffix, "");

				const completionItem = new vscode.InlineCompletionItem(completion);

				// use the current position of cursor to determine the range of the completion
				// get position from the editor instead of the parameter
				const newPosition = vscode.window.activeTextEditor?.selection.active || position;

				completionItem.range = new vscode.Range(position.translate(0, -prefix.length), newPosition);
				completionItem.command = { title: "ClearCache", command: "ollama-copilot.clearCompletionCache" };
				return completionItem;
		});
		this.logger.debug(`🚀 provideInlineCompletionItems completionItem[0]: `, completionItems[0]);

		return completionItems;
	}
}
