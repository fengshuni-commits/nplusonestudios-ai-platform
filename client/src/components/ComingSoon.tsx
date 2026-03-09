import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Construction, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

type ComingSoonProps = {
  title: string;
  description: string;
  icon?: React.ReactNode;
  features?: string[];
};

export default function ComingSoon({ title, description, icon, features }: ComingSoonProps) {
  const [interested, setInterested] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
            {icon || <Construction className="h-8 w-8 text-primary/40" />}
          </div>
          <h2 className="text-lg font-medium text-foreground/70 mb-1">功能开发中</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            该模块正在积极开发中，预计将在后续版本中上线。
          </p>

          {features && features.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-4 mb-6 w-full max-w-md">
              <p className="text-xs font-medium text-foreground/60 mb-2">规划功能</p>
              <ul className="space-y-1.5">
                {features.map((f, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary/40 mt-0.5">·</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            variant={interested ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              setInterested(true);
              toast.success("已记录您的关注，我们会优先考虑开发此功能");
            }}
            disabled={interested}
          >
            <ThumbsUp className="h-4 w-4 mr-1.5" />
            {interested ? "已关注" : "我感兴趣"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
