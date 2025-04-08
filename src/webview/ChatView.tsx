import React, { useState, useRef, useEffect, useCallback, PropsWithChildren, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus as dark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { vscode } from './vscode';
import { EXTENTION_EVENT_TYPES, WEBVIEW_ERROR_EVENT_TYPES, WEBVIEW_EVENT_TYPES } from './events';
import { COMMAND_ID, MODEL_NOT_SET } from '../constants';
import { Message, Attachment, Role, lineRangeSuffix, newMessage } from '../api';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

const MAX_HEIGHT = 300;

const isAtBottom = (element: HTMLDivElement) => {
  return element.scrollHeight - element.scrollTop <= element.clientHeight * 1.2;
};

const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [chatModel, setChatModel] = useState(MODEL_NOT_SET);
  const [showFroatingButton, setShowFroatingButton] = useState(false);

  // Handle the message inside the webview
  useEffect(() => {
    console.log('WEBVIEW: init use effect');

    const handleMessage = (event: MessageEvent) => {
      console.log('WEBVIEW: Received message from extension', event.data);
      switch (event.data.type) {
        case EXTENTION_EVENT_TYPES.Input:
          {
            setInput(event.data.value);
            break;
          }
        case EXTENTION_EVENT_TYPES.Messages:
          {
            setMessages(event.data.value as Message[]);
            break;
          }
        case EXTENTION_EVENT_TYPES.Attachments:
          {
            setAttachments(event.data.value as Attachment[]);
            break;
          }
        case EXTENTION_EVENT_TYPES.ChatModel:
          {
            setChatModel(event.data.value || MODEL_NOT_SET);
            break;
          }
        case EXTENTION_EVENT_TYPES.Thinking:
          {
            setThinking(event.data.value);
            break;
          }
      }
    };

    window.addEventListener('message', handleMessage);

    // Request the initial messages
    vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.Init });
   
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  useEffect(() => {
    // Scroll to the bottom of the chat messages
    if (chatMessagesRef.current && isAtBottom(chatMessagesRef.current)) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }

    // Show the scroll to bottom button when the user scrolls up
    const handleScroll = () => {
      if (chatMessagesRef.current) {
        setShowFroatingButton(!isAtBottom(chatMessagesRef.current));
      } else {
        setShowFroatingButton(false);
      }
    };
    handleScroll();
  
    if (chatMessagesRef.current) {
      chatMessagesRef.current.addEventListener('scroll', handleScroll);
    }
  
    return () => {
      if (chatMessagesRef.current) {
        chatMessagesRef.current.removeEventListener('scroll', handleScroll);
      }
    };
  }, [messages]);

  // Adjust the height of the textarea based on the content
  useEffect(() => {
    if (textareaRef.current) {
      const lineCount = textareaRef.current.value.split('\n').length;
      textareaRef.current.rows = lineCount;
    }
  }, [input]);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
      textarea.style.height = `${newHeight}px`;
      textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
    }
  }, []);

  // Adjust the height of the textarea when the input changes
  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const handleSend = () => {
    if (chatModel === MODEL_NOT_SET) {
      vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.Error, value: WEBVIEW_ERROR_EVENT_TYPES.ModelNotSet });
      return;
    }
    if (thinking) return;

    if (input.trim()) {
      setThinking(true);
      setInput('');
      setAttachments([]);

      const userMessage = newMessage({ role: Role.User, content: input.trim(), attachments });
      vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.PostMessage, value: userMessage });
    }
  };

  const handleCancel = () => {
    vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.AbortAskAssistant });
  };

  const handleRemoveUserMessage = (index: number) => {
    const userMessage = messages[index];
    if (userMessage.role !== 'user' || userMessage.id === '') return;
    const removedMessage = messages.filter(msg => msg.id !== userMessage.id);
    vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.UpdateMessages, value: removedMessage });
  };

  const handleRegenerate = () => {
    if (messages[messages.length - 1].role !== Role.Assistant) return;
    // remove the last assistant message.
    setThinking(true);
    vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.UpdateMessages, value: messages.slice(0, -1) });
  };


  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    } else {
      vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.SyncInput, value: e.currentTarget.value });
    }
  };

  const handleInputChanged = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.SyncInput, value: e.currentTarget.value });
  };

  const handleChatModelChange = () => {
    vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.Command, value: COMMAND_ID.SelectChatModel });
  };

  const handleAddAttachment = () => {
    vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.Command, value: COMMAND_ID.AddAttachment});
  };

  const handleRemoveAttachment = (index: number) => {
    vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.RemoveAttachment, value: index});
  };

  const scrollToBottom = () => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTo({
        top: chatMessagesRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-messages" ref={chatMessagesRef}>
        {messages
          .map((message, index) => (
            <>
              {message.role !== Role.System && (
                <div key={index} className={`message ${message.role} key-${index}`}>
                  <div className="message-header">
                    <h3 className="header-content">{message.role === Role.User ? '👤 You' : '🦙 Ollama'}</h3>
                    {message.role === Role.Assistant && message.model && <p className='message-header-model'>({message.model})</p>}
                    {!thinking && message.role === Role.User && (
                      <button onClick={() => handleRemoveUserMessage(index)} className="icon-button message-header-icon" aria-label="Remove">
                        <i className="codicon codicon-trash"></i>
                      </button>
                    )}
                    {!thinking && index === messages.length - 1 && message.role === Role.Assistant && messages[index - 1].role === Role.User && (
                      <button onClick={handleRegenerate} className="icon-button message-header-icon" aria-label="Regenerate">
                        <i className="codicon codicon-sync"></i>
                      </button>
                    )}
                  </div>
                  <div className="message-content">
                    <ReactMarkdown
                      rehypePlugins={[rehypeRaw, rehypeSanitize]}
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ children, ...props }) {
                          // inline code block
                          if (children && typeof children === 'string' && !children.includes('\n')) {
                            return <code>{children}</code>;
                          }
    
                          return <MultilineCodeBlock
                            messageRole={message.role}
                            attachments={message.attachments}
                            {...props}>
                              {children}
                          </MultilineCodeBlock>;
                        }
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </>
        ))}
        {showFroatingButton && (
          <button onClick={scrollToBottom} className="scroll-to-bottom-button" aria-label="Scroll to bottom">
            <i className="codicon codicon-arrow-down"></i>
          </button>
        )}
      </div>
      <div className="chat-input">
        <div className="chat-input-header">
          <div className='attachments'>
           {attachments.map((attachment, index) => (
              <div key={index} className='att'>
                <h5 className='filename'>{attachment.fileName}</h5>
                {attachment.lineStart > 0 && <p>{lineRangeSuffix(attachment)}</p>}
                <button onClick={() => handleRemoveAttachment(index)} className="icon-button remove-attachment" aria-label="Remove Attachment">
                  <i className="codicon codicon-close"></i>
                </button>
              </div>
            ))}
          </div>
          <div className='buttons'>
            <div className='model'>
              <a onClick={handleChatModelChange}>{chatModel}</a>
            </div>
            <button onClick={handleAddAttachment} className="icon-button add-attachment" aria-label="Add Attachment">
              <i className="codicon codicon-attach"></i>
            </button>
          </div>
        </div>
        <div className="chat-input-box">
          <textarea
            ref={textareaRef}
            rows={2}
            placeholder="Ask ollama..."
            value={input}
            onChange={handleInputChanged}
            onKeyPress={handleKeyPress}
            style={{ overflowY: 'hidden' }}
          />
          {thinking ? 
            <button onClick={handleCancel} className="icon-button send-button" aria-label="Cancel">
              <i className="codicon codicon-stop-circle"></i>
            </button>
            :
            <button onClick={handleSend} className="icon-button send-button" aria-label="Send message">
              <i className="codicon codicon-send"></i>
            </button>
          }
        </div>
      </div>
      {thinking && <style>{`
        :root {
          --angle: 45deg;
        }
        .key-${messages.length - 1} {
          border-image: conic-gradient(from var(--angle), #fff, var(--vscode-panel-border)) 1 stretch;
          animation: rotate 1s linear infinite;
        }
        @property --angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes rotate {
          from {
            --angle: 360deg;
          }
          to {
            --angle: 0deg;
          }
        }
      `}</style>}
      <style>{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 98vh;
        }
        .chat-messages {
          flex-grow: 1;
          overflow: auto;
        }
        .message {
          padding: 1vh 0;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        .message.user {
          background-color: var(--vscode-input-background);
        }
        .message-header {
          display: flex;
          flex-direction: row;
          margin: 0 1em;
          position: relative;
          align-items: center;
        }
        .message-header-icon {
          display: none;
          position: absolute;
          right: 0;
        }
        .message-header:hover .message-header-icon {
          display: inline-block;
        }
        .message-header-model {
          margin-left: 0.5em;
          color: var(--vscode-description-foreground);
        }
        .message-content {
          padding: 0.5em 0.5em 0 1em;
          overflow-x: auto;
          line-height: 1.5em;
        }
        .message-content pre {
          margin: 0;
          padding: 8px 4px 4px 4px;
          border-radius: 4px;
        }
        .chat-input {
          margin: 0 1em;
          position: relative;
        }
        .chat-input-header {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          margin: 0.5em 0 0.25em 0;
          align-items: flex-end;
          overflow: hidden;
        }
        .chat-input-header .attachments {
          margin-right: 1em;
          max-width: 50%;
        }
        .att {
          display: inline-flex;
          align-items: center;
          padding-left: 0.5em;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
          font-size: 90%;
          white-space: nowrap;
        }
        .filename {
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .chat-input-header .buttons {
          display: flex;
        }
        .model {
          padding: 4px;
          text-overflow: ellipsis;
        }
        .chat-input-box textarea {
          flex-grow: 1;
          resize: none;
          line-height: 1.3;
          padding: 8px 30px 8px 8px;
          max-height: 200px;
          overflow-y: auto;
        }
        .send-button {
          position: absolute;
          right: 1.0em;
          bottom: 0.5vh;
          padding: 0;
        }
        .scroll-to-bottom-button {
          position: fixed;
          right: 2.0em;
          bottom: 12.0vh;
          background-color: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: 1px solid var(--vscode-input-border);
          border-radius: 50%;
          padding: 7px;
          cursor: pointer;
        }
        .scroll-to-bottom-button:hover {
          background-color: var(--vscode-button-secondaryHoverBackground);
        }
      `}</style>
    </div>
  );
};

const MultilineCodeBlock: React.FC<{ messageRole?: Role, className?: string, attachments?: Attachment[], children: React.ReactNode }> = ({ messageRole, className, attachments, children, ...props }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isAssistant = useMemo(() => messageRole === Role.Assistant, [messageRole]);

  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  
  let fileName = '';
  let fileNameSuffix = '';
  if (messageRole === Role.System && attachments && attachments.length > 0) {
    fileName = attachments[0].fileName;
    fileNameSuffix = lineRangeSuffix(attachments[0]);
  }

  const copyToClipboard = (html: React.ReactNode) => {
    const content = getTextFromHighlightedElements(html as React.ReactElement[]);
    console.debug("WEBVIEW: copy", content);
    vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.CopyClipboard, value: content });
  };

  const applyCodeToEditor = (html: React.ReactNode) => {
    const content = getTextFromHighlightedElements(html as React.ReactElement[]);
    console.debug("WEBVIEW: apply code to editor", content);
  
    vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.ApplyCodeToEditor, value: content });
  };

  const runCommandInTerminal = (html: React.ReactNode) => {
    const content = getTextFromHighlightedElements(html as React.ReactElement[]);
    console.debug("WEBVIEW: run command in terminal", content);

    vscode.postMessage({ type: WEBVIEW_EVENT_TYPES.RunCommandInTerminal, value: {language, content} });
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <>
      <div className="code-block">
        <div className="code-block-header">
          <button onClick={toggleCollapse} className="icon-button code-collapse-button">
            <i className={`codicon codicon-chevron-${isCollapsed ? 'down' : 'up'}`}></i>
          </button>
          {language && (
          <span className='code-header-lang'>{language}</span>
          )}
          {fileName && <div className="filename">
            <h5>{fileName}</h5>
            {fileNameSuffix && <p>{fileNameSuffix}</p>}
          </div>}
        </div>
        {isAssistant && <div className="code-header">
          <button onClick={() => applyCodeToEditor(children)} className="icon-button code-copy-button">
            <i className="codicon codicon-git-pull-request-go-to-changes"></i>
          </button>
          <button onClick={() => runCommandInTerminal(children)} className="icon-button code-copy-button">
            <i className="codicon codicon-terminal"></i>
          </button>
          <button onClick={() => copyToClipboard(children)} className="icon-button code-copy-button">
            <i className="codicon codicon-copy"></i>
          </button>
        </div>}
        {!isCollapsed && (
          <SyntaxHighlighter PreTag="div" language={language} style={dark} customStyle={{ margin: 0, borderRadius: '4px' }}>
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        )}
        
      </div>
      <style>{`
        .code-block {
          position: relative;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
          width: 100%;
        }
        .code-block code {
          background-color: rgb(30, 30, 30);
        }
        .code-block-header {
          display: flex;
          flex-direction: row;
          align-items: center;
          padding: 0 0.5em;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
          font-size: 90%;
          white-space: nowrap;
        }
        .filename {
          display: flex;
          flex-direction: row;
          align-items: center;
          white-space: nowrap;
        }
        .code-header {
          display: flex;
          position: absolute;
          top: 0;
          right: 0;
          flex-direction: row;
          align-items: center;
        }
        .code-header-lang {
          padding: 0 4px 0 4px;
        }
      `}</style>
    </>
  );
};

function getTextFromHighlightedElements(elements: React.ReactElement[]): string {
  let content = '';

  function extract(elements: React.ReactElement[]) {
    for (const element of elements) {
      if (typeof element === 'string' || typeof element === 'number') {
        content += element;
      } else if (React.isValidElement<PropsWithChildren>(element)) {
        extract(element.props.children as React.ReactElement[]);
      } else {
        console.error('WEBVIEW: Unsupported element:', element);
      }
    }
  }

  extract(elements);
  return content;
}

export default ChatView;