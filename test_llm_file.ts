import "dotenv/config";
import { invokeLLM } from "./server/_core/llm";

async function main() {
  console.log("Testing LLM with file_url...");
  // Use a publicly accessible PDF for testing
  const testUrl = "https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF1.pdf";
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a design analyst. Analyze the document and return JSON.",
        },
        {
          role: "user",
          content: [
            {
              type: "file_url" as const,
              file_url: { url: testUrl, mime_type: "application/pdf" as any },
            },
            { type: "text" as const, text: "Describe the design style in JSON." },
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
    console.log("choices length:", response.choices?.length);
    console.log("choices[0]:", JSON.stringify(response.choices?.[0]?.message?.content));
  } catch (e: any) {
    console.error("Error:", e.message?.slice(0, 300));
  }
}
main();
