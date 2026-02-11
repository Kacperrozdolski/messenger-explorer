import { useMemo, useState } from "react";
import { Camera } from "lucide-react";
import FilterBar from "@/components/FilterBar";
import ImageGrid from "@/components/ImageGrid";
import { images, type ImageCategory, type ImageOrientation } from "@/data/images";

const Index = () => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ImageCategory>("All");
  const [orientation, setOrientation] = useState<ImageOrientation>("All");

  const filtered = useMemo(() => {
    return images.filter((img) => {
      const matchesSearch =
        !search ||
        img.title.toLowerCase().includes(search.toLowerCase()) ||
        img.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())) ||
        img.author.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === "All" || img.category === category;
      const matchesOrientation = orientation === "All" || img.orientation === orientation;
      return matchesSearch && matchesCategory && matchesOrientation;
    });
  }, [search, category, orientation]);

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 px-6 lg:px-12 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Camera className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-display font-bold tracking-tight text-foreground">
              Lumina
            </h1>
          </div>
          <p className="text-sm text-muted-foreground hidden sm:block">Image Explorer</p>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10 space-y-10">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          category={category}
          onCategoryChange={setCategory}
          orientation={orientation}
          onOrientationChange={setOrientation}
          resultCount={filtered.length}
        />
        <ImageGrid images={filtered} />
      </div>
    </main>
  );
};

export default Index;
