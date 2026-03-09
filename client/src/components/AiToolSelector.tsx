import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type AiToolSelectorProps = {
  category: string;
  value?: number;
  onChange: (toolId: number | undefined) => void;
  label?: string;
  showBuiltIn?: boolean;
};

const BUILTIN_TOOL_ID = -1;

export default function AiToolSelector({ category, value, onChange, label, showBuiltIn = true }: AiToolSelectorProps) {
  const { data: tools } = trpc.aiTools.list.useQuery({ category, activeOnly: true });
  const [storageKey] = useState(`ai-tool-pref-${category}`);

  useEffect(() => {
    if (value === undefined) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        onChange(parseInt(saved));
      }
    }
  }, []);

  const handleChange = (val: string) => {
    const id = parseInt(val);
    localStorage.setItem(storageKey, val);
    onChange(id === BUILTIN_TOOL_ID ? undefined : id);
  };

  const currentValue = value?.toString() || BUILTIN_TOOL_ID.toString();

  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>}
      <Select value={currentValue} onValueChange={handleChange}>
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" />
            <SelectValue placeholder="选择 AI 工具" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {showBuiltIn && (
            <SelectItem value={BUILTIN_TOOL_ID.toString()}>
              <div className="flex items-center gap-2">
                <span>内置 AI</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">默认</Badge>
              </div>
            </SelectItem>
          )}
          {tools?.map((tool: any) => (
            <SelectItem key={tool.id} value={tool.id.toString()}>
              <div className="flex items-center gap-2">
                <span>{tool.name}</span>
                {tool.provider && (
                  <span className="text-[10px] text-muted-foreground">{tool.provider}</span>
                )}
              </div>
            </SelectItem>
          ))}
          {(!tools || tools.length === 0) && !showBuiltIn && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无可用工具</div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
