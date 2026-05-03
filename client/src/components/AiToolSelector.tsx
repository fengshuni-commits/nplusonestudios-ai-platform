import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type AiToolSelectorProps = {
  /** @deprecated 使用 capability 代替；保留用于向后兼容 */
  category?: string;
  /** 按能力标签过滤工具（如 "image_generation"、"rendering"、"document"） */
  capability?: string;
  value?: number;
  onChange: (toolId: number | undefined) => void;
  label?: string;
  showBuiltIn?: boolean;
};

const BUILTIN_TOOL_ID = -1;

export function AiToolSelector({ category, capability, value, onChange, label, showBuiltIn = true }: AiToolSelectorProps) {
  const filterKey = capability || category;
  const { data: tools } = trpc.aiTools.list.useQuery(
    filterKey ? { capability: filterKey, activeOnly: true } : { activeOnly: true }
  );
  // 获取按 capability 设置的默认工具映射
  const { data: capabilityDefaults } = trpc.aiTools.getCapabilityDefaults.useQuery();
  const [selectedValue, setSelectedValue] = useState<number | undefined>(value);
  const [initialized, setInitialized] = useState(false);

  // 初始化：使用外部传入的 value，或按 capability 读取对应默认工具
  useEffect(() => {
    // 如果外部传入了 value，使用外部值（只在首次初始化时）
    if (value !== undefined && !initialized) {
      setSelectedValue(value);
      setInitialized(true);
      return;
    }

    // 等待工具列表和默认值加载完成
    if (!tools || capabilityDefaults === undefined) return;

    // 已初始化过则不再重置（避免用户手动切换后被重置）
    if (initialized) return;

    // 优先：按 capability 读取对应默认工具
    let defaultToolId: number | undefined;
    if (filterKey && capabilityDefaults[filterKey] !== undefined) {
      const capDefault = capabilityDefaults[filterKey];
      // 确认该工具在当前过滤列表中存在
      const found = tools.find((t: any) => t.id === capDefault);
      if (found) {
        defaultToolId = capDefault;
      }
    }

    // 次选：工具自身的 isDefault 字段（全局默认，向后兼容）
    if (defaultToolId === undefined) {
      const globalDefault = tools.find((t: any) => t.isDefault);
      if (globalDefault) {
        defaultToolId = globalDefault.id;
      }
    }

    if (defaultToolId !== undefined) {
      setSelectedValue(defaultToolId);
      onChange(defaultToolId);
    } else {
      // 没有默认工具时，保持内置 AI
      setSelectedValue(undefined);
    }
    setInitialized(true);
  }, [tools, capabilityDefaults, value, filterKey, initialized]);

  const handleChange = (val: string) => {
    const id = parseInt(val);
    setSelectedValue(id === BUILTIN_TOOL_ID ? undefined : id);
    onChange(id === BUILTIN_TOOL_ID ? undefined : id);
  };

  // showBuiltIn=false 时，没有选中工具就显示 placeholder（空字符串）
  const currentValue = selectedValue !== undefined
    ? selectedValue.toString()
    : (showBuiltIn ? BUILTIN_TOOL_ID.toString() : "");

  // 判断某工具是否是当前 capability 的默认工具
  const isCapabilityDefault = (toolId: number) => {
    if (filterKey && capabilityDefaults?.[filterKey] === toolId) return true;
    return false;
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      {label && <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{label}</span>}
      <Select value={currentValue} onValueChange={handleChange}>
        <SelectTrigger className="h-8 w-[200px] max-w-[260px] text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles className="h-3 w-3 text-primary shrink-0" />
            <SelectValue placeholder="选择 AI 工具" className="truncate" />
          </div>
        </SelectTrigger>
        <SelectContent className="min-w-[220px]">
          {showBuiltIn && (
            <SelectItem value={BUILTIN_TOOL_ID.toString()}>
              <div className="flex items-center gap-2">
                <span>内置 AI</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">内置</Badge>
              </div>
            </SelectItem>
          )}
          {tools?.map((tool: any) => {
            const isDefault = isCapabilityDefault(tool.id) || (!filterKey && tool.isDefault);
            return (
              <SelectItem key={tool.id} value={tool.id.toString()}>
                <div className="flex items-center gap-2">
                  <span>{tool.name}</span>
                  {isDefault && (
                    <Badge className="text-[10px] h-4 px-1.5 bg-primary/15 text-primary border-primary/20">默认</Badge>
                  )}
                  {tool.provider && !isDefault && (
                    <span className="text-[10px] text-muted-foreground">{tool.provider}</span>
                  )}
                </div>
              </SelectItem>
            );
          })}
          {(!tools || tools.length === 0) && !showBuiltIn && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无可用工具</div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
