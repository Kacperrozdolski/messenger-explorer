import { Search } from "lucide-react";
import { categories, orientations, type ImageCategory, type ImageOrientation } from "@/data/images";

interface FilterBarProps {
  search: string;
  onSearchChange: (val: string) => void;
  category: ImageCategory;
  onCategoryChange: (val: ImageCategory) => void;
  orientation: ImageOrientation;
  onOrientationChange: (val: ImageOrientation) => void;
  resultCount: number;
}

const FilterBar = ({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  orientation,
  onOrientationChange,
  resultCount,
}: FilterBarProps) => {
  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search images..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-11 pr-4 py-3 rounded-lg bg-secondary border-none text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-body text-sm"
        />
      </div>

      {/* Category filters */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Category</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`filter-chip ${category === cat ? "filter-chip-active" : "filter-chip-inactive"}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Orientation filters */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Orientation</p>
        <div className="flex flex-wrap gap-2">
          {orientations.map((ori) => (
            <button
              key={ori}
              onClick={() => onOrientationChange(ori)}
              className={`filter-chip ${orientation === ori ? "filter-chip-active" : "filter-chip-inactive"}`}
            >
              {ori}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      <p className="text-sm text-muted-foreground">
        <span className="text-primary font-semibold">{resultCount}</span> images found
      </p>
    </div>
  );
};

export default FilterBar;
