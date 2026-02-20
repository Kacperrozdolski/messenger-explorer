import { useState } from "react";
import { ChevronDown, ChevronRight, Users, User, Image, Video, Sparkles, Calendar } from "lucide-react";
import type { ChatSource, SenderInfo, FileTypeFilter } from "@/data/types";
import type { TimelineEntry } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ArchiveSidebarProps {
  conversations: ChatSource[];
  senders: SenderInfo[];
  selectedChat: number | null;
  onSelectChat: (id: number | null) => void;
  selectedSender: number | null;
  onSelectSender: (id: number | null) => void;
  fileType: FileTypeFilter;
  onFileTypeChange: (ft: FileTypeFilter) => void;
  selectedMonth: string | null;
  onSelectMonth: (month: string | null) => void;
  timelineData: TimelineEntry[];
}

const Section = ({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Icon className="h-3.5 w-3.5" />
        {title}
      </button>
      {open && <div className="px-1 pb-2">{children}</div>}
    </div>
  );
};

const ArchiveSidebar = ({
  conversations,
  senders,
  selectedChat,
  onSelectChat,
  selectedSender,
  onSelectSender,
  fileType,
  onFileTypeChange,
  selectedMonth,
  onSelectMonth,
  timelineData,
}: ArchiveSidebarProps) => {
  const groups = conversations.filter((c) => c.type === "group");
  const dms = conversations.filter((c) => c.type === "dm");
  const maxCount = Math.max(...timelineData.map((d) => d.count), 1);

  return (
    <aside className="w-60 min-w-[240px] h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <h1 className="text-sm font-bold text-foreground tracking-tight">Archive Explorer</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">Messenger Media Browser</p>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {/* Sources */}
        <Section title="Sources" icon={Users}>
          {groups.length > 0 && (
            <>
              <p className="px-3 py-1 text-[11px] text-muted-foreground font-medium">Group Chats</p>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => onSelectChat(selectedChat === g.id ? null : g.id)}
                  className={cn(
                    "flex items-center justify-between w-full px-3 py-1.5 text-[13px] rounded-md transition-colors",
                    selectedChat === g.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <span className="truncate">{g.name}</span>
                  <span className="text-[11px] bg-secondary px-1.5 py-0.5 rounded-full text-secondary-foreground">
                    {g.mediaCount}
                  </span>
                </button>
              ))}
            </>
          )}

          {dms.length > 0 && (
            <>
              <p className="px-3 py-1 mt-2 text-[11px] text-muted-foreground font-medium">Direct Messages</p>
              {dms.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onSelectChat(selectedChat === d.id ? null : d.id)}
                  className={cn(
                    "flex items-center justify-between w-full px-3 py-1.5 text-[13px] rounded-md transition-colors",
                    selectedChat === d.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <User className="h-3 w-3" />
                    {d.name}
                  </span>
                  <span className="text-[11px] bg-secondary px-1.5 py-0.5 rounded-full text-secondary-foreground">
                    {d.mediaCount}
                  </span>
                </button>
              ))}
            </>
          )}
        </Section>

        {/* Smart Filters */}
        <Section title="Smart Filters" icon={Sparkles}>
          <p className="px-3 py-1 text-[11px] text-muted-foreground font-medium">By Sender</p>
          {senders.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSender(selectedSender === s.id ? null : s.id)}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 text-[13px] rounded-md transition-colors",
                selectedSender === s.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <User className="h-3 w-3" />
              {s.name}
            </button>
          ))}

          <p className="px-3 py-1 mt-2 text-[11px] text-muted-foreground font-medium">By File Type</p>
          {(["all", "image", "video", "gif"] as FileTypeFilter[]).map((ft) => (
            <button
              key={ft}
              onClick={() => onFileTypeChange(ft)}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 text-[13px] rounded-md transition-colors capitalize",
                fileType === ft
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              {ft === "image" ? <Image className="h-3 w-3" /> : ft === "video" ? <Video className="h-3 w-3" /> : ft === "gif" ? <Sparkles className="h-3 w-3" /> : <Image className="h-3 w-3" />}
              {ft === "all" ? "All Types" : `${ft}s`}
            </button>
          ))}
        </Section>

        {/* Timeline */}
        <Section title="Timeline" icon={Calendar}>
          <div className="px-3 space-y-0.5">
            {timelineData.map((d) => (
              <button
                key={d.month_key}
                onClick={() => onSelectMonth(selectedMonth === d.month_key ? null : d.month_key)}
                className={cn(
                  "flex items-center gap-2 w-full py-1 text-[12px] rounded transition-colors group",
                  selectedMonth === d.month_key ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="w-16 text-left shrink-0">{d.label}</span>
                <div className="flex-1 h-3 bg-secondary rounded-sm overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-sm transition-all",
                      selectedMonth === d.month_key ? "bg-primary" : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50"
                    )}
                    style={{ width: `${(d.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-4 text-right">{d.count}</span>
              </button>
            ))}
          </div>
        </Section>
      </div>
    </aside>
  );
};

export default ArchiveSidebar;
