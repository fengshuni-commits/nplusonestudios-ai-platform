import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupContent,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LogOut,
  PanelLeft,
  Compass,
  PenTool,
  HardHat,
  FolderKanban,
  Sparkles,
  Image,
  BookOpen,
  Webhook,
  Workflow,
  Settings,
  Key,
  Users,
  FileText,
  Globe,
  ChevronRight,
  History,
  ShoppingCart,
  Ruler,
  Wrench,
  Building2,
  ClipboardList,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

type MenuItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
};

type MenuSection = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: MenuItem[];
  adminOnly?: boolean;
};

// ── 板块定义 ──────────────────────────────────────────
// 设计板块（最上面）
// 营建板块（第二）
// 项目管理板块（第三）
// 管理板块（管理员专属，最下面）
// 历史板块（所有用户，最底部）

const menuSections: MenuSection[] = [
  {
    id: "design",
    label: "设计",
    icon: PenTool,
    items: [
      { icon: Compass, label: "项目策划", path: "/design/planning" },
      { icon: Ruler, label: "设计工具", path: "/design/tools" },
    ],
  },
  {
    id: "construction",
    label: "营建",
    icon: Building2,
    items: [
      { icon: HardHat, label: "施工管理", path: "/construction/docs" },
      { icon: ShoppingCart, label: "采购跟踪", path: "/construction/procurement" },
    ],
  },
  {
    id: "project",
    label: "项目管理",
    icon: ClipboardList,
    items: [
      { icon: FolderKanban, label: "项目管理", path: "/projects" },
      { icon: FileText, label: "会议纪要", path: "/meeting" },
    ],
  },
  {
    id: "admin",
    label: "管理",
    icon: Settings,
    adminOnly: true,
    items: [
      { icon: BookOpen, label: "出品标准", path: "/standards" },
      { icon: Image, label: "素材库", path: "/assets" },
      { icon: Sparkles, label: "AI 工具中心", path: "/ai-tools" },
      { icon: Webhook, label: "API 与 Webhook", path: "/integrations" },
      { icon: Workflow, label: "工作流", path: "/workflows" },
      { icon: Users, label: "团队管理", path: "/admin/team" },
      { icon: Key, label: "API 密钥", path: "/admin/api-keys" },
      { icon: Globe, label: "案例来源", path: "/admin/case-sources" },
    ],
  },
  {
    id: "history",
    label: "历史",
    icon: History,
    items: [
      { icon: History, label: "生成记录", path: "/history" },
    ],
  },
];

const allMenuItems = menuSections.flatMap((s) => s.items);

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-2">
            <div className="text-2xl font-bold tracking-tight">N+1 STUDIOS</div>
            <div className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
              AI 工作平台
            </div>
          </div>
          <div className="flex flex-col items-center gap-4 w-full">
            <p className="text-sm text-muted-foreground text-center">
              请登录以访问工作平台
            </p>
            <Button
              onClick={() => {
                window.location.href = getLoginUrl();
              }}
              size="lg"
              className="w-full"
            >
              登录
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = allMenuItems.find((item) => item.path === location || (item.path !== "/" && location.startsWith(item.path)));
  const isMobile = useIsMobile();
  const isAdmin = user?.role === "admin";

  // Track which sections are expanded - auto-expand section containing active item
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const section of menuSections) {
      if (section.items.some(item => item.path === location || (item.path !== "/" && location.startsWith(item.path)))) {
        initial.add(section.id);
      }
    }
    return initial;
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft =
        sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  // Filter sections based on admin role
  const visibleSections = menuSections.filter(
    (section) => !section.adminOnly || isAdmin
  );

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-14 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-md transition-colors focus:outline-none shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/70" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-sm tracking-tight text-sidebar-foreground truncate">
                    N+1 STUDIOS
                  </span>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-2">
            {visibleSections.map((section) => {
              const isExpanded = expandedSections.has(section.id);
              const sectionHasActive = section.items.some(
                (item) => location === item.path || (item.path !== "/" && location.startsWith(item.path))
              );

              return (
                <SidebarGroup key={section.id} className="py-0.5">
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <Collapsible
                        open={isExpanded}
                        onOpenChange={() => toggleSection(section.id)}
                        className="group/collapsible"
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton
                              tooltip={section.label}
                              className={`h-9 text-[13px] font-medium ${sectionHasActive && !isExpanded ? "text-sidebar-primary" : ""}`}
                            >
                              <section.icon
                                className={`h-4 w-4 ${sectionHasActive ? "text-sidebar-primary" : "text-sidebar-foreground/60"}`}
                              />
                              <span>{section.label}</span>
                              <ChevronRight
                                className={`ml-auto h-3.5 w-3.5 text-sidebar-foreground/40 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                              />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {section.items.map((item) => {
                                const isActive =
                                  location === item.path ||
                                  (item.path !== "/" && location.startsWith(item.path));
                                return (
                                  <SidebarMenuSubItem key={item.path}>
                                    <SidebarMenuSubButton
                                      isActive={isActive}
                                      onClick={() => setLocation(item.path)}
                                      className="text-[13px]"
                                    >
                                      <item.icon
                                        className={`h-3.5 w-3.5 ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60"}`}
                                      />
                                      <span>{item.label}</span>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                );
                              })}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-md px-1 py-1 hover:bg-sidebar-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none">
                  <Avatar className="h-8 w-8 border border-sidebar-border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-sidebar-primary text-sidebar-primary-foreground">
                      {user?.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-tight text-sidebar-foreground">
                      {user?.name || "用户"}
                    </p>
                    <p className="text-[11px] text-sidebar-foreground/50 truncate leading-tight mt-0.5">
                      {user?.email || ""}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setLocation("/admin/settings")}
                  className="cursor-pointer"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>设置</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>退出登录</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-sidebar-primary/30 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-3 backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-md" />
              <span className="text-sm font-medium text-foreground">
                {activeMenuItem?.label ?? "N+1 STUDIOS"}
              </span>
            </div>
          </div>
        )}
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
