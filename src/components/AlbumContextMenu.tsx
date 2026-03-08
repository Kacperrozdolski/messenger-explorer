import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, MessageCircle, Trash2, FolderOpen } from "lucide-react";
import type { AlbumInfo } from "@/data/types";
import { ALBUM_COLORS } from "@/data/types";
import * as api from "@/lib/api";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
  ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ColorPicker from "./ColorPicker";

interface AlbumContextMenuProps {
  children: React.ReactNode;
  mediaId: number;
  filePath?: string;
  albums: AlbumInfo[];
  activeAlbumId: number | null;
  onShowContext?: () => void;
}

const AlbumContextMenu = ({
  children,
  mediaId,
  filePath,
  albums,
  activeAlbumId,
  onShowContext,
}: AlbumContextMenuProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [mediaAlbumIds, setMediaAlbumIds] = useState<number[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumColor, setNewAlbumColor] = useState<string>(ALBUM_COLORS[0]);

  const invalidateAlbums = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["albums"] });
  }, [queryClient]);

  const addToAlbum = useMutation({
    mutationFn: (albumId: number) => api.addMediaToAlbum(albumId, mediaId),
    onSuccess: () => invalidateAlbums(),
  });

  const removeFromAlbum = useMutation({
    mutationFn: (albumId: number) => api.removeMediaFromAlbum(albumId, mediaId),
    onSuccess: () => invalidateAlbums(),
  });

  const createAlbum = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const albumId = await api.createAlbum(name, color);
      await api.addMediaToAlbum(albumId, mediaId);
      return albumId;
    },
    onSuccess: () => {
      invalidateAlbums();
      setCreateDialogOpen(false);
      setNewAlbumName("");
      setNewAlbumColor(ALBUM_COLORS[0]);
    },
  });

  const handleOpenChange = useCallback(
    async (open: boolean) => {
      if (open) {
        const ids = await api.getMediaAlbums(mediaId);
        setMediaAlbumIds(ids);
      }
    },
    [mediaId],
  );

  const handleToggleAlbum = useCallback(
    (albumId: number, isInAlbum: boolean) => {
      if (isInAlbum) {
        removeFromAlbum.mutate(albumId);
        setMediaAlbumIds((prev) => prev.filter((id) => id !== albumId));
      } else {
        addToAlbum.mutate(albumId);
        setMediaAlbumIds((prev) => [...prev, albumId]);
      }
    },
    [addToAlbum, removeFromAlbum],
  );

  const handleCreateSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = newAlbumName.trim();
      if (trimmed) {
        createAlbum.mutate({ name: trimmed, color: newAlbumColor });
      }
    },
    [newAlbumName, newAlbumColor, createAlbum],
  );

  return (
    <>
      <ContextMenu onOpenChange={handleOpenChange}>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Plus className="h-4 w-4 mr-2" />
              {t("albums.addToAlbum")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {albums.map((album) => {
                const isInAlbum = mediaAlbumIds.includes(album.id);
                return (
                  <ContextMenuCheckboxItem
                    key={album.id}
                    checked={isInAlbum}
                    onSelect={(e) => {
                      e.preventDefault();
                      handleToggleAlbum(album.id, isInAlbum);
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0 mr-1.5"
                      style={{ backgroundColor: album.color }}
                    />
                    {album.name}
                  </ContextMenuCheckboxItem>
                );
              })}
              {albums.length > 0 && <ContextMenuSeparator />}
              <ContextMenuItem onSelect={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t("albums.createNew")}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          {activeAlbumId !== null && (
            <ContextMenuItem
              onSelect={() => removeFromAlbum.mutate(activeAlbumId)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("albums.removeFromAlbum")}
            </ContextMenuItem>
          )}

          <ContextMenuSeparator />

          {onShowContext && (
            <ContextMenuItem onSelect={onShowContext}>
              <MessageCircle className="h-4 w-4 mr-2" />
              {t("gallery.showContext")}
            </ContextMenuItem>
          )}

          {filePath && (
            <ContextMenuItem onSelect={() => api.showInFolder(filePath)}>
              <FolderOpen className="h-4 w-4 mr-2" />
              {t("gallery.openInExplorer")}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("albums.createTitle")}</DialogTitle>
            <DialogDescription />
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <Input
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              placeholder={t("albums.namePlaceholder")}
              autoFocus
            />
            <div>
              <p className="text-sm text-muted-foreground mb-2">{t("albums.color")}</p>
              <ColorPicker value={newAlbumColor} onChange={setNewAlbumColor} />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
              >
                {t("albums.cancel")}
              </Button>
              <Button type="submit" disabled={!newAlbumName.trim()}>
                {t("albums.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AlbumContextMenu;
