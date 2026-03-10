import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getLoginUrl } from "@/const";
import {
  LogOut,
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
  History,
  ShoppingCart,
  Ruler,
  Building2,
  ClipboardList,
  Compass,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
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

const ICON_BAR_WIDTH = 56;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, user } = useAuth();

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

  return <IconSidebarLayout>{children}</IconSidebarLayout>;
}

/* ─── Icon Sidebar Layout ─────────────────────────────── */

function IconSidebarLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const isAdmin = user?.role === "admin";
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const activeMenuItem = allMenuItems.find(
    (item) =>
      item.path === location ||
      (item.path !== "/" && location.startsWith(item.path))
  );

  // Filter sections based on admin role
  // Separate bottom sections (admin, history) from main sections
  const mainSections = menuSections.filter(
    (s) => !s.adminOnly && s.id !== "history" && s.id !== "admin"
  ).filter((s) => !s.adminOnly || isAdmin);

  const bottomSections = menuSections.filter(
    (s) => (s.id === "history" || (s.id === "admin" && isAdmin))
  );

  const handleSectionEnter = useCallback((sectionId: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredSection(sectionId);
  }, []);

  const handleSectionLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredSection(null);
    }, 150);
  }, []);

  const handlePopoverEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const handlePopoverLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredSection(null);
    }, 150);
  }, []);

  // Close popover on navigation
  useEffect(() => {
    setHoveredSection(null);
  }, [location]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const hoveredSectionData = hoveredSection
    ? menuSections.find((s) => s.id === hoveredSection)
    : null;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Narrow Icon Sidebar */}
      <div
        className="flex flex-col h-full bg-sidebar border-r border-sidebar-border shrink-0 z-50"
        style={{ width: ICON_BAR_WIDTH }}
      >
        {/* Top: Main section icons */}
        <div className="flex flex-col items-center pt-3 gap-1 flex-1">
          {mainSections.map((section) => (
            <SidebarIconButton
              key={section.id}
              section={section}
              location={location}
              isHovered={hoveredSection === section.id}
              onMouseEnter={() => handleSectionEnter(section.id)}
              onMouseLeave={handleSectionLeave}
              onClick={() => {
                // Click on icon navigates to first item
                if (section.items.length === 1) {
                  setLocation(section.items[0].path);
                }
              }}
            />
          ))}
        </div>

        {/* Bottom: Admin, History, User */}
        <div className="flex flex-col items-center pb-3 gap-1">
          {bottomSections.map((section) => (
            <SidebarIconButton
              key={section.id}
              section={section}
              location={location}
              isHovered={hoveredSection === section.id}
              onMouseEnter={() => handleSectionEnter(section.id)}
              onMouseLeave={handleSectionLeave}
              onClick={() => {
                if (section.items.length === 1) {
                  setLocation(section.items[0].path);
                }
              }}
            />
          ))}

          {/* User Avatar */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-sidebar-accent transition-colors focus:outline-none mt-1">
                <Avatar className="h-7 w-7 border border-sidebar-border">
                  <AvatarFallback className="text-[11px] font-medium bg-sidebar-primary text-sidebar-primary-foreground">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium truncate">{user?.name || "用户"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email || ""}</p>
              </div>
              <DropdownMenuSeparator />
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
        </div>
      </div>

      {/* Hover Popover - Sub menu */}
      {hoveredSectionData && hoveredSectionData.items.length > 1 && (
        <HoverPopover
          ref={popoverRef}
          section={hoveredSectionData}
          location={location}
          onNavigate={setLocation}
          onMouseEnter={handlePopoverEnter}
          onMouseLeave={handlePopoverLeave}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar with Logo */}
        <header className="h-12 border-b border-border flex items-center px-5 shrink-0 bg-background/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight text-foreground">
              N+1 STUDIOS
            </span>
            <span className="text-[10px] tracking-[0.15em] text-muted-foreground/60 uppercase">
              AI 工作平台
            </span>
          </div>
          {activeMenuItem && (
            <>
              <span className="mx-3 text-border">/</span>
              <span className="text-sm text-muted-foreground">
                {activeMenuItem.label}
              </span>
            </>
          )}
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}

/* ─── Sidebar Icon Button ─────────────────────────────── */

function SidebarIconButton({
  section,
  location,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  section: MenuSection;
  location: string;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}) {
  const sectionHasActive = section.items.some(
    (item) =>
      location === item.path ||
      (item.path !== "/" && location.startsWith(item.path))
  );

  return (
    <div
      className="relative flex flex-col items-center"
      data-section-id={section.id}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        onClick={onClick}
        className={`
          flex flex-col items-center justify-center w-10 h-10 rounded-lg transition-all duration-150
          ${sectionHasActive
            ? "bg-sidebar-accent text-sidebar-primary"
            : isHovered
              ? "bg-sidebar-accent/60 text-sidebar-foreground"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
          }
        `}
        title={section.label}
      >
        <section.icon className="h-[18px] w-[18px]" />
      </button>
      <span
        className={`text-[9px] mt-0.5 leading-none transition-colors ${
          sectionHasActive
            ? "text-sidebar-primary font-medium"
            : "text-sidebar-foreground/40"
        }`}
      >
        {section.label}
      </span>
    </div>
  );
}

/* ─── Hover Popover ───────────────────────────────────── */

import { forwardRef } from "react";

const HoverPopover = forwardRef<
  HTMLDivElement,
  {
    section: MenuSection;
    location: string;
    onNavigate: (path: string) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  }
>(function HoverPopover({ section, location, onNavigate, onMouseEnter, onMouseLeave }, ref) {
  // Find the icon button position for this section
  const [topOffset, setTopOffset] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Find the button element for this section by traversing the sidebar
    const sidebar = document.querySelector(`[data-section-id="${section.id}"]`);
    if (sidebar) {
      const rect = sidebar.getBoundingClientRect();
      setTopOffset(rect.top);
    }
  }, [section.id]);

  return (
    <div
      ref={ref}
      className="fixed z-[100] bg-popover text-popover-foreground border border-border rounded-lg shadow-lg py-1.5 min-w-[160px] animate-in fade-in-0 zoom-in-95 duration-100"
      style={{
        left: ICON_BAR_WIDTH + 4,
        top: topOffset > 0 ? topOffset : undefined,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="px-3 py-1.5 mb-0.5">
        <span className="text-xs font-medium text-muted-foreground">{section.label}</span>
      </div>
      {section.items.map((item) => {
        const isActive =
          location === item.path ||
          (item.path !== "/" && location.startsWith(item.path));
        return (
          <button
            key={item.path}
            onClick={() => onNavigate(item.path)}
            className={`
              flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors
              ${isActive
                ? "bg-accent text-accent-foreground font-medium"
                : "hover:bg-accent/50 text-foreground/80"
              }
            `}
          >
            <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
});
