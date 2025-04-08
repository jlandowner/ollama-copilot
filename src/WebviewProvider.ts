import * as vscode from "vscode";
import { Logger } from "./log";
import { ChatManager } from "./ChatManager";
import { EXTENTION_EVENT_TYPES, WEBVIEW_ERROR_EVENT_TYPES, WEBVIEW_EVENT_TYPES } from "./webview/events";
import config from "./config";
import { COMMAND_ID, CONFIG, EXTENTION_ID, OWNER, MODEL_NOT_SET, VIEW_ID } from "./constants";
import { Attachment, equalAttachments, Message, newAttachment, newMessage, Role, lineRangeSuffix } from "./api";

export type EVENT_DATA = { type: string, value: any };

export class WebViewProvider implements vscode.WebviewViewProvider {
  private readonly context: vscode.ExtensionContext;
  private readonly logger: Logger;
  private readonly chatManager: ChatManager;
  private _view?: vscode.WebviewView;
  private _handlers: { [type: string]: (data: EVENT_DATA) => void } = {};
  
  private input: string = '';
  private attachments: Attachment[] = [];
  private thinking: boolean = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.logger = Logger.getLogger(context);
		this.chatManager = new ChatManager(context);
  }

  async init(): Promise<void> {
    await this.chatManager.loadHistory();
    this.registerCommands();

    // handle events from webview
		this.registerWebviewEventHandler(WEBVIEW_EVENT_TYPES.PostMessage, (data: EVENT_DATA) => {
      const messages = this.chatManager.currentChat.messages;
      try {
        this.thinking = true;
        const userMessage: Message = data.value;
        
        // Add attachments to system message
        if (this.attachments && this.attachments.length > 0) {
          const systemMessages = [];
          for (const att of this.attachments) {
            if (att.type === 'image') {
              if (userMessage.images) {
                userMessage.images.push(att.filePath);
              } else {
                userMessage.images = [att.filePath];
              }
            } else {
              systemMessages.push(newMessage({
                id: userMessage.id,
                role: Role.System,
                attachments: this.attachments,
                content: `User attached file.
File: ${att.fileName}${lineRangeSuffix(att)}
\`\`\`${att.ext}
${att.text}
\`\`\``}));
            }
            userMessage.content += `\n\n${this.attachments.map(att => `* ***${att.fileName}${lineRangeSuffix(att)}***`).join('\n')}`;
          }
          
          this.chatManager.updateChatMessages([...messages, ...systemMessages, userMessage]);
        } else {
          this.chatManager.updateChatMessages([...messages, userMessage]);
        }
        this.chatManager.save();
      } catch (e) {
        this.logger.exception(e, 'Error occuered in posting inputs');
      } finally {
        this.input = '';
        this.attachments = [];
      }
    });

    this.registerWebviewEventHandler(WEBVIEW_EVENT_TYPES.UpdateMessages, (data: EVENT_DATA) => {
      try {
        this.thinking = true;
        const messages = data.value;
        this.input = '';
        this.attachments = [];
        this.chatManager.updateChatMessages(messages);
        this.chatManager.save();
      } catch (e) {
        this.logger.exception(e, 'Error occuered in update messages');
      }
    });

    this.registerWebviewEventHandler(WEBVIEW_EVENT_TYPES.SyncInput, (data: EVENT_DATA) => { this.input = data.value; });

    this.registerWebviewEventHandler(WEBVIEW_EVENT_TYPES.Init, (_: EVENT_DATA) => {
      try {
        // input
        this.postMessageToWebview(EXTENTION_EVENT_TYPES.Input, this.input);
        
        // messages
        this.postMessageToWebview(EXTENTION_EVENT_TYPES.Messages, this.chatManager.currentChat.messages);
        this.webviewView.title = this.chatManager.currentChat.title;

        // attachments
        this.postMessageToWebview(EXTENTION_EVENT_TYPES.Attachments, this.attachments);

        // chat model
        const chatModel = config.get<string>(CONFIG.ChatModel, MODEL_NOT_SET);
        this.postMessageToWebview(EXTENTION_EVENT_TYPES.ChatModel, chatModel);

        // thinking
        this.postMessageToWebview(EXTENTION_EVENT_TYPES.Thinking, this.thinking);
      } catch (e) {
        this.logger.exception(e, 'Error occuered in webview initialization');
      }
    });

    this.registerWebviewEventHandler(WEBVIEW_EVENT_TYPES.AbortAskAssistant, (_: EVENT_DATA) => {
      this.chatManager.abortAskAssistant();
    });
      
    this.registerWebviewEventHandler(WEBVIEW_EVENT_TYPES.CopyClipboard, async (data: EVENT_DATA) => {
      await vscode.env.clipboard.writeText(data.value);
      this.logger.info(`copied to clipboard`, []);
    });

		this.registerWebviewEventHandler(WEBVIEW_EVENT_TYPES.Command, (data: EVENT_DATA) => {
      this.logger.debug(`${WEBVIEW_EVENT_TYPES.Command}: ${JSON.stringify(data)}`);
      vscode.commands.executeCommand(data.value);
    });

		this.registerWebviewEventHandler(WEBVIEW_EVENT_TYPES.Error, (data: EVENT_DATA) => {
      switch (data.value) {
        case WEBVIEW_ERROR_EVENT_TYPES.ModelNotSet:
          this.logger.error('Please select a chat model first.', [
            { label: 'Select Model', callback: () => vscode.commands.executeCommand(COMMAND_ID.SelectChatModel) },
          ]);
          break;
      }
    });

    this.registerWebviewEventHandler(WEBVIEW_EVENT_TYPES.ApplyCodeToEditor, (data: EVENT_DATA) => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(editor.document.uri, editor.selection, data.value, {
          needsConfirmation: true,
          label: 'Replace text',
          description: 'This will replace the first 5 characters of the file',
          iconPath: new vscode.ThemeIcon('edit')
        });
        vscode.workspace.applyEdit(edit);
      }
    });

    this.registerWebviewEventHandler(WEBVIEW_EVENT_TYPES.RunCommandInTerminal, async (data: EVENT_DATA) => {
      const input = (data.value as {language: string, content: string});
      const command = input.content.trim();
      if (command.length === 0) return;

      let approved = config.get<boolean>(CONFIG.ChatAutoApproval, false);
      if (!approved) {
        await this.logger.info(
          `Are you sure to run the following command in the terminal?\n\nCommand: "${command}"`,
          [
            { label: 'Yes', callback: () => approved = true },
            { label: 'Always', callback: () => {
              config.update(CONFIG.ChatAutoApproval, true);
              approved = true;
            } },
            { label: 'No', callback: () => approved = false },
          ],
        );
      }

      if (approved) {
        if (!['', 'bash', 'sh', 'zsh', 'fish', 'powershell', 'cmd', 'bat'].includes(input.language)) {
          const result =  await vscode.window.showWarningMessage(
            `This is "${input.language}" code and might not to be a command for terminal. Are you sure to execute the command in terminal?\n\nCommand: "${command}"`, { modal: true }, 'Yes', 'No');
          if (result !== 'Yes') {
            return;
          }
        }
        
        const terminals = vscode.window.terminals.filter((terminal) => terminal.name === EXTENTION_ID);
        const terminal = terminals.length === 1 ? terminals[0] : vscode.window.createTerminal(EXTENTION_ID);
        terminal.show();
        terminal.sendText(command, true);
      }
    });

    this.registerWebviewEventHandler(WEBVIEW_EVENT_TYPES.RemoveAttachment, async (data: EVENT_DATA) => {
      const index = data.value;
      if (index < 0 || index >= this.attachments.length) return;
      this.attachments.splice(index, 1);
      this.postMessageToWebview(EXTENTION_EVENT_TYPES.Attachments, this.attachments);
    });

    // notify chat updates to webview
		this.chatManager.registerUpdateChatCallback((messages: Message[]) => {
        this.postMessageToWebview(EXTENTION_EVENT_TYPES.Messages, messages);
        this.webviewView.title = this.chatManager.currentChat.title;
			}
		);
		this.chatManager.registerUpdateChatCallback(async (messages: Message[]) => {
				try {
					if (messages === undefined) return;
					const lastMessage = messages[messages.length - 1];
					if (lastMessage && lastMessage.role === 'user') {
						await this.chatManager.askAssistant(messages, lastMessage.id);
						this.webviewView.title = this.chatManager.currentChat.title;
					}
				} catch (e) {
          if (e instanceof Error && e.name === 'ResponseError') {
            // check error message is 'model "xxx" not found'
            if (e.message.match(/model ".+" not found/)) {
              this.logger.exception(e, 'Error occuerd in asking assistant', [
                { label: 'Pull', callback: () => vscode.commands.executeCommand(COMMAND_ID.PullModel, config.get(CONFIG.ChatModel)) },
                { label: 'Change Model', callback: () => vscode.commands.executeCommand(COMMAND_ID.SelectChatModel) },
              ]);
              return;
            }
          }
					this.logger.exception(e, 'Error occuerd in asking assistant', [
            { label: 'Setting', callback: () => vscode.commands.executeCommand(COMMAND_ID.Setting) },
          ]);
				}
			},
		);
    this.chatManager.registerFinishStreamingCallback(() => {
        try {
          this.thinking = false;
          this.postMessageToWebview(EXTENTION_EVENT_TYPES.Thinking, this.thinking);
        } catch (e) {
          this.logger.exception(e, 'Error occuerd in finish streaming');
        }
      },
    );
    
    // register selection change event handler
    this.context.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (!this.isInitialized()) return;
        // if (!this.webviewView.visible) return;

        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const selection = editor.selection;
        const filePath = editor.document.fileName;
        
        const selectionText = editor.document.getText(selection);
        const att: Attachment = newAttachment({type: "file", filePath});
        if (selectionText.length > 0) {
          const lineStart = selection.start.line + 1;
          const lineEnd = selection.end.line + 1;
          att.text = selectionText;
          att.lineStart = lineStart;
          att.lineEnd = lineEnd;

          const editorSelectAttIndex = this.attachments.findIndex((a) => a.lineEnd > 0);
          if (editorSelectAttIndex === -1) {
            this.attachments.push(att);
            this.postMessageToWebview(EXTENTION_EVENT_TYPES.Attachments, this.attachments);
          } else if (!equalAttachments(this.attachments[editorSelectAttIndex], att)) {
            this.attachments[editorSelectAttIndex] = att;
            this.postMessageToWebview(EXTENTION_EVENT_TYPES.Attachments, this.attachments);
          }
        } else {
          if (this.attachments.length > 0) {
            // remove editor selection attachments
            this.attachments = this.attachments.filter((a) => a.lineEnd === 0);
            this.postMessageToWebview(EXTENTION_EVENT_TYPES.Attachments, this.attachments);
          }
        }
      })
    );

    // register config change handler
    config.onChange(CONFIG.ChatModel, (value: string) => {
			this.postMessageToWebview(EXTENTION_EVENT_TYPES.ChatModel, value || MODEL_NOT_SET);
		});

    this.context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(VIEW_ID.Chat, this));
  }

  private registerCommands() {
    this.context.subscriptions.push(
			vscode.commands.registerCommand(COMMAND_ID.Setting, (id: string | undefined) => {
        vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${OWNER}.${EXTENTION_ID} ${id || ''}`,);
			}),

      vscode.commands.registerCommand(COMMAND_ID.AddAttachment, async () => {
        try {
          const quickPick = vscode.window.createQuickPick();
          quickPick.title = 'Ollama Copilot: Select an Attachment';
          quickPick.placeholder = 'Select an attachment';
          quickPick.items = [
            // { kind: vscode.QuickPickItemKind.Separator, label: 'git' },
            // { label: 'Git Diff', iconPath: new vscode.ThemeIcon('git-pull-request-new-changes') },
            { kind: vscode.QuickPickItemKind.Separator, label: 'terminal' },
            { label: 'Terminal Selection', iconPath: new vscode.ThemeIcon('terminal') },
            { label: 'Terminal History', iconPath: new vscode.ThemeIcon('terminal') },
            { kind: vscode.QuickPickItemKind.Separator, label: 'file' },
            { label: 'Pick Text File...', iconPath: new vscode.ThemeIcon('file') },
            // TODO: support image attachment
            // { label: 'Pick Image File...', iconPath: new vscode.ThemeIcon('file') },
          ];
          quickPick.onDidChangeSelection(selection => {
            if (selection.length !== 1) return;
            const selected = selection[0];
            switch (selected.label) {
              case 'Git Diff':
                this.attachGitDiff();
                break;
              case 'Terminal Selection':
                this.attachTerminal();
                break;
              case 'Terminal History':
                this.attachTerminal({all: true});
                break;
              case 'Pick Text File...':
                this.attachFile();
                break;
              case 'Pick Image File...':
                this.attachImage();
                break;
              }
            quickPick.dispose();
          });
          quickPick.show();
        } catch (e) {
          this.logger.exception(e, 'Error occurred in select an attachment');
        }
			}),
    );
  }

  private attachFile() {
    vscode.window.showOpenDialog().then(async (files) => {
      if (files) {
        for (const f of files) {
          const content = await vscode.workspace.fs.readFile(f).then((data) => {
            return new TextDecoder().decode(data);
          });
          this.attachments.push(newAttachment({type: "file", filePath: f.fsPath, text: content}));
        }
        this.postMessageToWebview(EXTENTION_EVENT_TYPES.Attachments, this.attachments);
      }
    });
  }

  private attachImage() {
    vscode.window.showOpenDialog({
      filters: { 'Images': ['png', 'jpg', 'jpeg', 'gif', 'bmp'] },
    }).then(async (files) => {
      if (files) {
        this.attachments.push(...files.map((f) => newAttachment({type: "image", filePath: f.fsPath})));
        this.postMessageToWebview(EXTENTION_EVENT_TYPES.Attachments, this.attachments);
      }
    });
  }

  private async attachGitDiff() {
    // TODO implement
  }

  private async attachTerminal(options?: {all?: boolean}) {
    const terminal = vscode.window.activeTerminal;
    if (!terminal) {
      this.logger.error('No terminal', []);
      return;
    }

    const beforeText = await vscode.env.clipboard.readText();
    if (beforeText.length > 0) {
      let proceed = true;
      await this.logger.info(`Clipboard will be overwrited. Are you sure to proceed termninal copy?`, [
        { label: 'OK', callback: () => proceed = true },
        { label: 'Cancel', callback: () => proceed = false },
      ]);
      if (!proceed) return;
      await vscode.env.clipboard.writeText('');
    }

    if (options?.all) {
      await vscode.commands.executeCommand('workbench.action.terminal.selectAll');
    }

    await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
    const res = await vscode.env.clipboard.readText();
    if (res.length === 0) {
      this.logger.error('No text is copied from terminal');
      return;
    }
    
    const termAtt = newAttachment({type: "terminal", filePath: '@terminal', text: res});
    const index = this.attachments.findIndex((a) => a.filePath === termAtt.filePath);
    if (index === -1) {
      this.attachments.push(termAtt);
    } else {
      this.attachments[index] = newAttachment(termAtt);
    }

    this.logger.debug(`Copied text from terminal: ${res}`);
    this.postMessageToWebview(EXTENTION_EVENT_TYPES.Attachments, this.attachments);

    await vscode.commands.executeCommand('workbench.action.terminal.clearSelection');
    await vscode.env.clipboard.writeText('');
  }

  public get webviewView(): vscode.WebviewView {
    if (!this._view) {
      throw new Error('webviewView is not ready yet');
    }
    return this._view;
  }

  public isInitialized(): boolean {
    return !!this._view;
  }

  public postMessageToWebview(type: string, value: any) {
    this.webviewView.webview.postMessage({ type, value });
  }

  public registerWebviewEventHandler(type: string, handler: (data: EVENT_DATA) => void) {
    this._handlers[type] = handler;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {

    this.logger.info("WebViewProvider.resolveWebView start");
    this._view = webviewView;

    const extUri = this.context.extensionUri;

    webviewView.webview.options = {
      enableScripts: true, // Allow scripts in the webview
      localResourceRoots: [ extUri ]
    };

    const scriptUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(extUri, 'out', 'webview', 'index.js'));
    const styleResetUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(extUri, 'media', 'reset.css'));
    const styleVSCodeUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(extUri, 'media', 'vscode.css'));
    const styleCodiconsUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(extUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    webviewView.webview.html = `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleResetUri}" rel="stylesheet">
        <link href="${styleVSCodeUri}" rel="stylesheet">
        <link href="${styleCodiconsUri}" rel="stylesheet" id="vscode-codicon-stylesheet">
        <title>WebView</title>
      </head>
      <body>
        <div id="root" />
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>
    `;

    // event dispatcher from webview
    this.context.subscriptions.push(
      webviewView.webview.onDidReceiveMessage(data => {
      this.logger.debug(`webviewView.webview.onDidReceiveMessage: ${JSON.stringify(data)}`);
      const handle = this._handlers[data.type];
      if (handle) handle(data);
    }));

    this.logger.info("WebViewProvider.resolveWebView done");
  }
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
