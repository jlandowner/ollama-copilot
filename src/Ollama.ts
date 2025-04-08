import { Ollama, Message, GenerateRequest, Options as OllamaOptions } from 'ollama';
import * as vscode from 'vscode';
import { z } from "zod";
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Logger } from './log';
import { COMMAND_ID, CONFIG, MODEL_NOT_SET, ModelError } from './constants';
import config from './config';

export class OllamaClient {
  private static instance: OllamaClient | null = null;

  private readonly context: vscode.ExtensionContext;
  private readonly logger: Logger;
  private ollama: Ollama;
  private _requestConcurrencyBudget: number;
  private _chatOllamaOptions?: OllamaOptions;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.logger = Logger.getLogger(context);
    this.ollama = new Ollama({ host: config.get(CONFIG.URL) });
    this._requestConcurrencyBudget = config.get(CONFIG.RequestConcurrency) || 5;
  
    config.onChange<string>(CONFIG.URL, (value: string) => {
      this.logger.info("config changed");
      this.testConnection(value);
      this.ollama = new Ollama({ host: value });
    });

    config.onChange<string>(CONFIG.RequestConcurrency, (value: string) => {
      this._requestConcurrencyBudget = Number(value) || 5;
    });

    config.onChange<OllamaOptions>(CONFIG.ChatOllamaOptions, (value: OllamaOptions) => {
      this._chatOllamaOptions = value;
    });

    this.testConnection();
    
    this.updateStateAvailableModels();
    
    this.registerCommands();
  }

  public static getInstance(context: vscode.ExtensionContext): OllamaClient {
    if (!OllamaClient.instance) {
      OllamaClient.instance = new OllamaClient(context);
    }
    return OllamaClient.instance;
  }

  public getOllamaInstance(): Ollama {
    return this.ollama;
  }

  private registerCommands() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(COMMAND_ID.PullModel, async (arg: string | undefined) => {
        const modelName = arg || await vscode.window.showInputBox({
          placeHolder: 'Enter a model name to pull',
        });
        if (modelName) {
          this.pullModel(modelName);
        }
      }),
      vscode.commands.registerCommand(COMMAND_ID.SelectChatModel, async () => {
        try {
          const quickPick = vscode.window.createQuickPick();
          quickPick.title = 'Ollama Copilot: Select Chat Model';
          quickPick.placeholder = 'Select a model name';
          const currentModel = this.chatModel();
          const updateQuickPickItems = async () => {
            const models = await this.updateStateAvailableModels();
            if (models.length === 0) {
              this.logger.info('No available models.', [
                { label: 'Pull Model', callback: () => vscode.commands.executeCommand(COMMAND_ID.PullModel) },
              ]);
              return;
            }
            quickPick.items = [
              ...((currentModel && models.map(model => model.name).includes(currentModel)) ? [{ kind: vscode.QuickPickItemKind.Separator, label: 'current' }, { label: currentModel }] : []),
              ...models.filter(model => model.name !== currentModel).map(model => ({ label: model.name })),
            ];
          };
          await updateQuickPickItems();
          quickPick.onDidAccept(() => {
            if (quickPick.value) {
              this.logger.info(`Model "${quickPick.value}" is not found. Do you want to pull it?`, [
                { label: 'Pull', callback: () => this.pullModel(quickPick.value) },
              ]);
            }
          });
          quickPick.onDidChangeSelection(selection => {
            this.logger?.debug(JSON.stringify(selection[0]));
            if (selection[0].label) {
              this.setChatModel(selection[0].label);
            }
            quickPick.dispose();
          });
          quickPick.show();
        } catch (e) {
          this.logger.exception(e, 'Error occurred in select chat model');
        }
      }),
      vscode.commands.registerCommand(COMMAND_ID.SelectCodeCompletionModel, async () => {
        try {
          const quickPick = vscode.window.createQuickPick();
          quickPick.title = 'Ollama Copilot: Select Code Completion Model';
          quickPick.placeholder = 'Select a model name';
          let currentModel: string | undefined;
          try {
            currentModel = await this.codeCompletionModel();
          } catch (e) {
            this.logger.debug(`Error occurred in fetching code completion model: ${e}`);
          }
          const models = await this.updateStateAvailableModels();
          const updateQuickPickItems = async () => {
            if (models.length === 0) {
              this.logger.info('No available models.', [
                { label: 'Pull Model', callback: () => vscode.commands.executeCommand(COMMAND_ID.PullModel) },
              ]);
              return;
            }
            quickPick.items = [
              ...((currentModel && models.map(model => model.name).includes(currentModel)) ? [{ kind: vscode.QuickPickItemKind.Separator, label: 'current' }, { label: currentModel }] : []),
              ...models.filter(model => model.name !== currentModel).map(model => ({ label: model.name })),
            ];
          };
          await updateQuickPickItems();
          quickPick.onDidAccept(() => {
            if (quickPick.value) {
              this.logger.info(`Model "${quickPick.value}" is not found. Do you want to pull it?`, [
                { label: 'Pull', callback: () => this.pullModel(quickPick.value) },
              ]);
            }
          });
          quickPick.onDidChangeSelection(selection => {
            this.logger.debug(JSON.stringify(selection[0]));
            if (selection[0].label) {
              this.setCodeCompletionModel(selection[0].label);
            }
            quickPick.dispose();
          });
          quickPick.show();
        } catch (e) {
          this.logger.exception(e, 'Error occurred in select code completion model');
        }
      }),
    );
  }

  private tryConsumeRequestConcurrencyBudget() {
    if (this._requestConcurrencyBudget === 0) {
      throw new Error("request concurrency budget exceeded");
    }
    this._requestConcurrencyBudget--;
  }

  private async consumeRequestConcurrencyBudget() {
    if (this._requestConcurrencyBudget === 0) {
      // wait until the budget is available
      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (this._requestConcurrencyBudget > 0) {
            clearInterval(interval);
            resolve(undefined);
          }
        }, 500);
      });
    } 
    this._requestConcurrencyBudget--;
  }

  private releaseRequestConcurrencyBudget() {
    this._requestConcurrencyBudget++;
  }

  chatModel() {
    const model = config.get<string>(CONFIG.ChatModel);
    if (model === "" || model === MODEL_NOT_SET) {
      return MODEL_NOT_SET;
    }
    return model;
  }

  codeCompletionModel() {
    const model = config.get<string>(CONFIG.CodeCompletionModel);
    if (model === "" || model === MODEL_NOT_SET) {
      return MODEL_NOT_SET;
    }
    return model;
  }

  setChatModel(model: string) {
    config.update(CONFIG.ChatModel, model);
    this.loadModel(model);
  }

  setCodeCompletionModel(model: string) {
    config.update(CONFIG.CodeCompletionModel, model);
    this.loadModel(model);
  }

  private wrapError(e: any): any {
    if (e instanceof Error && e.name === 'TypeError') {
      const url = config.get(CONFIG.URL);
      return new Error(`Failed to connect ollama server: ${e} URL=${url}`);
    }
    return e;
  }

  private async loadModel(model: string) {
    if (model === "" || model === MODEL_NOT_SET) {
      throw new ModelError(); 
    }
    try {
      const res = await this.ollama.generate({
        model: model,
        prompt: "",
        keep_alive: 15 * 60,
      });
      // https://github.com/ollama/ollama/blob/v0.3.12/docs/api.md#load-a-model
      if (res.response === "" && res.done && res.done_reason === "load") {
        return;
      } else {
        throw new Error(`invalid response response=${res.response} done=${res.done} done_reason=${res.done_reason}`);
      }
    } catch(e) {
      this.logger.exception(this.wrapError(e), `Failed to load model '${model}'`, [
        { label: 'Pull', callback: () => vscode.commands.executeCommand(COMMAND_ID.PullModel, model) },
        { label: 'Change Model', callback: () => vscode.commands.executeCommand(COMMAND_ID.Setting, 'model') },
      ]);
    }
  }

  private async unloadModel(model: string) {
    try {
      const res = await this.ollama.generate({
        model: model,
        prompt: "",
        keep_alive: 0,
      });
      // https://github.com/ollama/ollama/blob/v0.3.12/docs/api.md#unload-a-model
      if (res.response === "" && res.done && res.done_reason === "unload") {
        return;
      } else {
        throw new Error(`invalid response: response=${res.response} done=${res.done} done_reason=${res.done_reason}`);
      }
    } catch(e) {
      this.logger.debug(`failed to unload model ${model}: ${e}`);
    }
  }

  async updateStateAvailableModels() {
    try {
      const res = await this.ollama.list();
      this.logger.info(`available models: ${JSON.stringify(res.models)}`);
      if (res.models.length === 0) {
        this.logger.info('No available models.', [
          { label: 'Pull Model', callback: () => vscode.commands.executeCommand(COMMAND_ID.PullModel) },
        ]);
      }
      return res.models;
    } catch(e) {
      throw this.wrapError(e);
    }
  }

  async pullModel(model: string) {
    try {
      const res = await this.ollama.pull({
        model: model,
        stream: true,
      });
      
      const progress = vscode.window.withProgress({
          title: `Pulling a model "${model}"`,
          cancellable: true,
          location: vscode.ProgressLocation.Notification,
        },
        async (progress, token) => {
          token.onCancellationRequested(() => res.abort());
          for await (const part of res) {
            progress.report({message: part.status});
          }
        });
      
      progress.then(
        () => { this.logger.info(`Successfully pulled "${model}"`, []); },
        (reason) => { this.logger.error(`Error occurred from ollama server. Failed to pull model "${model}": ${reason}`, [
          { label: 'Setting', callback: () => vscode.commands.executeCommand(COMMAND_ID.Setting, 'model') },
          { label: 'Browse Ollama Library', callback: () => vscode.env.openExternal(vscode.Uri.parse('https://ollama.com/library'))},
        ]); },
      );
    } catch(e) {
      throw this.wrapError(e);
    }
  }

  async testConnection(url?: string) {
    const ollamaURL = url || config.get(CONFIG.URL);

		this.logger.info(`configuration: "${CONFIG.URL}" = "${ollamaURL}"`);
		if (ollamaURL) {
      try {
        const res = await fetch(ollamaURL + "/");
        if (res.status !== 200) {
          throw new Error(`status is not OK: ${res.status}`);
        }
        this.logger.info(`test connection to ollama server OK: URL="${ollamaURL}" status=${res.status}`);

        await this.loadModel(this.chatModel());
      } catch(e) {
        if (e instanceof Error && e.name === 'ModelError') {
          this.logger.info(`Model is not configured. Select a model or pull new one`, [
            { label: 'Select Model', callback: () => vscode.commands.executeCommand(COMMAND_ID.SelectChatModel) },
            { label: 'Setting', callback: () => vscode.commands.executeCommand(COMMAND_ID.Setting, 'model') },
            { label: 'Pull Model', callback: () => vscode.commands.executeCommand(COMMAND_ID.PullModel) },
          ]);
        } else {
          this.logger.info(`Failed to test connect ollama server: URL="${ollamaURL}" error=${e}`, [
            { label: 'Setting', callback: () => vscode.commands.executeCommand(COMMAND_ID.Setting, CONFIG.URL) },
            { label: 'Install', callback: () => vscode.env.openExternal(vscode.Uri.parse('https://ollama.com/download')) },  
          ]);
        }
      }
		}
  }

  async chat(messages: Message[]) {
    this.logger.info(`chat request: ${JSON.stringify(messages)}`);
    await this.consumeRequestConcurrencyBudget();
    try {
      const response = await this.ollama.chat({
        model: this.chatModel(),
        messages: messages,
        stream: true,
        options: this._chatOllamaOptions,
      });
      return response;
    } catch(e) {
      throw this.wrapError(e);
    } finally {
      this.releaseRequestConcurrencyBudget();
    }
  }

  async generate(request: Omit<GenerateRequest, 'model'>, options?: {stream?: boolean}) {
    this.logger.info(`generate request: ${JSON.stringify(request)}`);
    await this.consumeRequestConcurrencyBudget();
    try {
      const response = await this.ollama.generate({
        ...request,
        model: this.chatModel(),
        // @ts-expect-error stream is optional
        stream: options?.stream || false,
      });
      return response;
    } catch(e) {
      throw this.wrapError(e);
    } finally {
      this.releaseRequestConcurrencyBudget();
    }
  }

  async codeComplete(args: {prefix: string, languageId: string, fileName: string, previousLines: string, gitDiff?: string, wait?: boolean}) {	
    const prompt = {
      prompt:
`<context>
<language>${args.languageId}</language>
<file-name>${args.fileName}</file-name>
<prefix>${args.prefix}</prefix>
${args.gitDiff ? `<git-diff>${args.gitDiff}</git-diff>` : ""}
<previous-lines>${args.previousLines}</previous-lines>
</context>

<task>
You are the backend for the VSCode Extension's code completion system.
Your response is passed to the VSCode API's InlineCompletionItem.
Complete the rest of the missing forward-only code.
Completions take into account a few lines of previous code, the 'git diff' result, and the filename, and suggest code that is most likely to come or that will accomplish what the developer wants to achieve.
The code must be valid code in the language and start with the prefix.

If you can think of multiple ideas, please submit multiple proposals.
If you have multiple proposals, please set the recommendation level to Priority (higher level takes priority. default: 1).
</task>

<example>
<language>go</language>
<current-line>rootC</current-line>
<expected-response>rootCmd.PersistentFlags().StringVar(&o.SnapshotExtension, "snapshot-extension", ".yaml", "file extension of snapshot files")</expected-response>
</example>
`,
      format: zodToJsonSchema(CodeCompletionResult),
    };
    // this.logger.debug('codeComplete prompt:', prompt.prompt);

    try {
      if (args.wait) {
        await this.consumeRequestConcurrencyBudget();
      } else {
        this.tryConsumeRequestConcurrencyBudget();
      }
      try {
        // @ts-expect-error zodToJsonSchema returns any
        const res = await this.ollama.generate({
          ...prompt,
          model: await this.codeCompletionModel(),
          stream: false,
        });
        this._requestConcurrencyBudget++;
  
        return CodeCompletionResult.parse(JSON.parse(res.response));

      } catch(e) {
        throw this.wrapError(e);
      } finally {
        this.releaseRequestConcurrencyBudget();
      }

    } catch (e) {
      this.logger.error(`Failed to provide inline completion items: ${e}`);
      return null;
    }
  }

  async mergeCodes(args: {prefix: string, subsequesce: string}) {	
    const prompt = {
      prompt:
`<task>
Concat the two piece of codes logically.
The first one is a prefix but it might not be perfect.
</task>
<first>${args.prefix}</first>
<second>${args.subsequesce}</second>`,
      format: zodToJsonSchema(CodeCompletionResult),
    };

    try {
      await this.consumeRequestConcurrencyBudget();
      try {
        // @ts-expect-error zodToJsonSchema returns any
        const res = await this.ollama.generate({
          ...prompt,
          model: await this.codeCompletionModel(),
          stream: false,
        });
  
        return MergeCodesResult.parse(JSON.parse(res.response));

      } catch(e) {
        throw this.wrapError(e);
      } finally {
        this.releaseRequestConcurrencyBudget();
      }

    } catch (e) {
      this.logger.error(`Failed to connect ollama: ${e}`);
      return null;
    }
  }

  async reweightSuggestions(args: {
    suggestions: {code: string, weight: number}[],
    languageId: string,
    fileName: string,
    previousLines: string,
    // subsequentialLines: string,
    // <subsequential-lines>${args.subsequentialLines}</subsequential-lines>
  }) {
    const prompt = {
      prompt:
`<context>
<language>${args.languageId}</language>
<file-name>${args.fileName}</file-name>
<previous-lines>${args.previousLines}</previous-lines>
</context>

<task>
You are the backend for the VSCode Extension's code completion system.
Your response is passed to the VSCode API's InlineCompletionItem.

Please order the suggestion list and modify the weight of each suggestion by most likely to be used.
Weight in the suggestion list is the priority and the higher weight means higher recommendations for developer.
</task>

<suggestion-list>
${JSON.stringify(args.suggestions)}
</suggestion-list>
`,
      format: zodToJsonSchema(ReweightSuggestionsResult),
    };
    // this.logger.debug('reweightSuggestions prompt:', prompt.prompt);

    try {
      await this.consumeRequestConcurrencyBudget();
      try {
        // @ts-expect-error zodToJsonSchema returns any
        const res = await this.ollama.generate({
          ...prompt,
          model: await this.codeCompletionModel(),
          stream: false,
        });
        return ReweightSuggestionsResult.parse(JSON.parse(res.response));
        
      } catch(e) {
        throw this.wrapError(e);
      } finally {
        this.releaseRequestConcurrencyBudget();
      }

    } catch (e) {
      this.logger.error(`Failed to connect ollama: ${e}`);
      return null;
    }
  }
}

const CodeCompletionResult = z.object({
	language: z.string(),
	suggestions: z.array(z.object({
    code: z.string(),
    priority: z.number(),
  })),
});

const MergeCodesResult = z.object({
	language: z.string(),
	mergedCode: z.string(),
});

const ReweightSuggestionsResult = z.object({
	suggestions: z.array(z.object({
    code: z.string(),
    weight: z.number(),
  })),
});
