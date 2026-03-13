import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, FolderKanban, Calendar, Users, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Projects() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: projects, isLoading } = trpc.projects.list.useQuery({ search, status: statusFilter === "all" ? undefined : statusFilter });
  const utils = trpc.useUtils();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const createProject = trpc.projects.create.useMutation({
    onSuccess: (result) => {
      utils.projects.list.invalidate();
      utils.dashboard.stats.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success("项目创建成功");
      if (result?.id) {
        setLocation(`/projects/${result.id}`);
      }
    },
  });

  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      utils.dashboard.stats.invalidate();
      setDeleteTarget(null);
      toast.success("项目已删除");
    },
    onError: () => toast.error("删除失败，请重试"),
  });

  const initialForm = {
    name: "",
    code: "",
    clientName: "",
    companyProfile: "",
    businessGoal: "",
    clientProfile: "",
    projectOverview: "",
  };
  const [form, setForm] = useState(initialForm);

  const resetForm = () => setForm(initialForm);

  const handleCreate = () => {
    if (!form.name.trim()) { toast.error("请输入项目名称"); return; }
    // Only send non-empty fields
    const payload: Record<string, string> = { name: form.name };
    if (form.code.trim()) payload.code = form.code;
    if (form.clientName.trim()) payload.clientName = form.clientName;
    if (form.companyProfile.trim()) payload.companyProfile = form.companyProfile;
    if (form.businessGoal.trim()) payload.businessGoal = form.businessGoal;
    if (form.clientProfile.trim()) payload.clientProfile = form.clientProfile;
    if (form.projectOverview.trim()) payload.projectOverview = form.projectOverview;
    createProject.mutate(payload as any);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">项目看板</h1>
          <p className="text-sm text-muted-foreground mt-1">管理所有设计与施工项目</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />新建项目</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>新建项目</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>项目名称 <span className="text-destructive">*</span></Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：某科技园区总部办公楼" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>项目编号</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="例：NP-2026-001" />
                </div>
                <div className="space-y-2">
                  <Label>甲方名称</Label>
                  <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="甲方公司名称" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>公司概况</Label>
                <Textarea value={form.companyProfile} onChange={(e) => setForm({ ...form, companyProfile: e.target.value })} placeholder="甲方公司的基本情况、行业背景等" rows={2} />
              </div>
              <div className="space-y-2">
                <Label>业务目标</Label>
                <Textarea value={form.businessGoal} onChange={(e) => setForm({ ...form, businessGoal: e.target.value })} placeholder="项目的业务目标和期望成果" rows={2} />
              </div>
              <div className="space-y-2">
                <Label>客户情况</Label>
                <Textarea value={form.clientProfile} onChange={(e) => setForm({ ...form, clientProfile: e.target.value })} placeholder="客户的需求偏好、决策风格等" rows={2} />
              </div>
              <div className="space-y-2">
                <Label>项目概况</Label>
                <Textarea value={form.projectOverview} onChange={(e) => setForm({ ...form, projectOverview: e.target.value })} placeholder="项目的基本情况、面积、功能需求、风格偏好等" rows={3} />
              </div>
              <Button onClick={handleCreate} disabled={createProject.isPending} className="w-full">
                {createProject.isPending ? "创建中..." : "创建项目"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索项目..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="planning">规划中</SelectItem>
            <SelectItem value="design">设计中</SelectItem>
            <SelectItem value="construction">施工中</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="archived">已归档</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse"><CardContent className="p-6"><div className="h-20 bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project: any) => (
            <Card
              key={project.id}
              className="hover:shadow-md transition-shadow cursor-pointer group relative"
              onClick={() => setLocation(`/projects/${project.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FolderKanban className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-xs">{statusLabel(project.status)}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: project.id, name: project.name });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <h3 className="font-medium text-sm group-hover:text-primary transition-colors">{project.name}</h3>
                {project.code && <p className="text-xs text-muted-foreground mt-0.5">{project.code}</p>}
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{project.projectOverview || project.description || "暂无描述"}</p>
                <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                  {project.clientName && (
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{project.clientName}</span>
                  )}
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(project.createdAt).toLocaleDateString("zh-CN")}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderKanban className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">暂无项目</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />创建第一个项目
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除项目</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除项目「{deleteTarget?.name}」吗？删除后该项目的所有任务、文档和自定义信息将一并移除，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteProject.mutate({ id: deleteTarget.id })}
              disabled={deleteProject.isPending}
            >
              {deleteProject.isPending ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function statusLabel(status: string) {
  const map: Record<string, string> = { planning: "规划中", design: "设计中", construction: "施工中", completed: "已完成", archived: "已归档" };
  return map[status] || status;
}
