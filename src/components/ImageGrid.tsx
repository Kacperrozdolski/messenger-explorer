import type { ImageItem } from "@/data/images";
import ImageCard from "./ImageCard";

interface ImageGridProps {
  images: ImageItem[];
}

const ImageGrid = ({ images }: ImageGridProps) => {
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-muted-foreground text-lg font-display">No images match your filters</p>
        <p className="text-sm text-muted-foreground/60 mt-2">Try adjusting your search or filters</p>
      </div>
    );
  }

  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
      {images.map((image, i) => (
        <ImageCard key={image.id} image={image} index={i} />
      ))}
    </div>
  );
};

export default ImageGrid;
