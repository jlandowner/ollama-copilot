// deno-lint-ignore-file no-process-globals

const messages = [{ content: "You are a helpful, respectful and honest coding assistant. Always reply using markdown. Be clear and concise, prioritizing brevity in your responses.", role: "system" }];
const model = "phi4";
const ollamaUrl = "http://localhost:11434/api/chat";

console.log("Welcome to Ollama NO-DEPENDENCY CLI! Type 'help' for a list of commands. Start chatting!");

const helpMessage = `
Commands: exit, quit, q, help
`;

// eslint-disable-next-line no-constant-condition
while (true) {
	const input = prompt(">>>");
	if (input === null) break;
	if (input === "") continue;
	if (["exit", "quit", "q"].includes(input)) break;
	if (["help"].includes(input)) {
		process.stdout.write(helpMessage);
		continue;
	}

	messages.push({ content: input, role: "user" });

	const res = await fetch(ollamaUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ model: model, messages: messages, stream: true }),
	});
	if (res.status !== 200 || res.body === null) throw new Error("Failed to fetch response from Ollama");

	const jsonTransformer = new TransformStream({
		transform(chunk, controller) {
			const text = new TextDecoder().decode(chunk);
			controller.enqueue(JSON.parse(text));
		}
	});

	let output = "";
	const writer = new WritableStream({
		start() {
			process.stdout.write(`\n(${model}) `);
		},
		write(chunk) {
			const content = chunk.message.content;
			process.stdout.write(content);
			output += content;
		},
		close() {
			process.stdout.write("\n\n");
		}
	});

	await res.body.pipeThrough(jsonTransformer).pipeTo(writer);

	messages.push({ content: output, role: "assistant" });
}