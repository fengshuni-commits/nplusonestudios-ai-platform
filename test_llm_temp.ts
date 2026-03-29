import "dotenv/config";
import { invokeLLM } from "./server/_core/llm";

async function main() {
  console.log("Testing LLM with json_schema...");
  try {
    const response = await invokeLLM({
      messages: [
        { role: "user", content: "Return JSON with ok=true" }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "test",
          strict: true,
          schema: {
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
            additionalProperties: false
          }
        }
      }
    });
    console.log("Response keys:", Object.keys(response));
    console.log("choices length:", response.choices?.length);
    if (response.choices?.[0]) {
      console.log("choices[0].message:", JSON.stringify(response.choices[0].message, null, 2));
    } else {
      console.log("Full response:", JSON.stringify(response, null, 2).slice(0, 800));
    }
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}
main();
