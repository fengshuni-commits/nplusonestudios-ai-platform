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
} from "lucide-react";

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

  const categoryLabel: Record<string, string> = {
    ai_render: "AI 效果图",
    image: "图片",
    document: "文档",
    model: "模型",
    reference: "参考图",
  };

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
        {/* Delete button on hover */}
        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button
            className="h-6 w-6 rounded-full bg-black/50 flex items-center justify-center text-white/70 hover:bg-red-500/80 hover:text-white transition-colors"
            title="删除文件夹"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(asset.id);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative rounded-xl overflow-hidden border border-border/40 bg-card hover:border-border/80 transition-all duration-200 hover:shadow-md">
      {/* Image area */}
      <div
        className="aspect-square bg-muted cursor-zoom-in overflow-hidden"
        onClick={() => isImage && onLightbox(asset.fileUrl, asset.name)}
      >
        {isImage ? (
          <img
            src={displayUrl}
            alt={asset.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 pointer-events-none" />

        {/* Action buttons on hover */}
        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          {isImage && (
            <button
              className="h-6 w-6 rounded-full bg-black/50 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-colors"
              title="放大查看"
              onClick={(e) => {
                e.stopPropagation();
                onLightbox(asset.fileUrl, asset.name);
              }}
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
            onClick={(e) => {
              e.stopPropagation();
              onDelete(asset.id);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Info area */}
      <div className="px-2.5 py-2 space-y-1">
        <p className="text-xs font-medium text-foreground truncate" title={asset.name}>
          {asset.name}
        </p>
        <div className="flex flex-wrap gap-1">
          {asset.category && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
              {categoryLabel[asset.category] || asset.category}
            </Badge>
          )}
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
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  currentFolderId: number | null;
  onUploaded: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
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
        if (file && file.type.startsWith("image/")) {
          droppedFiles.push(file);
        }
      }
    });

    setFiles((prev) => [...prev, ...droppedFiles]);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith("image/")
    );
    setFiles((prev) => [...prev, ...selected]);
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith("image/")
    );
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
    const folderMap = new Map<string, number>(); // path -> folderId

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        // Get folder path from webkitRelativePath or construct from file name
        const relativePath = (file as any).webkitRelativePath || file.name;
        const pathParts = relativePath.split("/");
        let parentId = currentFolderId;

        // Create folder hierarchy if needed
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

        // Read file as base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]); // strip data:xxx;base64,
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Upload to S3
        const { url, key } = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileData: base64,
          contentType: file.type,
        });

          // Create asset record
        await createMutation.mutateAsync({
          name: file.name.replace(/\.[^.]+$/, ""),
          fileUrl: url,
          fileKey: key,
          fileType: file.type,
          fileSize: file.size,
          thumbnailUrl: url,
          category: "image",
        });

        successCount++;
      } catch (err: any) {
        toast.error(`${file.name} 上传失败：${err.message || "未知错误"}`);
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setUploading(false);
    if (successCount > 0) {
      toast.success(`成功上传 ${successCount} 张图片`);
      onUploaded();
      onClose();
    }
    setFiles([]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            上传图片到素材库
          </DialogTitle>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-border/60 rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">拖拽图片或文件夹到此处，或点击选择</p>
          <p className="text-xs text-muted-foreground/60 mt-1">支持 PNG、JPG、WebP、GIF 格式</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={folderInputRef}
            type="file"
            accept="image/*"
            multiple
            {...({ webkitdirectory: "" } as any)}
            className="hidden"
            onChange={handleFolderChange}
          />
        </div>

        {/* Quick buttons */}
        <div className="flex gap-2 justify-center">
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
            选择图片
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => folderInputRef.current?.click()}
          >
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
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            取消
          </Button>
          <Button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
          >
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
      <button
        onClick={() => onNavigate(null)}
        className="hover:text-foreground transition-colors"
      >
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
    if (!folderName.trim()) {
      toast.error("请输入文件夹名称");
      return;
    }
    createFolderMutation.mutate({
      name: folderName.trim(),
      parentId: parentFolderId ?? undefined,
    });
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
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              文件夹名称
            </label>
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
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={createFolderMutation.isPending}
          >
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!folderName.trim() || createFolderMutation.isPending}
          >
            {createFolderMutation.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />创建中</>
            ) : (
              <>创建</>
            )}
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
    onSuccess: () => {
      utils.assets.listByParent.invalidate();
      toast.success("已删除素材");
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const deleteFolderMutation = trpc.assets.deleteFolder.useMutation({
    onSuccess: () => {
      utils.assets.listByParent.invalidate();
      toast.success("已删除文件夹");
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const assets = (assetsData || []) as AssetItem[];

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
      if (index >= 0) {
        setFolderPath((prev) => prev.slice(0, index + 1));
      }
    }
  };

  const handleDelete = (id: number) => {
    const asset = assets.find((a) => a.id === id);
    if (asset?.isFolder) {
      setDeleteTarget(id);
    } else {
      setDeleteTarget(id);
    }
  };

  const categories = [
    { value: undefined, label: "全部" },
    { value: "ai_render", label: "AI 效果图" },
    { value: "image", label: "本地上传" },
    { value: "reference", label: "参考图" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border/40">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">素材库</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {assets.length > 0 ? `共 ${assets.length} 个项目` : "团队共享素材，支持文件夹结构"}
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

        {/* Search + filter */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索素材名称…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex gap-1.5">
            {categories.map((c) => (
              <button
                key={String(c.value)}
                onClick={() => setCategoryFilter(c.value)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  categoryFilter === c.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
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
              <FolderPlus className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-foreground/60 mb-1">
              {currentFolderId ? "文件夹为空" : "素材库暂无内容"}
            </p>
            <p className="text-xs text-muted-foreground/50 max-w-xs">
              点击右上角「上传」按钮添加图片或文件夹
            </p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              上传
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
        <Lightbox
          src={lightbox.src}
          name={lightbox.name}
          onClose={() => setLightbox(null)}
        />
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
