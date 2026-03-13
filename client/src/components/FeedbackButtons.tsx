import { useState } from "react";
import { ThumbsUp, ThumbsDown, MessageSquare, X, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface FeedbackButtonsProps {
  module: string;
  historyId?: number;
  contextJson?: any;
  /** Compact mode: smaller buttons, inline layout */
  compact?: boolean;
}

export function FeedbackButtons({ module, historyId, contextJson, compact = false }: FeedbackButtonsProps) {

  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");

  // Query existing feedback if historyId is provided
  const { data: existingFeedback, refetch } = trpc.feedback.getByHistoryId.useQuery(
    { historyId: historyId! },
    { enabled: !!historyId }
  );

  const submitMutation = trpc.feedback.submit.useMutation({
    onSuccess: (result) => {
      refetch();
      setShowComment(false);
      setComment("");
      toast.success(result.updated ? "反馈已更新" : "感谢反馈，您的评价将帮助我们改进平台");
    },
    onError: () => {
      toast.error("提交失败，请稍后重试");
    },
  });

  const currentRating = existingFeedback?.rating;

  const handleRate = (rating: "satisfied" | "unsatisfied") => {
    if (rating === "unsatisfied" && !showComment && !currentRating) {
      // Show comment box for unsatisfied first time
      setShowComment(true);
      return;
    }
    submitMutation.mutate({
      module,
      historyId,
      rating,
      comment: comment || undefined,
      contextJson,
    });
  };

  const handleSubmitWithComment = () => {
    submitMutation.mutate({
      module,
      historyId,
      rating: "unsatisfied",
      comment: comment || undefined,
      contextJson,
    });
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleRate("satisfied")}
          disabled={submitMutation.isPending}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
            currentRating === "satisfied"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
          }`}
          title="满意"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => handleRate("unsatisfied")}
          disabled={submitMutation.isPending}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
            currentRating === "unsatisfied"
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              : "text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          }`}
          title="不满意"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
        {showComment && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 w-64">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">改进建议（可选）</span>
              <button onClick={() => setShowComment(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="告诉我们哪里可以改进..."
              className="text-xs h-16 resize-none mb-2"
            />
            <Button size="sm" className="w-full h-7 text-xs" onClick={handleSubmitWithComment} disabled={submitMutation.isPending}>
              <Send className="h-3 w-3 mr-1" />提交
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">对本次生成结果的评价：</span>
        <div className="flex items-center gap-1.5">
          <Button
            variant={currentRating === "satisfied" ? "default" : "outline"}
            size="sm"
            onClick={() => handleRate("satisfied")}
            disabled={submitMutation.isPending}
            className={`gap-1.5 ${
              currentRating === "satisfied"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "hover:border-green-300 hover:text-green-600"
            }`}
          >
            <ThumbsUp className="h-4 w-4" />
            满意
          </Button>
          <Button
            variant={currentRating === "unsatisfied" ? "default" : "outline"}
            size="sm"
            onClick={() => handleRate("unsatisfied")}
            disabled={submitMutation.isPending}
            className={`gap-1.5 ${
              currentRating === "unsatisfied"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "hover:border-red-300 hover:text-red-600"
            }`}
          >
            <ThumbsDown className="h-4 w-4" />
            不满意
          </Button>
          {currentRating && !showComment && (
            <button
              onClick={() => setShowComment(true)}
              className="text-muted-foreground hover:text-foreground ml-1"
              title="补充反馈"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {showComment && (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">改进建议（可选）</span>
            <button onClick={() => setShowComment(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="告诉我们哪里可以改进，例如：图片风格不够真实、文案缺少专业术语..."
            className="resize-none h-20"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSubmitWithComment} disabled={submitMutation.isPending}>
              <Send className="h-4 w-4 mr-1.5" />
              提交反馈
            </Button>
          </div>
        </div>
      )}

      {existingFeedback?.comment && !showComment && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2">
          已反馈：{existingFeedback.comment}
        </div>
      )}
    </div>
  );
}
