import { ALBUM_COLORS } from "@/data/types";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}

const ColorPicker = ({ value, onChange, className }: ColorPickerProps) => {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {ALBUM_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={cn(
            "h-6 w-6 rounded-full transition-all border-2",
            value === color
              ? "border-foreground scale-110"
              : "border-transparent hover:scale-110",
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
};

export default ColorPicker;
