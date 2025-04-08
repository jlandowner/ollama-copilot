# Ollama Copilot
Ollama-optimized AI coding assistant for All VSCode-compatible editors

## Features

- **Chat**: General chat view in side panel.
- **Explain/Fix/Generate**: Use workspace context in conversations, such as Files, Editors and Terminals.
- **Code Completion**: Auto Code completion. Just press `tab` and `tab`.
- **Full support for Ollama API**: Pulling a new model, customizing request parameters, caching a model on the server memory and so on.
- **For All VSCode-compatible environments**: Off course for VSCode Desktop but strongly aim for VSCode Server, [coder/code-server](https://github.com/coder/code-server), [gitpod-io/openvscode-server](https://github.com/gitpod-io/openvscode-server) etc.

## Installation

### Install via Marketplace (TODO: not yet)

- [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/)
- [Open VSX](https://open-vsx.org/).

### Install via VSIX

1. Download the `.vsix` file from the [releases page](https://github.com/jlandowner/ollama-copilot/releases).
2. Open Extensions view on the side of the VSCode window.
3. Select "Install from VSIX..." in the menu.
4. Navigate to the downloaded `.vsix` file and select it to install.

Alternatively, you can use the following command in the terminal:
```sh
code --install-extension path/to/ollama-copilot.vsix
```

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ollama-copilot.URL` | string | `http://localhost:11434` | URL for the Ollama server |
| `ollama-copilot.chat.model` | string | | Model name for chat. [Ollama Library](https://ollama.com/library) |
| `ollama-copilot.chat.systemPrompt` | string | `You are a helpful, respectful and honest coding assistant. Always reply using markdown. Be clear and concise, prioritizing brevity in your responses. For code refactoring, use markdown with appropriate code formatting.` | System prompt for chat |
| `ollama-copilot.chat.initialMessage` | string | `Hello! How can I assist you today?` | Initial message for chat |
| `ollama-copilot.chat.autoApproval` | boolean | `false` | Enable auto approval for command execution in terminal |
| `ollama-copilot.chat.ollamaOptions` | object | `{num_ctx: 4096}` | Chat API Options |
| `ollama-copilot.codeCompletion.enable` | boolean | `false` | Enable/Disable code completion |
| `ollama-copilot.codeCompletion.model` | string | | Model name for code completion. [Ollama Library](https://ollama.com/library) |
| `ollama-copilot.codeCompletion.filePattern` | string | `**` | A file glob pattern like `*.{ts,js}` that code completion will be enabled. `**` means all files. |
| `ollama-copilot.codeCompletion.typingDebounceDelayMillisecondsForAPICall` | number | `300` | Typing debounce delay in milliseconds for API call |
| `ollama-copilot.apiRequestConcurrency` | number | `5` | API request concurrency |

## Contributing

We welcome contributions from the community! To start developing, follow these steps:

1. Clone the repository.
2. Open the repository in VSCode:
	```sh
	code ollama-copilot
	```
3. Press `F5` to run the extension in development mode.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
