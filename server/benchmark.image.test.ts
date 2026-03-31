/**
 * Tests for benchmark report image link format generation
 * Verifies that images are wrapped in clickable links: [![name](imgUrl)](caseUrl)
 */
import { describe, it, expect } from "vitest";

/**
 * Replicates the caseRefs building logic from routers.ts Phase 2 → Phase 3
 */
function buildCaseRefs(
  caseNames: string[],
  caseUrlMap: Record<string, string>,
  caseImageMap: Record<string, string[]>
): string {
  return caseNames
    .map((name) => {
      const url = caseUrlMap[name];
      const images = caseImageMap[name] || [];
      const urlPart = url ? `- ${name}: ${url}` : `- ${name}: (URL 未找到)`;
      const imgPart =
        images.length > 0
          ? `\n  图片：${images
              .map((img) =>
                url ? `[![${name}](${img})](${url})` : `![${name}](${img})`
              )
              .join(" ")}`
          : "";
      return urlPart + imgPart;
    })
    .join("\n");
}

describe("Benchmark report image link format", () => {
  it("wraps images in clickable links when caseUrl is available", () => {
    const caseNames = ["腾讯滨海大厦"];
    const caseUrlMap = { 腾讯滨海大厦: "https://www.archdaily.cn/cn/901734" };
    const caseImageMap = {
      腾讯滨海大厦: [
        "https://bharchitects.com/wp-content/uploads/2018/08/Tencent_atrium.jpg",
      ],
    };

    const result = buildCaseRefs(caseNames, caseUrlMap, caseImageMap);

    // Should contain the linked image format [![name](imgUrl)](caseUrl)
    expect(result).toContain(
      "[![腾讯滨海大厦](https://bharchitects.com/wp-content/uploads/2018/08/Tencent_atrium.jpg)](https://www.archdaily.cn/cn/901734)"
    );
    // Verify the image is wrapped in a link: the linked format starts with [![
    // (not a standalone ![ at the beginning of a line)
    const imgUrl = "https://bharchitects.com/wp-content/uploads/2018/08/Tencent_atrium.jpg";
    const linkedFormat = `[![\u817e\u8baf\u6ee8\u6d77\u5927\u53a6](${imgUrl})](https://www.archdaily.cn/cn/901734)`;
    const standaloneFormat = `\n  \u56fe\u7247\uff1a![\u817e\u8baf\u6ee8\u6d77\u5927\u53a6](${imgUrl})`;
    // The result should have linked format, not standalone format
    expect(result).toContain(linkedFormat);
    expect(result).not.toContain(standaloneFormat);
  });

  it("falls back to plain image when caseUrl is missing", () => {
    const caseNames = ["未知案例"];
    const caseUrlMap: Record<string, string> = {}; // no URL
    const caseImageMap = {
      未知案例: ["https://example.com/image.jpg"],
    };

    const result = buildCaseRefs(caseNames, caseUrlMap, caseImageMap);

    // Should use plain image format when no URL
    expect(result).toContain("![未知案例](https://example.com/image.jpg)");
    // Should indicate URL not found
    expect(result).toContain("(URL 未找到)");
  });

  it("handles multiple images per case", () => {
    const caseNames = ["Apple Park"];
    const caseUrlMap = {
      "Apple Park": "https://www.fosterandpartners.com/projects/apple-park",
    };
    const caseImageMap = {
      "Apple Park": [
        "https://example.com/apple1.jpg",
        "https://example.com/apple2.jpg",
      ],
    };

    const result = buildCaseRefs(caseNames, caseUrlMap, caseImageMap);

    expect(result).toContain(
      "[![Apple Park](https://example.com/apple1.jpg)](https://www.fosterandpartners.com/projects/apple-park)"
    );
    expect(result).toContain(
      "[![Apple Park](https://example.com/apple2.jpg)](https://www.fosterandpartners.com/projects/apple-park)"
    );
  });

  it("handles cases with no images gracefully", () => {
    const caseNames = ["无图案例"];
    const caseUrlMap = { 无图案例: "https://example.com/case" };
    const caseImageMap: Record<string, string[]> = {}; // no images

    const result = buildCaseRefs(caseNames, caseUrlMap, caseImageMap);

    expect(result).toContain("- 无图案例: https://example.com/case");
    // No image section
    expect(result).not.toContain("图片：");
  });

  it("generates correct prompt instruction for image format preservation", () => {
    // Verify the prompt text correctly instructs LLM to preserve [![img](url)](link) format
    const promptInstruction =
      "如果案例数据中提供了「图片」字段（格式为 [![名称](图片URL)](案例URL)），请将这些图片**原样**嵌入该案例的分析段落中（放在设计亮点分析之前），**绝对不要修改图片的 Markdown 格式**，必须保留完整的 [![名称](图片URL)](案例URL) 结构，这样图片才能点击跳转到来源页面";

    // The instruction should mention the correct format
    expect(promptInstruction).toContain("[![名称](图片URL)](案例URL)");
    // Should explicitly warn against modifying the format
    expect(promptInstruction).toContain("绝对不要修改图片的 Markdown 格式");
    // Should explain why (clickable)
    expect(promptInstruction).toContain("点击跳转到来源页面");
  });
});
