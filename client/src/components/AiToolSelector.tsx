import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type AiToolSelectorProps = {
  /** @deprecated 使用 capability 代替；保留用于向后兼容 */
  category?: string;
  /** 按能力标签过滤工具（如 "rendering"、"document"、"analysis"） */
  capability?: string;
  value?: number;
  onChange: (toolId: number | undefined) => void;
  label?: string;
  showBuiltIn?: boolean;
};

const BUILTIN_TOOL_ID = -1;

export default function AiToolSelector({ category, capability, value, onChange, label, showBuiltIn = true }: AiToolSelectorProps) {
  const filterKey = capability || category;
  const { data: tools } = trpc.aiTools.list.useQuery(
    filterKey ? { capability: filterKey, activeOnly: true } : { activeOnly: true }
  );
  const [selectedValue, setSelectedValue] = useState<number | undefined>(value);

  // 初始化：使用外部传入的 value，或自动选中 isDefault 工具
  useEffect(() => {
    // 如果外部传入了 value，使用外部值
    if (value !== undefined) {
      setSelectedValue(value);
      return;
    }

    // 等待工具列表加载完成
    if (!tools) return;

    // 自动选中 isDefault 工具，每次打开都重置为默认（不使用 localStorage）
    const defaultTool = tools.find((t: any) => t.isDefault);
    if (defaultTool) {
      setSelectedValue(defaultTool.id);
      onChange(defaultTool.id);
    } else {
      // 没有默认工具时，保持内置 AI（selectedValue 保持 undefined）
      setSelectedValue(undefined);
    }
  }, [tools, value]);

  const handleChange = (val: string) => {
    const id = parseInt(val);
    // 注意：不保存到 localStorage，只在当前会话中保持选择
    setSelectedValue(id === BUILTIN_TOOL_ID ? undefined : id);
    onChange(id === BUILTIN_TOOL_ID ? undefined : id);
  };

  const currentValue = selectedValue?.toString() || BUILTIN_TOOL_ID.toString();

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
                <Badge variant="secondary" className="text-[10px] h-4 px-1">内置</Badge>
              </div>
            </SelectItem>
          )}
          {tools?.map((tool: any) => (
            <SelectItem key={tool.id} value={tool.id.toString()}>
              <div className="flex items-center gap-2">
                <span>{tool.name}</span>
                {tool.isDefault && (
                  <Badge className="text-[10px] h-4 px-1.5 bg-primary/15 text-primary border-primary/20">默认</Badge>
                )}
                {tool.provider && !tool.isDefault && (
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
