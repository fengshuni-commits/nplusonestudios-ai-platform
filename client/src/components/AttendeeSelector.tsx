import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Users, X, Plus, ChevronDown, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

export type Attendee = {
  id: string;          // "user-{id}" for internal, "ext-{name}" for external
  name: string;
  label?: string;      // optional role/company label, e.g. "甲方"
  isExternal: boolean;
};

interface AttendeeSelectorProps {
  value: Attendee[];
  onChange: (attendees: Attendee[]) => void;
}

export default function AttendeeSelector({ value, onChange }: AttendeeSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [externalName, setExternalName] = useState("");
  const [externalLabel, setExternalLabel] = useState("");
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: teamMembers = [] } = trpc.tasks.listTeamMembers.useQuery();

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setShowExternalForm(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedIds = new Set(value.map((a) => a.id));

  const filteredMembers = (teamMembers as any[]).filter((m) => {
    const name = m.name || m.email || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const toggleMember = (member: any) => {
    const id = `user-${member.id}`;
    if (selectedIds.has(id)) {
      onChange(value.filter((a) => a.id !== id));
    } else {
      onChange([...value, { id, name: member.name || member.email || "成员", isExternal: false }]);
    }
  };

  const addExternal = () => {
    const name = externalName.trim();
    if (!name) return;
    const id = `ext-${name}-${Date.now()}`;
    onChange([...value, { id, name, label: externalLabel.trim() || undefined, isExternal: true }]);
    setExternalName("");
    setExternalLabel("");
    setShowExternalForm(false);
  };

  const removeAttendee = (id: string) => {
    onChange(value.filter((a) => a.id !== id));
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        参会人员
      </Label>

      {/* Selected attendee tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 rounded-md border border-border bg-muted/20 min-h-[36px]">
          {value.map((attendee) => (
            <Badge
              key={attendee.id}
              variant="secondary"
              className={cn(
                "flex items-center gap-1 pr-1 text-xs font-normal",
                attendee.isExternal && "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800"
              )}
            >
              <span>{attendee.name}</span>
              {attendee.label && (
                <span className="opacity-60">·{attendee.label}</span>
              )}
              <button
                type="button"
                onClick={() => removeAttendee(attendee.id)}
                className="ml-0.5 rounded-full hover:bg-black/10 p-0.5"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setDropdownOpen((o) => !o); setShowExternalForm(false); }}
        className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-border bg-background text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
      >
        <span>{value.length > 0 ? `已选 ${value.length} 人` : "选择或添加参会人员…"}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", dropdownOpen && "rotate-180")} />
      </button>

      {/* Dropdown panel */}
      {dropdownOpen && (
        <div className="rounded-md border border-border bg-popover shadow-md overflow-hidden z-50">
          {/* Search internal members */}
          <div className="p-2 border-b border-border">
            <Input
              autoFocus
              placeholder="搜索团队成员…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Internal members list */}
          <div className="max-h-48 overflow-y-auto">
            {filteredMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">无匹配成员</p>
            ) : (
              filteredMembers.map((member: any) => {
                const id = `user-${member.id}`;
                const isSelected = selectedIds.has(id);
                const displayName = member.name || member.email || "成员";
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleMember(member)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent/50 transition-colors text-left",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    {/* Avatar circle */}
                    <div className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{displayName}</p>
                      {member.department && (
                        <p className="text-xs text-muted-foreground truncate">{member.department}</p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <svg className="h-2.5 w-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Add external client section */}
          <div className="border-t border-border">
            {!showExternalForm ? (
              <button
                type="button"
                onClick={() => setShowExternalForm(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                添加外部客户 / 顾问…
              </button>
            ) : (
              <div className="p-3 space-y-2 bg-amber-50/50 dark:bg-amber-950/10">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <UserPlus className="h-3 w-3" />外部参会人
                </p>
                <Input
                  autoFocus
                  placeholder="姓名 *"
                  value={externalName}
                  onChange={(e) => setExternalName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addExternal()}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="身份备注（如：甲方、结构顾问）"
                  value={externalLabel}
                  onChange={(e) => setExternalLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addExternal()}
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs flex-1" onClick={addExternal} disabled={!externalName.trim()}>
                    <Plus className="h-3 w-3 mr-1" />添加
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowExternalForm(false); setExternalName(""); setExternalLabel(""); }}>
                    取消
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
