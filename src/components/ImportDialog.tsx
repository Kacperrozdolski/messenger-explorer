import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2, X, Plus } from "lucide-react";
import * as api from "@/lib/api";

interface ImportDialogProps {
  onImportComplete: () => void;
}

interface FolderEntry {
  path: string;
  format: "facebook" | "messenger" | null;
  error: string | null;
  detecting: boolean;
}

const ImportDialog = ({ onImportComplete }: ImportDialogProps) => {
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<api.ImportResult | null>(null);

  const handleAddFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        title: "Select Export Folder",
      });

      if (!selected) return;

      const path = selected as string;

      // Don't add duplicates
      if (folders.some((f) => f.path === path)) return;

      const entry: FolderEntry = {
        path,
        format: null,
        error: null,
        detecting: true,
      };
      setFolders((prev) => [...prev, entry]);

      try {
        const format = await api.detectFormat(path);
        setFolders((prev) =>
          prev.map((f) =>
            f.path === path ? { ...f, format, detecting: false } : f
          )
        );
      } catch (e) {
        setFolders((prev) =>
          prev.map((f) =>
            f.path === path
              ? { ...f, error: String(e), detecting: false }
              : f
          )
        );
      }
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

    try {
      setError(null);
      setImporting(true);
      const paths = validFolders.map((f) => f.path);
      const result = await api.importExport(paths);
      setStats(result);
      setTimeout(() => onImportComplete(), 1500);
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  const formatLabel = (format: string) =>
    format === "facebook" ? "Facebook" : "Messenger";

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="max-w-lg w-full mx-auto p-8 text-center space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Archive Explorer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Messenger Media Browser
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Select your Facebook or Messenger data export folders to get
            started. You can add multiple sources at once.
          </p>
        </div>

        {stats ? (
          <div className="bg-secondary rounded-lg p-4 text-[13px] text-foreground space-y-1">
            <p className="font-medium">Import complete!</p>
            <p className="text-muted-foreground">
              {stats.conversations} conversations, {stats.media} media files,{" "}
              {stats.senders} senders
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
                          Detecting format...
                        </p>
                      )}
                      {folder.format && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-medium">
                          {formatLabel(folder.format)}
                        </span>
                      )}
                      {folder.error && (
                        <p className="text-destructive mt-0.5">{folder.error}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveFolder(folder.path)}
                      className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add folder button */}
            <button
              onClick={handleAddFolder}
              disabled={importing}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary text-foreground rounded-md text-[13px] font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {folders.length === 0 ? (
                <>
                  <FolderOpen className="h-4 w-4" />
                  Select Export Folder
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Another Folder
                </>
              )}
            </button>

            {/* Import button */}
            {validFolders.length > 0 && (
              <div>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-md text-[13px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      Import {validFolders.length} source
                      {validFolders.length > 1 ? "s" : ""}
                    </>
                  )}
                </button>
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
