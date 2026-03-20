import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { useTauriDrop } from "@/hooks/useTauriDrop";
import {
  ArrowLeft,
  Database,
  Trash2,
  HardDrive,
  Loader2,
  FolderOpen,
  Plus,
  X,
  Globe,
  Brain,
  Play,
  Square,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import * as api from "@/lib/api";
import LanguageSelector from "@/components/LanguageSelector";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const Settings = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [clearing, setClearing] = useState(false);
  const [addingSource, setAddingSource] = useState(false);
  const [removingPath, setRemovingPath] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [indexingProgress, setIndexingProgress] = useState<api.IndexingProgress | null>(null);

  const { data: hasModels } = useQuery({
    queryKey: ["has-clip-models"],
    queryFn: api.hasClipModels,
  });

  const { data: indexingStatus, refetch: refetchIndexing } = useQuery({
    queryKey: ["indexing-status"],
    queryFn: api.getIndexingStatus,
  });

  // Listen for indexing progress events
  useEffect(() => {
    const unlisten = listen<api.IndexingProgress>("indexing-progress", (event) => {
      setIndexingProgress(event.payload);
      if (!event.payload.is_running) {
        refetchIndexing();
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, [refetchIndexing]);

  const handleStartIndexing = async () => {
    try {
      await api.startIndexing();
      refetchIndexing();
    } catch (e) {
      console.error("Failed to start indexing:", e);
    }
  };

  const handleCancelIndexing = async () => {
    try {
      await api.cancelIndexing();
    } catch (e) {
      console.error("Failed to cancel indexing:", e);
    }
  };

  const handleClearEmbeddings = async () => {
    try {
      await api.clearEmbeddings();
      setIndexingProgress(null);
      refetchIndexing();
    } catch (e) {
      console.error("Failed to clear embeddings:", e);
    }
  };

  const { data: storageInfo } = useQuery({
    queryKey: ["storage-info"],
    queryFn: api.getStorageInfo,
  });

  const { data: importStatus } = useQuery({
    queryKey: ["import-status"],
    queryFn: api.getImportStatus,
  });

  const { data: sources = [] } = useQuery({
    queryKey: ["sources"],
    queryFn: api.getSources,
  });

  const handleClearDatabase = async () => {
    setClearing(true);
    try {
      await api.clearDatabase();
      queryClient.invalidateQueries();
    } finally {
      setClearing(false);
    }
  };

  const resolveAndAddSources = useCallback(async (paths: string[]) => {
    setAddError(null);
    setAddingSource(true);
    try {
      for (const path of paths) {
        const results = await api.detectFormat(path);
        for (const result of results) {
          await api.addSource(result.resolvedPath);
        }
      }
      queryClient.invalidateQueries();
    } catch (e) {
      setAddError(String(e));
    } finally {
      setAddingSource(false);
    }
  }, [queryClient]);

  const handleDrop = useCallback((paths: string[]) => {
    resolveAndAddSources(paths);
  }, [resolveAndAddSources]);

  const isDragging = useTauriDrop(handleDrop);

  const handleAddSource = async () => {
    try {
      const selected = await open({
        directory: true,
        title: "Select Export Folder to Add",
      });
      if (!selected) return;

      await resolveAndAddSources([selected as string]);
    } catch (e) {
      setAddError(String(e));
    }
  };

  const handleRemoveSource = async (sourcePath: string) => {
    setRemovingPath(sourcePath);
    try {
      await api.removeSource(sourcePath);
      queryClient.invalidateQueries();
    } catch (e) {
      console.error("Failed to remove source:", e);
    } finally {
      setRemovingPath(null);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-14 border-b border-border flex items-center gap-3 px-5 bg-card/50 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("settings.back")}
          </Button>
          <h1 className="text-sm font-medium">{t("settings.title")}</h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Language Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">{t("settings.language")}</CardTitle>
                </div>
                <CardDescription>
                  {t("settings.languageDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LanguageSelector />
              </CardContent>
            </Card>

            {/* AI Search Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">{t("settings.aiSearch", "AI Search")}</CardTitle>
                </div>
                <CardDescription>
                  {t("settings.aiSearchDesc", "Index your images with AI to search by visual content (e.g. \"mountains\", \"memes\", \"sunset\").")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!hasModels ? (
                  <p className="text-sm text-muted-foreground">
                    {t("settings.aiModelsNotFound", "CLIP model files not found. Place clip-visual.onnx, clip-textual.onnx, and tokenizer.json in the models directory.")}
                  </p>
                ) : (
                  <>
                    {/* Status */}
                    <div className="text-sm text-muted-foreground">
                      {(() => {
                        const status = indexingProgress || indexingStatus;
                        if (!status) return t("settings.aiNotIndexed", "No images indexed yet.");
                        if (status.is_running) {
                          if (status.status === "loading_model") {
                            return t("settings.aiLoadingModel", "Loading AI model...");
                          }
                          const pct = status.total > 0 ? Math.round((status.indexed / status.total) * 100) : 0;
                          return t("settings.aiIndexing", {
                            defaultValue: "Indexing... {{indexed}} / {{total}} ({{pct}}%)",
                            indexed: status.indexed,
                            total: status.total,
                            pct,
                          });
                        }
                        if (status.indexed > 0) {
                          return t("settings.aiIndexed", {
                            defaultValue: "{{indexed}} / {{total}} images indexed.",
                            indexed: status.indexed,
                            total: status.total,
                          });
                        }
                        return t("settings.aiNotIndexed", "No images indexed yet.");
                      })()}
                    </div>

                    {/* Progress bar */}
                    {(() => {
                      const status = indexingProgress || indexingStatus;
                      if (status && status.total > 0) {
                        const pct = Math.round((status.indexed / status.total) * 100);
                        return (
                          <div className="w-full bg-secondary rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Error */}
                    {(() => {
                      const status = indexingProgress || indexingStatus;
                      if (status?.error) {
                        return (
                          <p className="text-[12px] text-destructive bg-destructive/10 rounded-md p-3 font-mono break-all">
                            {status.error}
                          </p>
                        );
                      }
                      return null;
                    })()}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {(() => {
                        const status = indexingProgress || indexingStatus;
                        const isRunning = status?.is_running ?? false;

                        if (isRunning) {
                          return (
                            <Button
                              variant="outline"
                              className="gap-2"
                              onClick={handleCancelIndexing}
                            >
                              <Square className="h-4 w-4" />
                              {t("settings.aiCancel", "Cancel")}
                            </Button>
                          );
                        }

                        return (
                          <>
                            <Button
                              variant="outline"
                              className="gap-2"
                              onClick={handleStartIndexing}
                            >
                              <Play className="h-4 w-4" />
                              {status && status.indexed > 0 && status.indexed < status.total
                                ? t("settings.aiResume", "Resume Indexing")
                                : t("settings.aiBuildIndex", "Build Index")}
                            </Button>
                            {status && status.indexed > 0 && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    {t("settings.aiReset", "Reset")}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{t("settings.aiResetTitle", "Reset AI Index")}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t("settings.aiResetDesc", "This will delete all image embeddings. You'll need to re-index to use AI search.")}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t("settings.cancel")}</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={handleClearEmbeddings}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      {t("settings.aiResetConfirm", "Reset Index")}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Data Sources Card */}
            <Card className="relative overflow-hidden">
              {isDragging && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-lg pointer-events-none">
                  <div className="text-center">
                    <FolderOpen className="h-10 w-10 text-primary mx-auto mb-2" />
                    <p className="text-base font-semibold text-primary">{t("import.dropHere")}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{t("import.dropHereHint")}</p>
                  </div>
                </div>
              )}
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">{t("settings.dataSources")}</CardTitle>
                </div>
                <CardDescription>
                  {t("settings.dataSourcesDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {sources.length > 0 ? (
                  <div className="space-y-2">
                    {sources.map((source) => (
                      <div
                        key={source.source_path}
                        className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className="text-sm font-medium truncate"
                              title={source.source_path}
                            >
                              {source.source_path.split(/[\\/]/).pop()}
                            </p>
                            <span className="shrink-0 inline-block px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-medium capitalize">
                              {source.source_type}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {source.conversations} {t("settings.conversations")}, {source.media_count} {t("settings.media")}
                          </p>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                              disabled={removingPath === source.source_path}
                            >
                              {removingPath === source.source_path ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <X className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("settings.removeSource")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("settings.removeSourceDesc")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("settings.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleRemoveSource(source.source_path)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t("settings.remove")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("settings.noSources")}
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={handleAddSource}
                    disabled={addingSource}
                  >
                    {addingSource ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {t("settings.addSource")}
                  </Button>
                  <span className="text-[12px] text-muted-foreground">{t("import.orDragAndDrop")}</span>
                </div>

                {addError && (
                  <p className="text-[12px] text-destructive bg-destructive/10 rounded-md p-3">
                    {addError}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Storage Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">{t("settings.dataStorage")}</CardTitle>
                </div>
                <CardDescription>
                  {t("settings.dataStorageDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Stats */}
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <HardDrive className="h-3.5 w-3.5" />
                    <span>
                      {t("settings.dbSize")}{" "}
                      <span className="text-foreground font-medium">
                        {storageInfo
                          ? formatBytes(storageInfo.db_size_bytes)
                          : "..."}
                      </span>
                    </span>
                  </div>
                  {importStatus && importStatus.has_data && (
                    <span className="text-muted-foreground">
                      {t("settings.mediaAcross", {
                        media: importStatus.media_count,
                        conversations: importStatus.conversation_count,
                      })}
                    </span>
                  )}
                </div>

                {/* Clear Database */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="gap-2"
                      disabled={clearing}
                    >
                      {clearing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      {t("settings.clearDatabase")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("settings.clearAllData")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("settings.clearAllDataDesc")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("settings.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleClearDatabase}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t("settings.clearEverything")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
