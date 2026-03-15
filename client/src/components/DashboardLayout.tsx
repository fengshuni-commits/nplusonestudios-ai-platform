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
  PanelLeftOpen,
  PanelLeftClose,
  Megaphone,
  BookMarked,
  MessageCircle,
  Camera,
  BarChart3,
  HelpCircle,
  LayoutDashboard,
  Presentation,
  Palette,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect, forwardRef } from "react";
import { HelpGuide } from "./HelpGuide";
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

const homeItem: MenuItem = { icon: LayoutDashboard, label: "工作台", path: "/" };

const menuSections: MenuSection[] = [
  {
    id: "design",
    label: "设计",
    icon: PenTool,
    items: [
      { icon: Compass, label: "案例调研", path: "/design/planning" },
      { icon: Ruler, label: "AI效果图", path: "/design/tools" },
      { icon: Palette, label: "AI彩平", path: "/design/color-plan" },
      { icon: Presentation, label: "演示文稿", path: "/design/presentation" },
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
      { icon: FolderKanban, label: "项目看板", path: "/projects" },
      { icon: FileText, label: "会议纪要", path: "/meeting" },
      { icon: FileText, label: "设计任务书", path: "/design/brief" },
    ],
  },
  {
    id: "media",
    label: "媒体",
    icon: Megaphone,
    items: [
      { icon: BookMarked, label: "小红书", path: "/media/xiaohongshu" },
      { icon: MessageCircle, label: "公众号", path: "/media/wechat" },
      { icon: Camera, label: "Instagram", path: "/media/instagram" },
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
      { icon: Webhook, label: "API 与 Webhook", path: "/integrations" },
      { icon: Workflow, label: "工作流", path: "/workflows" },
      { icon: Users, label: "团队管理", path: "/admin/team" },
      { icon: Key, label: "API 密钥", path: "/admin/api-keys" },
      { icon: Globe, label: "案例来源", path: "/admin/case-sources" },
      { icon: BarChart3, label: "反馈分析", path: "/admin/feedback" },
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

const ICON_BAR_WIDTH = 48;
const EXPANDED_WIDTH = 200;

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
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663304605552/fRco6A2SeYp4EEqicyDKLT/nplus1-logo-transparent_aaa215a8.png"
              alt="N+1 STUDIOS"
              className="h-12 w-auto object-contain"
            />
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
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem("sidebar-expanded") === "true";
    } catch {
      return false;
    }
  });
  const [helpOpen, setHelpOpen] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const activeMenuItem = allMenuItems.find(
    (item) =>
      item.path === location ||
      (item.path !== "/" && location.startsWith(item.path))
  );

  // Filter sections based on admin role
  const mainSections = menuSections.filter(
    (s) => !s.adminOnly && s.id !== "history" && s.id !== "admin"
  ).filter((s) => !s.adminOnly || isAdmin);

  const bottomSections = menuSections.filter(
    (s) => (s.id === "history" || (s.id === "admin" && isAdmin))
  );

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-expanded", String(next));
      } catch { /* ignore */ }
      return next;
    });
    // Close any hover popover when toggling
    setHoveredSection(null);
  }, []);

  const handleSectionEnter = useCallback((sectionId: string) => {
    if (expanded) return; // No hover popover in expanded mode
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredSection(sectionId);
  }, [expanded]);

  const handleSectionLeave = useCallback(() => {
    if (expanded) return;
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredSection(null);
    }, 150);
  }, [expanded]);

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

  const sidebarWidth = expanded ? EXPANDED_WIDTH : ICON_BAR_WIDTH;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div
        className="flex flex-col h-full bg-sidebar border-r border-sidebar-border shrink-0 z-50 transition-[width] duration-200 ease-in-out"
        style={{ width: sidebarWidth }}
      >
        {/* Toggle Button at Top */}
        <div className={`flex items-center ${expanded ? "px-3" : "justify-center"} pt-3 pb-1`}>
          <button
            onClick={toggleExpanded}
            className="flex items-center justify-center w-8 h-8 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
            title={expanded ? "收起侧边栏" : "展开侧边栏"}
          >
            {expanded ? (
              <PanelLeftClose className="h-[16px] w-[16px]" />
            ) : (
              <PanelLeftOpen className="h-[16px] w-[16px]" />
            )}
          </button>
        </div>

        {/* Top: Main section icons/items */}
        <div className={`flex flex-col ${expanded ? "px-2" : "items-center"} gap-0.5 flex-1 pt-1`}>
          {/* Home item */}
          {expanded ? (
            <button
              key="home"
              onClick={() => setLocation("/")}
              className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm transition-colors ${
                location === "/"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              }`}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              <span>工作台</span>
            </button>
          ) : (
            <button
              key="home"
              onClick={() => setLocation("/")}
              title="工作台"
              className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
                location === "/"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
            </button>
          )}
          {mainSections.map((section) => (
            expanded ? (
              <ExpandedSection
                key={section.id}
                section={section}
                location={location}
                onNavigate={setLocation}
              />
            ) : (
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
            )
          ))}
        </div>

        {/* Bottom: Admin, History, User */}
        <div className={`flex flex-col ${expanded ? "px-2" : "items-center"} pb-3 gap-0.5`}>
          {bottomSections.map((section) => (
            expanded ? (
              <ExpandedSection
                key={section.id}
                section={section}
                location={location}
                onNavigate={setLocation}
              />
            ) : (
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
            )
          ))}

          {/* User Avatar */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex items-center ${expanded ? "gap-2.5 w-full px-2 py-2 rounded-md hover:bg-sidebar-accent" : "justify-center w-10 h-10 rounded-lg hover:bg-sidebar-accent"} transition-colors focus:outline-none mt-1`}>
                <Avatar className="h-7 w-7 border border-sidebar-border shrink-0">
                  <AvatarFallback className="text-[11px] font-medium bg-sidebar-primary text-sidebar-primary-foreground">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                {expanded && (
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-xs font-medium text-sidebar-foreground truncate max-w-[120px]">
                      {user?.name || "用户"}
                    </span>
                  </div>
                )}
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

      {/* Help Guide Modal */}
      <HelpGuide open={helpOpen} onOpenChange={setHelpOpen} pageKey={location} />

      {/* Hover Popover - Sub menu (only in collapsed mode) */}
      {!expanded && hoveredSectionData && hoveredSectionData.items.length > 1 && (
        <HoverPopover
          ref={popoverRef}
          section={hoveredSectionData}
          sidebarWidth={ICON_BAR_WIDTH}
          location={location}
          onNavigate={setLocation}
          onMouseEnter={handlePopoverEnter}
          onMouseLeave={handlePopoverLeave}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar with Logo */}
        <header className="h-12 border-b border-border flex items-center justify-between px-5 shrink-0 bg-background/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663304605552/fRco6A2SeYp4EEqicyDKLT/nplus1-logo-transparent_aaa215a8.png"
              alt="N+1 STUDIOS"
              className="h-[18px] w-auto object-contain"
            />
            <span className="text-[10px] tracking-[0.15em] text-muted-foreground/60 uppercase">
              AI 工作平台
            </span>
          </div>
          <div className="flex items-center gap-2">
            {activeMenuItem && (
              <>
                <span className="mx-1 text-border">/</span>
                <span className="text-sm text-muted-foreground">
                  {activeMenuItem.label}
                </span>
              </>
            )}
            <button
              onClick={() => setHelpOpen(true)}
              className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ml-auto"
              title="查看使用指南"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}

/* ─── Sidebar Icon Button (Collapsed Mode) ───────────── */

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
          flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150
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
    </div>
  );
}

/* ─── Expanded Section (Expanded Mode) ───────────────── */

function ExpandedSection({
  section,
  location,
  onNavigate,
}: {
  section: MenuSection;
  location: string;
  onNavigate: (path: string) => void;
}) {
  const [open, setOpen] = useState(() =>
    section.items.some(
      (item) =>
        location === item.path ||
        (item.path !== "/" && location.startsWith(item.path))
    )
  );

  // Auto-open when navigating to a section item
  useEffect(() => {
    const hasActive = section.items.some(
      (item) =>
        location === item.path ||
        (item.path !== "/" && location.startsWith(item.path))
    );
    if (hasActive) setOpen(true);
  }, [location, section.items]);

  return (
    <div className="mb-0.5">
      <button
        onClick={() => {
          if (section.items.length === 1) {
            onNavigate(section.items[0].path);
          } else {
            setOpen((prev) => !prev);
          }
        }}
        className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-xs font-medium text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-colors uppercase tracking-wider"
      >
        <section.icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{section.label}</span>
        {section.items.length > 1 && (
          <svg
            className={`h-3 w-3 ml-auto shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        )}
      </button>
      {open && section.items.length > 1 && (
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5">
          {section.items.map((item) => {
            const isActive =
              location === item.path ||
              (item.path !== "/" && location.startsWith(item.path));
            return (
              <button
                key={item.path}
                onClick={() => onNavigate(item.path)}
                className={`
                  flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors
                  ${isActive
                    ? "bg-sidebar-accent text-sidebar-primary font-medium"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }
                `}
              >
                <item.icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/40"}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Hover Popover (Collapsed Mode) ─────────────────── */

const HoverPopover = forwardRef<
  HTMLDivElement,
  {
    section: MenuSection;
    sidebarWidth: number;
    location: string;
    onNavigate: (path: string) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  }
>(function HoverPopover({ section, sidebarWidth, location, onNavigate, onMouseEnter, onMouseLeave }, ref) {
  const [position, setPosition] = useState<{ top?: number; bottom?: number }>({});
  const popoverInnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.querySelector(`[data-section-id="${section.id}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const estimatedHeight = 32 + section.items.length * 36 + 12;
    if (rect.top + estimatedHeight > viewportH - 8) {
      setPosition({ bottom: viewportH - rect.bottom });
    } else {
      setPosition({ top: rect.top });
    }
  }, [section.id, section.items.length]);

  return (
    <div
      ref={(node) => {
        (popoverInnerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className="fixed z-[100] bg-popover text-popover-foreground border border-border rounded-lg shadow-lg py-1.5 min-w-[160px] animate-in fade-in-0 zoom-in-95 duration-100"
      style={{
        left: sidebarWidth + 4,
        ...(position.bottom !== undefined
          ? { bottom: position.bottom }
          : { top: position.top ?? 0 }),
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
