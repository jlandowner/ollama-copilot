type attachmentType = 'image' | 'file' | 'terminal';

interface Attachment {
	type: attachmentType,
	filePath: string;
	fileName: string;
	ext: string;
	text: string;
	lineStart: number;
	lineEnd: number;
}

function newAttachment(args: {type: attachmentType, filePath: string, text?: string, lineStart?: number, lineEnd?: number}): Attachment {
	return {
		type: args.type,
		filePath: args.filePath,
		fileName: args.filePath.split(/[/\\]/).pop() || '',
		ext: args.filePath.split('.').pop() || '',
		text: args.text || '',
		lineStart: args.lineStart || 0,
		lineEnd: args.lineEnd || 0,
	};
}

function lineRangeSuffix(att: Attachment): string {
	if (att.lineStart === 0 && att.lineEnd === 0) {
		return '';
	}
	if (att.lineStart === att.lineEnd) {
		return `:L${att.lineStart}`;
	}
	return `:L${att.lineStart}-L${att.lineEnd}`;
}

function equalAttachments(obj1: Attachment, obj2: Attachment): boolean {
	if (obj1 === obj2) {
		return true;
	}
	return obj1.filePath === obj2.filePath &&
		obj1.text === obj2.text &&
		obj1.lineStart === obj2.lineStart &&
		obj1.lineEnd === obj2.lineEnd;
}

const enum Role {
	User = 'user',
	Assistant = 'assistant',
	System = 'system',
}

interface Message {
	id: string;
	role: Role;
	content: string;
	timestamp: number;
	model?: string;
	attachments?: Attachment[]
	images?: string[];
}

function newMessage(args: {role: Role, content?: string, timestamp?: number, model?: string, attachments?: Attachment[], id?: string}): Message {
	return {
		id: args.id || globalThis.crypto.randomUUID().toString(),
		role: args.role,
		content: args.content || '',
		timestamp: args.timestamp || Date.now(),
		model: args.model,
		attachments: args.attachments,
	};
}

export {
	Attachment,
	newAttachment,
	equalAttachments,
	lineRangeSuffix,
	Message,
	newMessage,
	Role,
};