/**
 * ImportProjectInfo — Reusable component for AI modules to import project info.
 *
 * Usage:
 *   <ImportProjectInfo onImport={(ctx) => { setForm({...form, projectName: ctx.project.name, ...}) }} />
 *
 * When the user clicks "导入项目信息", a dropdown shows all projects.
 * Selecting one fetches the full project context and calls onImport with the data.
 */
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { FolderDown, Search, FolderKanban, Check } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";

export interface ProjectContext {
  context: string; // Full text context for AI prompt injection
  project: {
    id: number;
    name: string;
    code?: string | null;
    clientName?: string | null;
    companyProfile?: string | null;
    businessGoal?: string | null;
    clientProfile?: string | null;
    projectOverview?: string | null;
    description?: string | null;
  };
  customFields: Array<{ id: number; fieldName: string; fieldValue: string | null }>;
}

interface ImportProjectInfoProps {
  /** Called when user selects a project and its context is loaded */
  onImport: (ctx: ProjectContext) => void;
  /** Optional: currently selected project id (to show a check mark) */
  selectedProjectId?: number | null;
  /** Optional: custom button label */
  label?: string;
  /** Optional: compact mode (icon only) */
  compact?: boolean;
}

export default function ImportProjectInfo({
  onImport,
  selectedProjectId,
  label = "导入项目信息",
  compact = false,
}: ImportProjectInfoProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const { data: projects } = trpc.projects.list.useQuery(undefined, {
    enabled: open,
  });

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p: any) =>
        p.name?.toLowerCase().includes(q) ||
        p.code?.toLowerCase().includes(q) ||
        p.clientName?.toLowerCase().includes(q)
    );
  }, [projects, search]);

  const utils = trpc.useUtils();

  const handleSelect = useCallback(async (projectId: number) => {
    setLoadingId(projectId);
    try {
      const ctx = await utils.projects.getProjectContext.fetch({ id: projectId });
      onImport(ctx as ProjectContext);
      setOpen(false);
      setSearch("");
      toast.success("项目信息已导入");
    } catch {
      toast.error("导入失败，请重试");
    } finally {
      setLoadingId(null);
    }
  }, [onImport, utils]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <Button variant="outline" size="icon" className="h-8 w-8" title={label}>
            <FolderDown className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5">
            <FolderDown className="h-3.5 w-3.5" />
            {label}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索项目..."
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        <ScrollArea className="h-80">
          {filteredProjects.length > 0 ? (
            <div className="p-1">
              {filteredProjects.map((p: any) => (
                <button
                  key={p.id}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-accent transition-colors disabled:opacity-50"
                  onClick={() => handleSelect(p.id)}
                  disabled={loadingId !== null}
                >
                  <div className="h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                    {selectedProjectId === p.id ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <FolderKanban className="h-3.5 w-3.5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[p.code, p.clientName].filter(Boolean).join(" · ") || "暂无编号"}
                    </p>
                  </div>
                  {loadingId === p.id && (
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {projects ? "未找到匹配的项目" : "加载中..."}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
