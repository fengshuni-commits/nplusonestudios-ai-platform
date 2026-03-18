import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, RotateCcw, Download, Play } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type VideoHistoryCardProps = {
  id: number;
  prompt: string;
  mode: "text-to-video" | "image-to-video";
  duration: number;
  status: "pending" | "processing" | "completed" | "failed" | null;
  outputVideoUrl?: string;
  errorMessage?: string;
  createdAt?: Date;
  onDelete?: () => void;
  onRegenerate?: () => void;
};

export function VideoHistoryCard({
  id,
  prompt,
  mode,
  duration,
  status,
  outputVideoUrl,
  errorMessage,
  createdAt,
  onDelete,
  onRegenerate,
}: VideoHistoryCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const deleteVideo = trpc.video.delete.useMutation({
    onSuccess: () => {
      toast.success("视频已删除");
      onDelete?.();
    },
    onError: () => {
      toast.error("删除失败");
      setIsDeleting(false);
    },
  });

  const regenerateVideo = trpc.video.regenerate.useMutation({
    onSuccess: () => {
      toast.success("视频重新生成中");
      onRegenerate?.();
      setIsRegenerating(false);
    },
    onError: () => {
      toast.error("重新生成失败");
      setIsRegenerating(false);
    },
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    await deleteVideo.mutateAsync({ id });
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    await regenerateVideo.mutateAsync({ id });
  };

  const handleDownload = () => {
    if (outputVideoUrl) {
      const a = document.createElement("a");
      a.href = outputVideoUrl;
      a.download = `video-${id}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const getStatusColor = (s: string | null | undefined) => {
    switch (s) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (s: string | null | undefined) => {
    switch (s) {
      case "completed":
        return "已完成";
      case "processing":
        return "处理中";
      case "pending":
        return "待处理";
      case "failed":
        return "失败";
      default:
        return "未知";
    }
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <CardContent className="p-0">
        {/* 视频预览区域 */}
        <div className="relative w-full aspect-video bg-gray-900 flex items-center justify-center overflow-hidden group">
          {outputVideoUrl && status === "completed" ? (
            <>
              <video
                src={outputVideoUrl}
                className="w-full h-full object-cover"
                onMouseEnter={() => setShowPreview(true)}
                onMouseLeave={() => setShowPreview(false)}
              />
              {showPreview && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute inset-0 m-auto bg-black/50 hover:bg-black/70 text-white rounded-full"
                  onClick={() => window.open(outputVideoUrl, "_blank")}
                >
                  <Play className="h-6 w-6" />
                </Button>
              )}
            </>
          ) : (
            <div className="text-center text-gray-400">
              {status === "processing" && <p>生成中...</p>}
              {status === "failed" && <p>生成失败</p>}
              {status === "pending" && <p>待处理</p>}
              {!outputVideoUrl && status === "completed" && <p>无视频</p>}
            </div>
          )}
        </div>

        {/* 信息区域 */}
        <div className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{prompt}</p>
              <p className="text-xs text-gray-500 mt-1">
                {mode === "text-to-video" ? "文生视频" : "图生视频"} · {duration}秒
              </p>
            </div>
            <Badge className={getStatusColor(status)}>{getStatusLabel(status)}</Badge>
          </div>

          {errorMessage && (
            <p className="text-xs text-red-600 bg-red-50 p-1.5 rounded">{errorMessage}</p>
          )}

          {createdAt && (
            <p className="text-xs text-gray-400">
              {new Date(createdAt).toLocaleString("zh-CN")}
            </p>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-2">
            {outputVideoUrl && status === "completed" && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs"
                onClick={handleDownload}
              >
                <Download className="h-3 w-3 mr-1" />
                下载
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs"
              onClick={handleRegenerate}
              disabled={isRegenerating}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              {isRegenerating ? "重新生成中..." : "重新生成"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs text-red-600 hover:text-red-700"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              {isDeleting ? "删除中..." : "删除"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
