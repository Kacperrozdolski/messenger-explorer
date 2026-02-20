import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Database, Trash2, HardDrive, Loader2 } from "lucide-react";
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const Settings = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [clearing, setClearing] = useState(false);

  const { data: storageInfo } = useQuery({
    queryKey: ["storage-info"],
    queryFn: api.getStorageInfo,
  });

  const { data: importStatus } = useQuery({
    queryKey: ["import-status"],
    queryFn: api.getImportStatus,
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
            Back
          </Button>
          <h1 className="text-sm font-medium">Settings</h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Storage Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Data & Storage</CardTitle>
                </div>
                <CardDescription>
                  Manage your imported data and free up space
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Stats */}
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <HardDrive className="h-3.5 w-3.5" />
                    <span>
                      Database size:{" "}
                      <span className="text-foreground font-medium">
                        {storageInfo
                          ? formatBytes(storageInfo.db_size_bytes)
                          : "..."}
                      </span>
                    </span>
                  </div>
                  {importStatus && importStatus.has_data && (
                    <span className="text-muted-foreground">
                      {importStatus.media_count} media across{" "}
                      {importStatus.conversation_count} conversations
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
                      Clear Database
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear all data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all imported conversations,
                        media entries, and context messages from the database.
                        Your original export files will not be affected. You can
                        re-import them later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleClearDatabase}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Clear Everything
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
