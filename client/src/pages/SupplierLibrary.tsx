import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, Layers, Home, Bath, Sofa, Lightbulb,
  Palette, Monitor, PenTool, DoorOpen, Package, Plus,
} from "lucide-react";
import SupplierFormDialog from "./SupplierFormDialog";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "施工方": Building2,
  "建材": Layers,
  "全屋订制": Home,
  "卫浴": Bath,
  "软装": Sofa,
  "灯具": Lightbulb,
  "平面供应商": Palette,
  "LED软屏": Monitor,
  "设计分包": PenTool,
  "门窗五金": DoorOpen,
  "其他": Package,
};

const CATEGORY_COLORS: Record<string, string> = {
  "施工方": "bg-stone-100 text-stone-700 border-stone-300 hover:bg-stone-200",
  "建材": "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100",
  "全屋订制": "bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100",
  "卫浴": "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100",
  "软装": "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100",
  "灯具": "bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100",
  "平面供应商": "bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100",
  "LED软屏": "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100",
  "设计分包": "bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100",
  "门窗五金": "bg-zinc-100 text-zinc-700 border-zinc-300 hover:bg-zinc-200",
  "其他": "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200",
};

export default function SupplierLibrary() {
  const [, navigate] = useLocation();
  const [addOpen, setAddOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: summary, isLoading } = trpc.suppliers.categorySummary.useQuery();
  const totalSuppliers = summary?.reduce((s, c) => s + c.count, 0) ?? 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">供应商产品库</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isLoading
              ? "加载中…"
              : `共 ${totalSuppliers} 家供应商，分 ${summary?.filter(c => c.count > 0).length ?? 0} 个品类`}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          添加供应商
        </Button>
      </div>

      {/* Category grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 11 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {summary?.map(({ category, count }) => {
            const Icon = CATEGORY_ICONS[category] ?? Package;
            const colorCls = CATEGORY_COLORS[category] ?? "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200";
            return (
              <Card
                key={category}
                className={`cursor-pointer border transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 ${colorCls}`}
                onClick={() => navigate(`/construction/suppliers/category/${encodeURIComponent(category)}`)}
              >
                <CardContent className="p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <Icon className="w-6 h-6 opacity-60" />
                    <Badge
                      variant="secondary"
                      className="text-xs font-medium bg-white/70 border-0 text-current"
                    >
                      {count} 家
                    </Badge>
                  </div>
                  <div>
                    <p className="font-semibold text-base leading-tight">{category}</p>
                    <p className="text-xs opacity-50 mt-0.5">点击查看供应商</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {addOpen && (
        <SupplierFormDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            utils.suppliers.categorySummary.invalidate();
            setAddOpen(false);
          }}
        />
      )}
    </div>
  );
}
