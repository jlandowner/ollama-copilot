import { Ollama } from "npm:ollama";
import { TextEncoder } from "node:util";

const ollama = new Ollama({
	// host: "http://localhost:11434",
	host: "https://ollama.jlandowner.dev",
});

async function main() {
	const prompt: string = await new Promise((resolve, reject) => {
		let data = '';
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', chunk => data += chunk);
		process.stdin.on('end', () => resolve(data));
		process.stdin.on('error', reject);
	});

	const res = await ollama.generate({
		model: "qwen2.5-coder",
		prompt: prompt,
		stream: true,
	});

	for await (const chunk of res) {
		process.stdout.write(new TextEncoder().encode(chunk.response));
	}
	console.log();
}

main().catch(console.error);
