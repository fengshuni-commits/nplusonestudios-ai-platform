import { useState, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Search,
  Trash2,
  FolderOpen,
  X,
  Download,
  Maximize2,
  ImageIcon,
  Loader2,
  FolderPlus,
  ChevronRight,
  Folder,
  BookImage,
  Sparkles,
  FileText,
  Palette,
  Megaphone,
  Camera,
  Archive,
  LayoutTemplate,
} from "lucide-react";

// ─── Category Config ──────────────────────────────────────
export const ASSET_CATEGORIES = [
  { value: "reference",   label: "参考图片",  icon: BookImage,  color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400" },
  { value: "ai_render",   label: "效果图",    icon: Sparkles,   color: "text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400" },
  { value: "drawing",     label: "施工图纸",  icon: FileText,   color: "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400" },
  { value: "material",    label: "材料样板",  icon: Palette,    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400" },
  { value: "brand",       label: "品牌物料",  icon: Megaphone,  color: "text-rose-600 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400" },
  { value: "photo",       label: "项目照片",  icon: Camera,     color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400" },
  { value: "layout_pack", label: "版式包",    icon: LayoutTemplate, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400" },
  { value: "other",       label: "其他",      icon: Archive,    color: "text-muted-foreground bg-muted" },
] as const;

export type AssetCategoryValue = typeof ASSET_CATEGORIES[number]["value"];

export function getCategoryMeta(value: string | null | undefined) {
  return ASSET_CATEGORIES.find((c) => c.value === value) ?? ASSET_CATEGORIES[ASSET_CATEGORIES.length - 1];
}

// ─── Types ────────────────────────────────────────────────
type AssetItem = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  tags: string | null;
  fileUrl: string;
  fileKey: string;
  fileType: string | null;
  fileSize: number | null;
  thumbnailUrl: string | null;
  uploadedBy: number | null;
  historyId: number | null;
  projectId: number | null;
  parentId: number | null;
  isFolder: boolean;
  path: string | null;
  createdAt: Date;
  projectName: string | null;
};

// ─── Lightbox ─────────────────────────────────────────────
function Lightbox({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          className="absolute -top-10 right-0 text-white/70 hover:text-white"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
        <img
          src={src}
          alt={name}
          className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
        />
        <p className="mt-2 text-center text-sm text-white/60 truncate max-w-[90vw]">{name}</p>
      </div>
    </div>
  );
}

// ─── Asset Card ───────────────────────────────────────────
function AssetCard({
  asset,
  onDelete,
  onLightbox,
  onOpenFolder,
}: {
  asset: AssetItem;
  onDelete: (id: number) => void;
  onLightbox: (src: string, name: string) => void;
  onOpenFolder: (id: number) => void;
}) {
  const isImage =
    asset.fileType?.startsWith("image/") ||
    asset.thumbnailUrl ||
    /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(asset.fileUrl);

  const displayUrl = asset.thumbnailUrl || asset.fileUrl;
  const catMeta = getCategoryMeta(asset.category);

  if (asset.isFolder) {
    return (
      <div
        className="group relative rounded-xl overflow-hidden border border-border/40 bg-card hover:border-primary/60 transition-all duration-200 hover:shadow-md cursor-pointer"
        onClick={() => onOpenFolder(asset.id)}
      >
        <div className="aspect-square bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          <Folder className="h-12 w-12 text-primary/40 group-hover:text-primary/60 transition-colors" />
        </div>
        <div className="px-2.5 py-2 space-y-1">
          <p className="text-xs font-medium text-foreground truncate" title={asset.name}>
            {asset.name}
          </p>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
            文件夹
          </Badge>
        </div>
        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button
            className="h-6 w-6 rounded-full bg-black/50 flex items-center justify-center text-white/70 hover:bg-red-500/80 hover:text-white transition-colors"
            title="删除文件夹"
            onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative rounded-xl overflow-hidden border border-border/40 bg-card hover:border-border/80 transition-all duration-200 hover:shadow-md">
      <div
        className="aspect-square bg-muted cursor-zoom-in overflow-hidden"
        onClick={() => isImage && onLightbox(asset.fileUrl, asset.name)}
      >
        {isImage ? (
          <img
            src={displayUrl}
            alt={asset.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 pointer-events-none" />
        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          {isImage && (
            <button
              className="h-6 w-6 rounded-full bg-black/50 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-colors"
              title="放大查看"
              onClick={(e) => { e.stopPropagation(); onLightbox(asset.fileUrl, asset.name); }}
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          )}
          <a
            href={asset.fileUrl}
            download={asset.name}
            target="_blank"
            rel="noopener noreferrer"
            className="h-6 w-6 rounded-full bg-black/50 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-colors"
            title="下载"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="h-3 w-3" />
          </a>
          <button
            className="h-6 w-6 rounded-full bg-black/50 flex items-center justify-center text-white/70 hover:bg-red-500/80 hover:text-white transition-colors"
            title="删除"
            onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="px-2.5 py-2 space-y-1">
        <p className="text-xs font-medium text-foreground truncate" title={asset.name}>
          {asset.name}
        </p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-4 font-normal ${catMeta.color}`}>
            {catMeta.label}
          </Badge>
          {asset.projectName && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 font-normal text-primary/70 border-primary/30 bg-primary/5 max-w-[120px] truncate"
              title={asset.projectName}
            >
              <FolderOpen className="h-2.5 w-2.5 mr-0.5 shrink-0" />
              {asset.projectName}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Upload Dialog ────────────────────────────────────────
function UploadDialog({
  open,
  onClose,
  currentFolderId,
  defaultCategory,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  currentFolderId: number | null;
  defaultCategory: string;
  onUploaded: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.assets.upload.useMutation();
  const createMutation = trpc.assets.create.useMutation();
  const createFolderMutation = trpc.assets.createFolder.useMutation();

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const items = Array.from(e.dataTransfer.items || []);
    const droppedFiles: File[] = [];
    items.forEach((item) => {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) droppedFiles.push(file);
      }
    });
    setFiles((prev) => [...prev, ...droppedFiles]);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setProgress(0);

    let successCount = 0;
    const folderMap = new Map<string, number>();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const relativePath = (file as any).webkitRelativePath || file.name;
        const pathParts = relativePath.split("/");
        let parentId = currentFolderId;

        if (pathParts.length > 1) {
          for (let j = 0; j < pathParts.length - 1; j++) {
            const folderPath = pathParts.slice(0, j + 1).join("/");
            if (!folderMap.has(folderPath)) {
              const folderName = pathParts[j];
              const { id: newFolderId } = await createFolderMutation.mutateAsync({
                name: folderName,
                parentId: parentId ?? undefined,
                path: folderPath,
              });
              folderMap.set(folderPath, newFolderId);
              parentId = newFolderId;
            } else {
              parentId = folderMap.get(folderPath)!;
            }
          }
        }

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const { url, key } = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileData: base64,
          contentType: file.type,
        });

        await createMutation.mutateAsync({
          name: file.name.replace(/\.[^.]+$/, ""),
          fileUrl: url,
          fileKey: key,
          fileType: file.type,
          fileSize: file.size,
          thumbnailUrl: file.type.startsWith("image/") ? url : undefined,
          category: selectedCategory,
          parentId: parentId ?? undefined,
        });

        successCount++;
      } catch (err: any) {
        toast.error(`${file.name} 上传失败：${err.message || "未知错误"}`);
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setUploading(false);
    if (successCount > 0) {
      toast.success(`成功上传 ${successCount} 个文件`);
      onUploaded();
      onClose();
    }
    setFiles([]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setFiles([]); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            上传素材
          </DialogTitle>
        </DialogHeader>

        {/* Category selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">选择分类</label>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="选择分类" />
            </SelectTrigger>
            <SelectContent>
              {ASSET_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  <div className="flex items-center gap-2">
                    <c.icon className="h-3.5 w-3.5" />
                    {c.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-border/60 rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">拖拽文件到此处，或点击选择</p>
          <p className="text-xs text-muted-foreground/60 mt-1">支持图片、PDF、CAD 等各类文件</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            {...({ webkitdirectory: "" } as any)}
            className="hidden"
            onChange={handleFolderChange}
          />
        </div>

        {/* Quick buttons */}
        <div className="flex gap-2 justify-center">
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
            选择文件
          </Button>
          <Button size="sm" variant="outline" onClick={() => folderInputRef.current?.click()}>
            <Folder className="h-3.5 w-3.5 mr-1.5" />
            选择文件夹
          </Button>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {files.map((file, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 text-sm">
                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate text-foreground/80 text-xs">
                  {(file as any).webkitRelativePath || file.name}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
                <button
                  onClick={() => removeFile(i)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Progress */}
        {uploading && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                上传中…
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={uploading}>取消</Button>
          <Button onClick={handleUpload} disabled={files.length === 0 || uploading}>
            {uploading ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />上传中</>
            ) : (
              <><Upload className="h-3.5 w-3.5 mr-1.5" />上传 {files.length > 0 ? `(${files.length})` : ""}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Breadcrumb Navigation ────────────────────────────────
function Breadcrumb({
  path,
  onNavigate,
}: {
  path: Array<{ id: number | null; name: string }>;
  onNavigate: (folderId: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <button onClick={() => onNavigate(null)} className="hover:text-foreground transition-colors">
        素材库
      </button>
      {path.map((item, i) => (
        <div key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          <button
            onClick={() => onNavigate(item.id)}
            className="hover:text-foreground transition-colors max-w-[150px] truncate"
          >
            {item.name}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Create Folder Dialog ────────────────────────────────
function CreateFolderDialog({
  open,
  onClose,
  onCreated,
  parentFolderId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  parentFolderId: number | null;
}) {
  const [folderName, setFolderName] = useState("");
  const createFolderMutation = trpc.assets.createFolder.useMutation({
    onSuccess: () => {
      toast.success(`文件夹「${folderName}」创建成功`);
      setFolderName("");
      onCreated();
      onClose();
    },
    onError: (e) => toast.error(e.message || "创建失败"),
  });

  const handleCreate = () => {
    if (!folderName.trim()) { toast.error("请输入文件夹名称"); return; }
    createFolderMutation.mutate({ name: folderName.trim(), parentId: parentFolderId ?? undefined });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4" />
            新建文件夹
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">文件夹名称</label>
            <Input
              placeholder="输入文件夹名称…"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
              className="h-8 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={createFolderMutation.isPending}>取消</Button>
          <Button size="sm" onClick={handleCreate} disabled={!folderName.trim() || createFolderMutation.isPending}>
            {createFolderMutation.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />创建中</>
            ) : <>创建</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function Assets() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [folderPath, setFolderPath] = useState<Array<{ id: number | null; name: string }>>([]);

  const utils = trpc.useUtils();

  const { data: assetsData, isLoading } = trpc.assets.listByParent.useQuery(
    { parentId: currentFolderId ?? undefined },
    { refetchOnWindowFocus: false }
  );

  const deleteMutation = trpc.assets.delete.useMutation({
    onSuccess: () => { utils.assets.listByParent.invalidate(); toast.success("已删除素材"); },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const deleteFolderMutation = trpc.assets.deleteFolder.useMutation({
    onSuccess: () => { utils.assets.listByParent.invalidate(); toast.success("已删除文件夹"); },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const assets = (assetsData || []) as AssetItem[];

  // Count per category (excluding folders)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach((a) => {
      if (!a.isFolder) {
        const cat = a.category || "other";
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });
    return counts;
  }, [assets]);

  const totalNonFolder = assets.filter((a) => !a.isFolder).length;

  // Filter assets by search and category
  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter && !a.isFolder && a.category !== categoryFilter) return false;
      return true;
    });
  }, [assets, search, categoryFilter]);

  const handleOpenFolder = (folderId: number) => {
    const folder = assets.find((a) => a.id === folderId && a.isFolder);
    if (folder) {
      setCurrentFolderId(folderId);
      setFolderPath((prev) => [...prev, { id: folderId, name: folder.name }]);
    }
  };

  const handleNavigate = (folderId: number | null) => {
    setCurrentFolderId(folderId);
    if (folderId === null) {
      setFolderPath([]);
    } else {
      const index = folderPath.findIndex((p) => p.id === folderId);
      if (index >= 0) setFolderPath((prev) => prev.slice(0, index + 1));
    }
  };

  const handleDelete = (id: number) => setDeleteTarget(id);

  // Default category for upload dialog: current filter or "reference"
  const uploadDefaultCategory = categoryFilter || "reference";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border/40">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">素材库</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalNonFolder > 0 ? `共 ${totalNonFolder} 个素材` : "团队共享素材，按分类管理"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCreateFolderOpen(true)}>
              <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
              新建文件夹
            </Button>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              上传
            </Button>
          </div>
        </div>

        {/* Breadcrumb */}
        {folderPath.length > 0 && (
          <div className="mb-3">
            <Breadcrumb path={folderPath} onNavigate={handleNavigate} />
          </div>
        )}

        {/* Category tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setCategoryFilter(undefined)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              categoryFilter === undefined
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            全部
            <span className={`text-[10px] px-1 rounded ${categoryFilter === undefined ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background/60 text-muted-foreground"}`}>
              {totalNonFolder}
            </span>
          </button>
          {ASSET_CATEGORIES.map((c) => {
            const count = categoryCounts[c.value] || 0;
            const active = categoryFilter === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setCategoryFilter(c.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <c.icon className="h-3 w-3" />
                {c.label}
                <span className={`text-[10px] px-1 rounded ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background/60 text-muted-foreground"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="mt-3 relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索素材名称…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              {categoryFilter ? (
                (() => {
                  const meta = getCategoryMeta(categoryFilter);
                  return <meta.icon className="h-7 w-7 text-muted-foreground/40" />;
                })()
              ) : (
                <FolderPlus className="h-7 w-7 text-muted-foreground/40" />
              )}
            </div>
            <p className="text-sm font-medium text-foreground/60 mb-1">
              {categoryFilter
                ? `「${getCategoryMeta(categoryFilter).label}」分类暂无素材`
                : currentFolderId ? "文件夹为空" : "素材库暂无内容"}
            </p>
            <p className="text-xs text-muted-foreground/50 max-w-xs">
              点击右上角「上传」按钮添加素材
            </p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              上传素材
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {filteredAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onDelete={handleDelete}
                onLightbox={(src, name) => setLightbox({ src, name })}
                onOpenFolder={handleOpenFolder}
              />
            ))}
          </div>
        )}
      </div>

      {/* Upload dialog */}
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        currentFolderId={currentFolderId}
        defaultCategory={uploadDefaultCategory}
        onUploaded={() => utils.assets.listByParent.invalidate()}
      />

      {/* Create folder dialog */}
      <CreateFolderDialog
        open={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onCreated={() => utils.assets.listByParent.invalidate()}
        parentFolderId={currentFolderId}
      />

      {/* Lightbox */}
      {lightbox && (
        <Lightbox src={lightbox.src} name={lightbox.name} onClose={() => setLightbox(null)} />
      )}

      {/* Delete confirm */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {assets.find((a) => a.id === deleteTarget)?.isFolder
                ? "删除文件夹将同时删除其中的所有内容，无法恢复。"
                : "删除后无法恢复，原始生成记录不受影响。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget !== null) {
                  const asset = assets.find((a) => a.id === deleteTarget);
                  if (asset?.isFolder) {
                    deleteFolderMutation.mutate({ folderId: deleteTarget });
                  } else {
                    deleteMutation.mutate({ id: deleteTarget });
                  }
                  setDeleteTarget(null);
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
