import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { FolderOpen, Loader2, X, Plus, HelpCircle, AlertTriangle, ExternalLink, Archive } from "lucide-react";
import { useTauriDrop } from "@/hooks/useTauriDrop";
import * as api from "@/lib/api";
import LanguageSelector from "@/components/LanguageSelector";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface ImportDialogProps {
  onImportComplete: () => void;
}

interface FolderEntry {
  path: string;
  format: "facebook" | "messenger" | null;
  error: string | null;
  detecting: boolean;
  isZip: boolean;
  extractedPath: string | null;
}

const StepRow = ({ num, titleKey, bodyKey }: { num: number; titleKey: string; bodyKey: string }) => {
  const { t } = useTranslation();
  return (
    <div className="flex gap-3">
      <div className="shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-[12px] font-semibold mt-0.5">
        {num}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{t(titleKey)}</p>
        <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{t(bodyKey)}</p>
      </div>
    </div>
  );
};

const FB_STEPS = [
  { titleKey: "tutorial.fbStep1title", bodyKey: "tutorial.fbStep1" },
  { titleKey: "tutorial.fbStep2title", bodyKey: "tutorial.fbStep2" },
  { titleKey: "tutorial.step3title", bodyKey: "tutorial.step3" },
  { titleKey: "tutorial.step4title", bodyKey: "tutorial.step4" },
  { titleKey: "tutorial.step5title", bodyKey: "tutorial.step5" },
];

const MSG_STEPS = [
  { titleKey: "tutorial.msgStep1title", bodyKey: "tutorial.msgStep1" },
  { titleKey: "tutorial.msgStep2title", bodyKey: "tutorial.msgStep2" },
  { titleKey: "tutorial.msgStep3title", bodyKey: "tutorial.msgStep3" },
];

const IG_STEPS = [
  { titleKey: "tutorial.igStep1title", bodyKey: "tutorial.igStep1" },
  { titleKey: "tutorial.igStep2title", bodyKey: "tutorial.igStep2" },
  { titleKey: "tutorial.step3title", bodyKey: "tutorial.step3" },
  { titleKey: "tutorial.step4title", bodyKey: "tutorial.step4" },
  { titleKey: "tutorial.step5title", bodyKey: "tutorial.step5" },
];

const SNAP_STEPS = [
  { titleKey: "tutorial.snapStep1title", bodyKey: "tutorial.snapStep1" },
  { titleKey: "tutorial.snapStep2title", bodyKey: "tutorial.snapStep2" },
  { titleKey: "tutorial.snapStep3title", bodyKey: "tutorial.snapStep3" },
];

const FACEBOOK_LINK = "https://accountscenter.facebook.com/info_and_permissions";
const MESSENGER_LINK = "https://www.messenger.com/secure_storage/dyi";
const INSTAGRAM_LINK = "https://accountscenter.instagram.com/info_and_permissions";
const SNAPCHAT_LINK = "https://accounts.snapchat.com/accounts/downloadmydata";

const TutorialDialog = () => {
  const { t } = useTranslation();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-[13px] text-primary hover:text-primary/80 transition-colors">
          <HelpCircle className="h-3.5 w-3.5" />
          {t("tutorial.openGuide")}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{t("tutorial.title")}</DialogTitle>
          <DialogDescription>{t("tutorial.intro")}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="facebook" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="facebook" className="flex-1 text-[13px]">
              {t("tutorial.tabFacebook")}
            </TabsTrigger>
            <TabsTrigger value="messenger" className="flex-1 text-[13px]">
              {t("tutorial.tabMessenger")}
            </TabsTrigger>
            <TabsTrigger value="instagram" className="flex-1 text-[13px]">
              {t("tutorial.tabInstagram")}
            </TabsTrigger>
            <TabsTrigger value="snapchat" className="flex-1 text-[13px]">
              {t("tutorial.tabSnapchat")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="facebook" className="space-y-4 mt-4">
            {/* Direct link */}
            <button
              onClick={() => openUrl(FACEBOOK_LINK)}
              className="flex items-center gap-2 w-full bg-primary/5 border border-primary/15 rounded-lg px-3.5 py-3 text-[12px] text-primary hover:bg-primary/10 transition-colors text-left"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="leading-relaxed">{t("tutorial.fbDirectLink")}</span>
            </button>

            {FB_STEPS.map((s, i) => (
              <StepRow key={s.titleKey} num={i + 1} titleKey={s.titleKey} bodyKey={s.bodyKey} />
            ))}

            {/* JSON tip */}
            <div className="flex gap-2.5 bg-primary/5 border border-primary/15 rounded-lg px-3.5 py-3">
              <AlertTriangle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-[12px] text-foreground leading-relaxed">
                {t("tutorial.tip")}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="messenger" className="space-y-4 mt-4">
            {/* Direct link */}
            <button
              onClick={() => openUrl(MESSENGER_LINK)}
              className="flex items-center gap-2 w-full bg-primary/5 border border-primary/15 rounded-lg px-3.5 py-3 text-[12px] text-primary hover:bg-primary/10 transition-colors text-left"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="leading-relaxed">{t("tutorial.msgDirectLink")}</span>
            </button>

            {MSG_STEPS.map((s, i) => (
              <StepRow key={s.titleKey} num={i + 1} titleKey={s.titleKey} bodyKey={s.bodyKey} />
            ))}
          </TabsContent>

          <TabsContent value="instagram" className="space-y-4 mt-4">
            {/* Direct link */}
            <button
              onClick={() => openUrl(INSTAGRAM_LINK)}
              className="flex items-center gap-2 w-full bg-primary/5 border border-primary/15 rounded-lg px-3.5 py-3 text-[12px] text-primary hover:bg-primary/10 transition-colors text-left"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="leading-relaxed">{t("tutorial.igDirectLink")}</span>
            </button>

            {IG_STEPS.map((s, i) => (
              <StepRow key={s.titleKey} num={i + 1} titleKey={s.titleKey} bodyKey={s.bodyKey} />
            ))}

            {/* JSON tip */}
            <div className="flex gap-2.5 bg-primary/5 border border-primary/15 rounded-lg px-3.5 py-3">
              <AlertTriangle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-[12px] text-foreground leading-relaxed">
                {t("tutorial.tip")}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="snapchat" className="space-y-4 mt-4">
            {/* Direct link */}
            <button
              onClick={() => openUrl(SNAPCHAT_LINK)}
              className="flex items-center gap-2 w-full bg-primary/5 border border-primary/15 rounded-lg px-3.5 py-3 text-[12px] text-primary hover:bg-primary/10 transition-colors text-left"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="leading-relaxed">{t("tutorial.snapDirectLink")}</span>
            </button>

            {SNAP_STEPS.map((s, i) => (
              <StepRow key={s.titleKey} num={i + 1} titleKey={s.titleKey} bodyKey={s.bodyKey} />
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

const ImportDialog = ({ onImportComplete }: ImportDialogProps) => {
  const { t } = useTranslation();
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<api.ImportResult | null>(null);
  const cancelledRef = useRef(false);

  const addPaths = useCallback((paths: string[]) => {
    for (const path of paths) {
      const isZip = /\.zip$/i.test(path);
      setFolders((prev) => {
        if (prev.some((f) => f.path === path)) return prev;
        return [...prev, { path, format: null, error: null, detecting: true, isZip, extractedPath: null }];
      });

      api.detectFormat(path).then(
        (format) => {
          setFolders((prev) =>
            prev.map((f) =>
              f.path === path ? { ...f, format, detecting: false } : f
            )
          );
        },
        (e) => {
          setFolders((prev) =>
            prev.map((f) =>
              f.path === path
                ? { ...f, error: String(e), detecting: false }
                : f
            )
          );
        }
      );
    }
  }, []);

  const isDragging = useTauriDrop(addPaths);

  const handleAddFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: true,
        title: "Select Export Folders",
      });

      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      addPaths(paths);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleAddZip = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: true,
        title: "Select Export Zip Files",
        filters: [{ name: "Zip Archives", extensions: ["zip"] }],
      });

      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      addPaths(paths);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemoveFolder = (path: string) => {
    setFolders((prev) => prev.filter((f) => f.path !== path));
  };

  const validFolders = folders.filter((f) => f.format && !f.error);

  const handleImport = async () => {
    if (validFolders.length === 0) return;

    cancelledRef.current = false;
    const extractedPaths: string[] = [];
    try {
      setError(null);
      setImporting(true);

      const zipFolders = validFolders.filter((f) => f.isZip);
      const regularFolders = validFolders.filter((f) => !f.isZip);
      const importPaths: string[] = regularFolders.map((f) => f.path);

      // Extract all zips to the same directory (multi-part exports merge)
      if (zipFolders.length > 0 && !cancelledRef.current) {
        const zipPaths = zipFolders.map((f) => f.path);
        const extracted = await api.extractZips(zipPaths);
        if (cancelledRef.current) throw new Error("Cancelled");
        extractedPaths.push(extracted);
        importPaths.push(extracted);
      }

      if (!cancelledRef.current && importPaths.length > 0) {
        const result = await api.importExport(importPaths);
        if (!cancelledRef.current) {
          setStats(result);
          setTimeout(() => onImportComplete(), 1500);
        }
      }
    } catch (e) {
      if (!cancelledRef.current) {
        setError(String(e));
      }
      // Only cleanup extracted zips on failure/cancel — on success the
      // database stores absolute paths into the extracted directory so the
      // files must remain on disk for images to load.
      for (const extracted of extractedPaths) {
        api.cleanupZipExtract(extracted).catch(() => {});
      }
    } finally {
      setImporting(false);
    }
  };

  const handleCancelImport = () => {
    cancelledRef.current = true;
  };

  const formatLabel = (format: string) =>
    format === "facebook" ? "Facebook" : "Messenger";

  return (
    <div className="relative flex h-screen items-center justify-center bg-background">
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-lg m-4 pointer-events-none">
          <div className="text-center">
            <FolderOpen className="h-12 w-12 text-primary mx-auto mb-3" />
            <p className="text-lg font-semibold text-primary">{t("import.dropHere")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("import.dropHereHint")}</p>
          </div>
        </div>
      )}

      <div className="absolute top-4 right-5">
        <LanguageSelector />
      </div>

      <div className="max-w-lg w-full mx-auto p-8 text-center space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            {t("brand.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("brand.subtitle")}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {t("import.description")}
          </p>
          <TutorialDialog />
        </div>

        {stats ? (
          <div className="bg-secondary rounded-lg p-4 text-[13px] text-foreground space-y-1">
            <p className="font-medium">{t("import.importComplete")}</p>
            <p className="text-muted-foreground">
              {t("import.stats", {
                conversations: stats.conversations,
                media: stats.media,
                senders: stats.senders,
              })}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Folder list */}
            {folders.length > 0 && (
              <div className="space-y-2 text-left">
                {folders.map((folder) => (
                  <div
                    key={folder.path}
                    className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2 text-[12px]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-foreground" title={folder.path}>
                        {folder.path.split(/[\\/]/).pop()}
                      </p>
                      {folder.detecting && (
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {t("import.detectingFormat")}
                        </p>
                      )}
                      {folder.format && (
                        <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-medium">
                          {folder.isZip && <Archive className="h-3 w-3" />}
                          {formatLabel(folder.format)}
                        </span>
                      )}
                      {folder.error && (
                        <p className="text-destructive mt-0.5">{folder.error}</p>
                      )}
                    </div>
                    {!importing && (
                      <button
                        onClick={() => handleRemoveFolder(folder.path)}
                        className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add folder / zip buttons */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={handleAddFolder}
                disabled={importing}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary text-foreground rounded-md text-[13px] font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                {folders.length === 0 ? (
                  <>
                    <FolderOpen className="h-4 w-4" />
                    {t("import.selectFolder")}
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    {t("import.addAnother")}
                  </>
                )}
              </button>
              <button
                onClick={handleAddZip}
                disabled={importing}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary text-foreground rounded-md text-[13px] font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                <Archive className="h-4 w-4" />
                {t("import.selectZip")}
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground">{t("import.orDragAndDrop")}</p>

            {/* Import button */}
            {validFolders.length > 0 && (
              <div className="flex items-center justify-center gap-2">
                {importing ? (
                  <>
                    <button
                      disabled
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-md text-[13px] font-medium opacity-50"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("import.importing")}
                    </button>
                    <button
                      onClick={handleCancelImport}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary text-foreground rounded-md text-[13px] font-medium hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      {t("import.cancel")}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleImport}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-md text-[13px] font-medium hover:bg-primary/90 transition-colors"
                  >
                    {validFolders.length > 1
                      ? t("import.importButtonPlural", { count: validFolders.length })
                      : t("import.importButton", { count: validFolders.length })}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-[12px] text-destructive bg-destructive/10 rounded-md p-3">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

export default ImportDialog;
