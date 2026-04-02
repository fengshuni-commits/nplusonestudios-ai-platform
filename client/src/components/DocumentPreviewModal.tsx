import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, X, Loader2, AlertCircle, ZoomIn, ZoomOut, RotateCw } from "lucide-react";

interface DocumentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  title: string;
}

// Detect file type from URL or filename
function getFileType(url: string, fileName: string): "pdf" | "word" | "ppt" | "excel" | "image" | "unsupported" {
  const name = (fileName || url).toLowerCase();
  const ext = name.split("?")[0].split(".").pop() || "";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  if (["xls", "xlsx"].includes(ext)) return "excel";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  return "unsupported";
}

// Build a properly encoded URL for use in iframes
function encodeFileUrl(rawUrl: string): string {
  try {
    // Split by "/" and encode each segment (skip protocol + domain)
    const parts = rawUrl.split("/");
    return parts.map((seg, i) => {
      if (i < 3) return seg; // https: + "" + domain
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

// Build Office Online Viewer URL for Word/PPT/Excel
function buildOfficeViewerUrl(fileUrl: string): string {
  const encoded = encodeURIComponent(encodeFileUrl(fileUrl));
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encoded}`;
}

export default function DocumentPreviewModal({
  open,
  onClose,
  fileUrl,
  fileName,
  title,
}: DocumentPreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pdfScale, setPdfScale] = useState(100);

  const fileType = getFileType(fileUrl, fileName);
  const encodedUrl = encodeFileUrl(fileUrl);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(false);
      setPdfScale(100);
    }
  }, [open, fileUrl]);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = encodedUrl;
    a.download = title || fileName || "document";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenExternal = () => {
    window.open(encodedUrl, "_blank");
  };

  const renderPreview = () => {
    if (fileType === "pdf") {
      return (
        <div className="relative flex-1 flex flex-col overflow-hidden">
          {/* PDF toolbar */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b shrink-0">
            <span className="text-xs text-muted-foreground">缩放</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setPdfScale(s => Math.max(50, s - 10))}
              disabled={pdfScale <= 50}
            >
              <ZoomOut className="h-3 w-3" />
            </Button>
            <span className="text-xs w-10 text-center">{pdfScale}%</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setPdfScale(s => Math.min(200, s + 10))}
              disabled={pdfScale >= 200}
            >
              <ZoomIn className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setPdfScale(100)}
              title="重置缩放"
            >
              <RotateCw className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto bg-gray-100 flex justify-center">
            <iframe
              key={`${fileUrl}-${pdfScale}`}
              src={`${encodedUrl}#zoom=${pdfScale}&toolbar=1&navpanes=0`}
              className="w-full h-full border-0"
              style={{ minHeight: "600px" }}
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true); }}
              title={title}
            />
          </div>
        </div>
      );
    }

    if (fileType === "word" || fileType === "ppt" || fileType === "excel") {
      const viewerUrl = buildOfficeViewerUrl(fileUrl);
      return (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-b border-amber-100 shrink-0">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-xs text-amber-700">
              通过 Microsoft Office Online 预览，需要网络连接。如预览失败，请点击右上角下载查看。
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe
              src={viewerUrl}
              className="w-full h-full border-0"
              style={{ minHeight: "600px" }}
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true); }}
              title={title}
              allowFullScreen
            />
          </div>
        </div>
      );
    }

    if (fileType === "image") {
      return (
        <div className="flex-1 flex items-center justify-center overflow-auto bg-gray-100 p-4">
          <img
            src={encodedUrl}
            alt={title}
            className="max-w-full max-h-full object-contain rounded shadow-sm"
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        </div>
      );
    }

    // Unsupported type
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground p-8">
        <AlertCircle className="h-12 w-12 text-muted-foreground/40" />
        <div className="text-center">
          <p className="text-sm font-medium">此文件格式暂不支持在线预览</p>
          <p className="text-xs mt-1">请下载后使用本地应用程序查看</p>
        </div>
        <Button onClick={handleDownload} className="gap-2">
          <Download className="h-4 w-4" />
          下载文件
        </Button>
      </div>
    );
  };

  const fileTypeLabel: Record<string, string> = {
    pdf: "PDF",
    word: "Word 文档",
    ppt: "演示文稿",
    excel: "表格",
    image: "图片",
    unsupported: "文件",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="flex flex-row items-center gap-3 px-4 py-3 border-b shrink-0">
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-sm font-semibold truncate">{title}</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{fileTypeLabel[fileType]} 预览</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleDownload}>
              <Download className="h-3 w-3" />
              下载
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleOpenExternal}>
              <ExternalLink className="h-3 w-3" />
              新窗口
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 top-[57px] flex items-center justify-center bg-background/80 z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">正在加载文档...</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground p-8">
            <AlertCircle className="h-12 w-12 text-destructive/40" />
            <div className="text-center">
              <p className="text-sm font-medium">文档加载失败</p>
              <p className="text-xs mt-1">可能是网络问题或文件格式不兼容，请尝试下载后查看</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setError(false); setLoading(true); }} className="gap-2">
                <RotateCw className="h-4 w-4" />
                重试
              </Button>
              <Button onClick={handleDownload} className="gap-2">
                <Download className="h-4 w-4" />
                下载文件
              </Button>
            </div>
          </div>
        )}

        {/* Preview area */}
        {!error && renderPreview()}
      </DialogContent>
    </Dialog>
  );
}
