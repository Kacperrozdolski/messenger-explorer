import type { ImageItem } from "@/data/images";

interface ImageCardProps {
  image: ImageItem;
  index: number;
}

const ImageCard = ({ image, index }: ImageCardProps) => {
  return (
    <div
      className="group relative overflow-hidden rounded-lg image-hover opacity-0 animate-fade-in"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <img
        src={image.src}
        alt={image.title}
        className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-110"
        loading="lazy"
      />

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400 flex flex-col justify-end p-5">
        <h3 className="font-display font-semibold text-foreground text-lg leading-tight">
          {image.title}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">by {image.author}</p>
        <div className="flex gap-2 mt-3">
          {image.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ImageCard;
