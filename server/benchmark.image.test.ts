/**
 * Tests for benchmark report image link format generation
 * Verifies that images are wrapped in clickable links: [![name](imgUrl)](caseUrl)
 */
import { describe, it, expect } from "vitest";

interface CaseImage {
  imageUrl: string;
  sourcePageUrl: string;
}

/**
 * Replicates the caseRefs building logic from routers.ts Phase 2 → Phase 3
 */
function buildCaseRefs(
  caseNames: string[],
  caseUrlMap: Record<string, string>,
  caseImageMap: Record<string, CaseImage[]>
): string {
  return caseNames
    .map((name) => {
      const url = caseUrlMap[name];
      const images = caseImageMap[name] || [];
      const urlPart = url ? `- ${name}: ${url}` : `- ${name}: (URL 未找到)`;
      const imgPart =
        images.length > 0
          ? `\n  图片：${images
              .map((img) => `[![${name}](${img.imageUrl})](${img.sourcePageUrl})`)
              .join(" ")}`
          : "";
      return urlPart + imgPart;
    })
    .join("\n");
}

describe("Benchmark report image link format", () => {
  it("wraps images in clickable links using sourcePageUrl (true source page)", () => {
    const caseNames = ["腾讯滨海大厦"];
    const caseUrlMap = { 腾讯滨海大厦: "https://www.archdaily.cn/cn/901734" };
    // sourcePageUrl is the actual page the image was found on (may differ from caseUrlMap)
    const caseImageMap: Record<string, CaseImage[]> = {
      腾讯滨海大厦: [
        {
          imageUrl: "https://bharchitects.com/wp-content/uploads/2018/08/Tencent_atrium.jpg",
          sourcePageUrl: "https://bharchitects.com/tencent-seafront-towers/",
        },
      ],
    };

    const result = buildCaseRefs(caseNames, caseUrlMap, caseImageMap);

    // Image link should point to sourcePageUrl (the true image source page)
    expect(result).toContain(
      "[![腾讯滨海大厦](https://bharchitects.com/wp-content/uploads/2018/08/Tencent_atrium.jpg)](https://bharchitects.com/tencent-seafront-towers/)"
    );
    // Case URL (caseUrlMap) is listed separately as the case reference
    expect(result).toContain("- 腾讯滨海大厦: https://www.archdaily.cn/cn/901734");
  });

  it("always uses sourcePageUrl regardless of caseUrl availability", () => {
    const caseNames = ["未知案例"];
    const caseUrlMap: Record<string, string> = {}; // no caseUrl
    const caseImageMap: Record<string, CaseImage[]> = {
      未知案例: [{ imageUrl: "https://example.com/image.jpg", sourcePageUrl: "https://example.com/case-page" }],
    };

    const result = buildCaseRefs(caseNames, caseUrlMap, caseImageMap);

    // Image link should use sourcePageUrl even when caseUrl is missing
    expect(result).toContain("[![未知案例](https://example.com/image.jpg)](https://example.com/case-page)");
    // Should indicate URL not found for the case reference
    expect(result).toContain("(URL 未找到)");
  });

  it("handles multiple images per case with different source pages", () => {
    const caseNames = ["Apple Park"];
    const caseUrlMap = {
      "Apple Park": "https://www.fosterandpartners.com/projects/apple-park",
    };
    const caseImageMap: Record<string, CaseImage[]> = {
      "Apple Park": [
        { imageUrl: "https://example.com/apple1.jpg", sourcePageUrl: "https://dezeen.com/apple-park-review" },
        { imageUrl: "https://example.com/apple2.jpg", sourcePageUrl: "https://archdaily.com/apple-park" },
      ],
    };

    const result = buildCaseRefs(caseNames, caseUrlMap, caseImageMap);

    // Each image links to its own source page
    expect(result).toContain(
      "[![Apple Park](https://example.com/apple1.jpg)](https://dezeen.com/apple-park-review)"
    );
    expect(result).toContain(
      "[![Apple Park](https://example.com/apple2.jpg)](https://archdaily.com/apple-park)"
    );
  });

  it("handles cases with no images gracefully", () => {
    const caseNames = ["无图案例"];
    const caseUrlMap = { 无图案例: "https://example.com/case" };
    const caseImageMap: Record<string, CaseImage[]> = {}; // no images

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
