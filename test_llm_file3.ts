import "dotenv/config";
import { invokeLLM } from "./server/_core/llm";

async function main() {
  console.log("Testing LLM with 'file' type...");
  const testUrl = "https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF1.pdf";
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a design analyst." },
        {
          role: "user",
          content: [
            { type: "file" as any, file: { url: testUrl } },
            { type: "text" as const, text: "Describe the document briefly in JSON." },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "style",
          strict: true,
          schema: {
            type: "object",
            properties: { description: { type: "string" } },
            required: ["description"],
            additionalProperties: false
          }
        }
      }
    });
    console.log("FULL RESPONSE:", JSON.stringify(response, null, 2).slice(0, 800));
  } catch (e: any) {
    console.error("Error:", e.message?.slice(0, 500));
  }
}
main();
