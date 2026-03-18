import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import {
  Brain,
  Users,
  User,
  Search,
  Play,
  Square,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { ChatSource, SenderInfo } from "@/data/types";

interface SelectiveIndexingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: ChatSource[];
  senders: SenderInfo[];
  /** Pre-select a sender when opening from context menu */
  initialSenderIds?: number[];
  /** Pre-select conversations when opening from context menu */
  initialConversationIds?: number[];
}

const SelectiveIndexingDialog = ({
  open,
  onOpenChange,
  conversations,
  senders,
  initialSenderIds,
  initialConversationIds,
}: SelectiveIndexingDialogProps) => {
  const { t } = useTranslation();
  const [selectedSenderIds, setSelectedSenderIds] = useState<Set<number>>(new Set());
  const [selectedConvIds, setSelectedConvIds] = useState<Set<number>>(new Set());
  const [senderSearch, setSenderSearch] = useState("");
  const [convSearch, setConvSearch] = useState("");
  const [indexingProgress, setIndexingProgress] = useState<api.IndexingProgress | null>(null);

  const { data: hasModels } = useQuery({
    queryKey: ["has-clip-models"],
    queryFn: api.hasClipModels,
  });

  const { data: indexingStatus, refetch: refetchIndexing } = useQuery({
    queryKey: ["indexing-status"],
    queryFn: api.getIndexingStatus,
  });

  const { data: unindexedCounts, refetch: refetchUnindexed } = useQuery({
    queryKey: ["unindexed-counts"],
    queryFn: api.getUnindexedCounts,
    enabled: open,
  });

  // Build lookup maps: { totalImages, unindexed } per sender/conversation
  const senderIndexInfo = useMemo(() => {
    const map = new Map<number, { totalImages: number; unindexed: number }>();
    if (unindexedCounts) {
      for (const s of unindexedCounts.senders) map.set(s.id, { totalImages: s.total_images, unindexed: s.unindexed });
    }
    return map;
  }, [unindexedCounts]);

  const convIndexInfo = useMemo(() => {
    const map = new Map<number, { totalImages: number; unindexed: number }>();
    if (unindexedCounts) {
      for (const c of unindexedCounts.conversations) map.set(c.id, { totalImages: c.total_images, unindexed: c.unindexed });
    }
    return map;
  }, [unindexedCounts]);

  // Reset selections when dialog opens, but restore from backend scope if indexing is running
  useEffect(() => {
    if (open) {
      setSenderSearch("");
      setConvSearch("");
      refetchIndexing().then(async (result) => {
        const currentlyRunning = result.data?.is_running ?? false;
        if (currentlyRunning) {
          // Restore the active indexing scope from the backend
          try {
            const scope = await api.getIndexingScope();
            setSelectedSenderIds(new Set(scope.sender_ids));
            setSelectedConvIds(new Set(scope.conversation_ids));
          } catch {
            // Scope unavailable, keep current state
          }
        } else {
          // Not running — apply the initial selections from props
          setSelectedSenderIds(new Set(initialSenderIds ?? []));
          setSelectedConvIds(new Set(initialConversationIds ?? []));
          setIndexingProgress(null);
        }
      });
    }
  }, [open, initialSenderIds, initialConversationIds, refetchIndexing]);

  // Listen for indexing progress events
  useEffect(() => {
    if (!open) return;
    const unlisten = listen<api.IndexingProgress>("indexing-progress", (event) => {
      setIndexingProgress(event.payload);
      if (!event.payload.is_running) {
        refetchIndexing();
        refetchUnindexed();
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, [open, refetchIndexing]);

  const isRunning = indexingProgress?.is_running ?? indexingStatus?.is_running ?? false;

  // Sorted lists
  const sortedSenders = useMemo(
    () => [...senders].sort((a, b) => b.mediaCount - a.mediaCount),
    [senders],
  );
  const sortedConvs = useMemo(
    () => [...conversations].sort((a, b) => b.mediaCount - a.mediaCount),
    [conversations],
  );

  // Filtered by search
  const filteredSenders = useMemo(() => {
    if (!senderSearch) return sortedSenders;
    const q = senderSearch.toLowerCase();
    return sortedSenders.filter((s) => s.name.toLowerCase().includes(q));
  }, [sortedSenders, senderSearch]);

  const filteredConvs = useMemo(() => {
    if (!convSearch) return sortedConvs;
    const q = convSearch.toLowerCase();
    return sortedConvs.filter((c) => c.name.toLowerCase().includes(q));
  }, [sortedConvs, convSearch]);

  // Count of unindexed images in the selection
  const selectedUnindexedCount = useMemo(() => {
    let count = 0;
    for (const id of selectedSenderIds) {
      count += senderIndexInfo.get(id)?.unindexed ?? 0;
    }
    for (const id of selectedConvIds) {
      count += convIndexInfo.get(id)?.unindexed ?? 0;
    }
    return count;
  }, [selectedSenderIds, selectedConvIds, senderIndexInfo, convIndexInfo]);

  const hasSelection = selectedSenderIds.size > 0 || selectedConvIds.size > 0;

  const toggleSender = useCallback((id: number) => {
    setSelectedSenderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleConv = useCallback((id: number) => {
    setSelectedConvIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleStart = async () => {
    try {
      await api.startIndexingFiltered(
        Array.from(selectedSenderIds),
        Array.from(selectedConvIds),
      );
      refetchIndexing();
    } catch (e) {
      console.error("Failed to start filtered indexing:", e);
    }
  };

  const handleCancel = async () => {
    try {
      await api.cancelIndexing();
    } catch (e) {
      console.error("Failed to cancel indexing:", e);
    }
  };

  const activeTab = (initialConversationIds?.length ?? 0) > 0 ? "groups" : "senders";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            {t("indexing.title", "Selective AI Indexing")}
          </DialogTitle>
          <DialogDescription>
            {t("indexing.description", "Select senders or groups to index with AI. Only images from selected items will be processed.")}
          </DialogDescription>
        </DialogHeader>

        {!hasModels ? (
          <p className="text-sm text-muted-foreground py-4">
            {t("settings.aiModelsNotFound", "CLIP model files not found.")}
          </p>
        ) : (
          <>
            <Tabs defaultValue={activeTab} className="flex-1 min-h-0 flex flex-col">
              <TabsList className="w-full">
                <TabsTrigger value="senders" className="flex-1 gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {t("sidebar.senders", "Senders")}
                  {selectedSenderIds.size > 0 && (
                    <span className="ml-1 text-[10px] bg-primary text-primary-foreground rounded-full px-1.5">
                      {selectedSenderIds.size}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="groups" className="flex-1 gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {t("sidebar.groups", "Sources")}
                  {selectedConvIds.size > 0 && (
                    <span className="ml-1 text-[10px] bg-primary text-primary-foreground rounded-full px-1.5">
                      {selectedConvIds.size}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="senders" className="flex-1 min-h-0 flex flex-col mt-2">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={senderSearch}
                    onChange={(e) => setSenderSearch(e.target.value)}
                    placeholder={t("sidebar.searchSenders", "Search senders...")}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <div className="flex-1 overflow-y-auto max-h-[40vh] space-y-0.5 pr-1">
                  {filteredSenders.map((sender) => {
                    const selected = selectedSenderIds.has(sender.id);
                    const info = senderIndexInfo.get(sender.id);
                    const totalImages = info?.totalImages ?? 0;
                    const unindexed = info?.unindexed ?? 0;
                    const noImages = totalImages === 0;
                    const fullyIndexed = totalImages > 0 && unindexed === 0;
                    const disabled = noImages || fullyIndexed;
                    return (
                      <button
                        key={sender.id}
                        onClick={() => !disabled && toggleSender(sender.id)}
                        disabled={disabled}
                        className={cn(
                          "flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] rounded-md transition-colors",
                          disabled
                            ? "text-muted-foreground/50 cursor-default"
                            : selected
                              ? "bg-primary/10 text-primary"
                              : "text-foreground hover:bg-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                            disabled
                              ? "bg-muted border-muted-foreground/20"
                              : selected
                                ? "bg-primary border-primary"
                                : "border-muted-foreground/30",
                          )}
                        >
                          {(selected || fullyIndexed) && <Check className={cn("h-3 w-3", disabled ? "text-muted-foreground/40" : "text-primary-foreground")} />}
                        </span>
                        <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate flex-1 text-left">{sender.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {noImages
                            ? t("indexing.noImages", "no images")
                            : fullyIndexed
                              ? t("indexing.indexed", "indexed")
                              : t("indexing.unindexedCount", { defaultValue: "{{count}} to index", count: unindexed })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="groups" className="flex-1 min-h-0 flex flex-col mt-2">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={convSearch}
                    onChange={(e) => setConvSearch(e.target.value)}
                    placeholder={t("sidebar.searchGroups", "Search groups...")}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <div className="flex-1 overflow-y-auto max-h-[40vh] space-y-0.5 pr-1">
                  {filteredConvs.map((conv) => {
                    const selected = selectedConvIds.has(conv.id);
                    const info = convIndexInfo.get(conv.id);
                    const totalImages = info?.totalImages ?? 0;
                    const unindexed = info?.unindexed ?? 0;
                    const noImages = totalImages === 0;
                    const fullyIndexed = totalImages > 0 && unindexed === 0;
                    const disabled = noImages || fullyIndexed;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => !disabled && toggleConv(conv.id)}
                        disabled={disabled}
                        className={cn(
                          "flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] rounded-md transition-colors",
                          disabled
                            ? "text-muted-foreground/50 cursor-default"
                            : selected
                              ? "bg-primary/10 text-primary"
                              : "text-foreground hover:bg-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                            disabled
                              ? "bg-muted border-muted-foreground/20"
                              : selected
                                ? "bg-primary border-primary"
                                : "border-muted-foreground/30",
                          )}
                        >
                          {(selected || fullyIndexed) && <Check className={cn("h-3 w-3", disabled ? "text-muted-foreground/40" : "text-primary-foreground")} />}
                        </span>
                        <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate flex-1 text-left">{conv.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {noImages
                            ? t("indexing.noImages", "no images")
                            : fullyIndexed
                              ? t("indexing.indexed", "indexed")
                              : t("indexing.unindexedCount", { defaultValue: "{{count}} to index", count: unindexed })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>

            {/* Progress bar when running */}
            {isRunning && (() => {
              const progress = indexingProgress ?? indexingStatus;
              if (!progress || progress.total === 0) return null;
              const pct = Math.round((progress.indexed / progress.total) * 100);
              return (
                <div className="space-y-1.5">
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[12px] text-muted-foreground text-center">
                    {t("settings.aiIndexing", {
                      defaultValue: "Indexing... {{indexed}} / {{total}} ({{pct}}%)",
                      indexed: progress.indexed,
                      total: progress.total,
                      pct,
                    })}
                  </p>
                </div>
              );
            })()}

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-[12px] text-muted-foreground">
                {isRunning
                  ? t("indexing.inProgress", "Indexing in progress...")
                  : hasSelection
                    ? t("indexing.selectedCount", {
                        defaultValue: "~{{count}} images to index",
                        count: selectedUnindexedCount,
                      })
                    : t("indexing.noSelection", "No items selected")}
              </div>
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCancel}>
                    <Square className="h-3.5 w-3.5" />
                    {t("settings.aiCancel", "Cancel")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={handleStart}
                    disabled={!hasSelection}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {t("indexing.startButton", "Start Indexing")}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SelectiveIndexingDialog;
