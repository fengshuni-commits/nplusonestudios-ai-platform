import { describe, it, expect } from "vitest";

// Test the URL encoding logic used in DocumentPreviewModal
function encodeFileUrl(rawUrl: string): string {
  try {
    const parts = rawUrl.split("/");
    return parts.map((seg, i) => {
      if (i < 3) return seg;
      try {
        return encodeURIComponent(decodeURIComponent(seg));
      } catch {
        return encodeURIComponent(seg);
      }
    }).join("/");
  } catch {
    return rawUrl;
  }
}

function getFileType(url: string, fileName: string): string {
  const name = (fileName || url).toLowerCase();
  const ext = name.split("?")[0].split(".").pop() || "";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  if (["xls", "xlsx"].includes(ext)) return "excel";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  return "unsupported";
}

function buildOfficeViewerUrl(fileUrl: string): string {
  const encoded = encodeURIComponent(encodeFileUrl(fileUrl));
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encoded}`;
}

describe("DocumentPreviewModal - URL encoding", () => {
  it("should not modify already-encoded ASCII URLs", () => {
    const url = "https://cdn.example.com/files/report.pdf";
    expect(encodeFileUrl(url)).toBe(url);
  });

  it("should encode Chinese characters in URL path segments", () => {
    const url = "https://cdn.example.com/project-docs/1/abc-中文文件名.docx";
    const encoded = encodeFileUrl(url);
    expect(encoded).toContain("%E4%B8%AD%E6%96%87%E6%96%87%E4%BB%B6%E5%90%8D");
    expect(encoded).not.toContain("中文文件名");
  });

  it("should encode special characters like quotes and spaces", () => {
    const url = 'https://cdn.example.com/docs/abc-"数据要素 + AI".docx';
    const encoded = encodeFileUrl(url);
    expect(encoded).not.toContain('"');
    expect(encoded).not.toContain(" ");
  });

  it("should not double-encode already-encoded segments", () => {
    const url = "https://cdn.example.com/docs/abc-%E4%B8%AD%E6%96%87.docx";
    const encoded = encodeFileUrl(url);
    // Should remain the same since it's already encoded
    expect(encoded).toBe(url);
  });

  it("should preserve the protocol and domain", () => {
    const url = "https://d2xsxph8kpxj0f.cloudfront.net/path/中文.pdf";
    const encoded = encodeFileUrl(url);
    expect(encoded.startsWith("https://d2xsxph8kpxj0f.cloudfront.net/")).toBe(true);
  });
});

describe("DocumentPreviewModal - file type detection", () => {
  it("should detect PDF files", () => {
    expect(getFileType("https://cdn.example.com/file.pdf", "")).toBe("pdf");
    expect(getFileType("", "report.pdf")).toBe("pdf");
  });

  it("should detect Word files", () => {
    expect(getFileType("", "document.docx")).toBe("word");
    expect(getFileType("", "old-doc.doc")).toBe("word");
  });

  it("should detect PowerPoint files", () => {
    expect(getFileType("", "slides.pptx")).toBe("ppt");
    expect(getFileType("", "presentation.ppt")).toBe("ppt");
  });

  it("should detect Excel files", () => {
    expect(getFileType("", "data.xlsx")).toBe("excel");
    expect(getFileType("", "spreadsheet.xls")).toBe("excel");
  });

  it("should detect image files", () => {
    expect(getFileType("", "photo.jpg")).toBe("image");
    expect(getFileType("", "render.png")).toBe("image");
    expect(getFileType("", "animation.gif")).toBe("image");
  });

  it("should return unsupported for unknown types", () => {
    expect(getFileType("", "archive.zip")).toBe("unsupported");
    expect(getFileType("", "binary.exe")).toBe("unsupported");
    expect(getFileType("", "noextension")).toBe("unsupported");
  });

  it("should be case-insensitive", () => {
    expect(getFileType("", "REPORT.PDF")).toBe("pdf");
    expect(getFileType("", "Document.DOCX")).toBe("word");
  });
});

describe("DocumentPreviewModal - Office Online viewer URL", () => {
  it("should build a valid Office Online viewer URL", () => {
    const fileUrl = "https://cdn.example.com/docs/report.docx";
    const viewerUrl = buildOfficeViewerUrl(fileUrl);
    expect(viewerUrl.startsWith("https://view.officeapps.live.com/op/embed.aspx?src=")).toBe(true);
    expect(viewerUrl).toContain(encodeURIComponent(fileUrl));
  });

  it("should double-encode the file URL for Office Online", () => {
    const fileUrl = "https://cdn.example.com/docs/中文报告.docx";
    const viewerUrl = buildOfficeViewerUrl(fileUrl);
    // The Chinese chars should be double-encoded in the viewer URL
    expect(viewerUrl).not.toContain("中文报告");
    expect(viewerUrl.startsWith("https://view.officeapps.live.com")).toBe(true);
  });
});
