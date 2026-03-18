import { useState, useCallback, memo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Plus, Check } from "lucide-react";
import type { AlbumInfo } from "@/data/types";
import { ALBUM_COLORS } from "@/data/types";
import * as api from "@/lib/api";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
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

interface AlbumPickerButtonProps {
  mediaId: number;
  albums: AlbumInfo[];
  className?: string;
}

const AlbumPickerButton = ({ mediaId, albums, className }: AlbumPickerButtonProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
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
    async (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        const ids = await api.getMediaAlbums(mediaId);
        setMediaAlbumIds(ids);
      }
    },
    [mediaId],
  );

  const addToAlbumRef = useRef(addToAlbum);
  addToAlbumRef.current = addToAlbum;
  const removeFromAlbumRef = useRef(removeFromAlbum);
  removeFromAlbumRef.current = removeFromAlbum;

  const handleToggle = useCallback(
    (albumId: number, isInAlbum: boolean) => {
      if (isInAlbum) {
        removeFromAlbumRef.current.mutate(albumId);
        setMediaAlbumIds((prev) => prev.filter((id) => id !== albumId));
      } else {
        addToAlbumRef.current.mutate(albumId);
        setMediaAlbumIds((prev) => [...prev, albumId]);
      }
    },
    [],
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
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            className={className}
            onClick={(e) => e.stopPropagation()}
            title={t("albums.addToAlbum")}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-48 p-1"
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          {albums.map((album) => {
            const isInAlbum = mediaAlbumIds.includes(album.id);
            return (
              <button
                key={album.id}
                onClick={() => handleToggle(album.id, isInAlbum)}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent transition-colors text-left"
              >
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  {isInAlbum && <Check className="h-3.5 w-3.5" />}
                </span>
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: album.color }}
                />
                <span className="truncate">{album.name}</span>
              </button>
            );
          })}
          {albums.length > 0 && <div className="-mx-1 my-1 h-px bg-border" />}
          <button
            onClick={() => {
              setOpen(false);
              setCreateDialogOpen(true);
            }}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent transition-colors text-left"
          >
            <Plus className="h-4 w-4 shrink-0" />
            {t("albums.createNew")}
          </button>
        </PopoverContent>
      </Popover>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
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

export default memo(AlbumPickerButton);
