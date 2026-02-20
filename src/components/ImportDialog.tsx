import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2 } from "lucide-react";
import * as api from "@/lib/api";

interface ImportDialogProps {
  onImportComplete: () => void;
}

const ImportDialog = ({ onImportComplete }: ImportDialogProps) => {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<api.ImportResult | null>(null);

  const handleSelectFolder = async () => {
    try {
      setError(null);
      const selected = await open({
        directory: true,
        title: "Select Facebook Export Folder",
      });

      if (!selected) return;

      setImporting(true);
      const result = await api.importExport(selected as string);
      setStats(result);
      setTimeout(() => onImportComplete(), 1500);
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="max-w-md w-full mx-auto p-8 text-center space-y-6">
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
            Select your Facebook data export folder to get started. The app will
            scan your conversations and index all photos, videos, and GIFs.
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            Look for a folder named like{" "}
            <code className="bg-secondary px-1 py-0.5 rounded text-[10px]">
              facebook-yourname-date-xxx
            </code>
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
          <button
            onClick={handleSelectFolder}
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
                <FolderOpen className="h-4 w-4" />
                Select Export Folder
              </>
            )}
          </button>
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
