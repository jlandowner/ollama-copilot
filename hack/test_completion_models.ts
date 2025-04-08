import { Ollama } from "ollama";

const models = [
	"qwen2.5-coder:7b",
	"deepseek-coder-v2:16b",
	"codegemma:7b",
	"codellama:13b",
	"starcoder2:7b",
	"yi-coder:9b",
	"codestral:22b",
];

function extractUniquePartIndex(str1: string, str2: string): number {
	for (let i = 0; i < str2.length; i++) {
		const matchingIndex = str1.indexOf(str2.slice(0, i));
		if (matchingIndex === -1) {
			const str1tail = str1.slice(str1.length - (i - 1), str1.length);
			const str2head = str2.slice(0, i - 1);
			if (str1tail === str2head) {
				return i - 1 < 0 ? 0 : i - 1;
			} else {
				return 0;
			}
		}
	}
	return 0;
}

function extractUniquePart(str1: string, str2: string): string {
	const result = str2.slice(extractUniquePartIndex(str1, str2), str2.length);
	return result;
}

function removeCodeBlock(str: string): string {
	return str.replace(/```/g, "");
}


const ollama = new Ollama({
	host: "http://localhost:11434",
});

for (const model of models) {
	console.log("*---", model, "---*");
	const res2 = await ollama.generate({
		model: model,
		prompt: "const add = (a, b: number) => a + b;\n\nconst sub ",
		system: `* You are a highly skilled programmer.
* You are expected to guess and complete the missing code in line or suggest a text that should come next at the cursor position.
* Just answer the suggested code
* Not markdown format
* Not including line separator
* Without any quotes.
* Without any example usage. just answer the suggested code.
* If the previous line is a comment, please suggest code that follows the instructions in the comment.
* If it seems to be the end of line, you don't need to suggest anything.

* File name: math.ts
`,
	});
	console.log(res2["response"]);
	console.log("------");
	console.log(extractUniquePart(removeCodeBlock(res2["response"]), "const add = (a, b: number) => a + b;\n\nconst sub "));
}