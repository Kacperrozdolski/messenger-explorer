import sample1 from "@/assets/sample-1.jpg";
import sample2 from "@/assets/sample-2.jpg";
import sample3 from "@/assets/sample-3.jpg";
import sample4 from "@/assets/sample-4.jpg";
import sample5 from "@/assets/sample-5.jpg";
import sample6 from "@/assets/sample-6.jpg";
import sample7 from "@/assets/sample-7.jpg";
import sample8 from "@/assets/sample-8.jpg";
import sample9 from "@/assets/sample-9.jpg";

export type ImageCategory = "All" | "Nature" | "Architecture" | "Wildlife" | "Urban";
export type ImageOrientation = "All" | "Landscape" | "Portrait" | "Square";

export interface ImageItem {
  id: string;
  src: string;
  title: string;
  author: string;
  category: Exclude<ImageCategory, "All">;
  orientation: Exclude<ImageOrientation, "All">;
  tags: string[];
}

export const images: ImageItem[] = [
  {
    id: "1",
    src: sample1,
    title: "Golden Hour Mountains",
    author: "Elena Voss",
    category: "Nature",
    orientation: "Landscape",
    tags: ["mountains", "sunset", "fog"],
  },
  {
    id: "2",
    src: sample2,
    title: "Glass Geometry",
    author: "Marcus Chen",
    category: "Architecture",
    orientation: "Portrait",
    tags: ["building", "glass", "modern"],
  },
  {
    id: "3",
    src: sample3,
    title: "Coastal Power",
    author: "Sofia Reyes",
    category: "Nature",
    orientation: "Landscape",
    tags: ["ocean", "waves", "rocks"],
  },
  {
    id: "4",
    src: sample4,
    title: "Autumn Fox",
    author: "Jan Kowalski",
    category: "Wildlife",
    orientation: "Square",
    tags: ["fox", "autumn", "forest"],
  },
  {
    id: "5",
    src: sample5,
    title: "River From Above",
    author: "Aiko Tanaka",
    category: "Nature",
    orientation: "Landscape",
    tags: ["river", "forest", "aerial"],
  },
  {
    id: "6",
    src: sample6,
    title: "Cherry Blossom Lane",
    author: "Liam O'Brien",
    category: "Nature",
    orientation: "Portrait",
    tags: ["flowers", "spring", "pink"],
  },
  {
    id: "7",
    src: sample7,
    title: "Neon Streets",
    author: "Priya Sharma",
    category: "Urban",
    orientation: "Landscape",
    tags: ["city", "night", "neon"],
  },
  {
    id: "8",
    src: sample8,
    title: "Desert Solitude",
    author: "Omar Hassan",
    category: "Nature",
    orientation: "Square",
    tags: ["desert", "sand", "sunset"],
  },
  {
    id: "9",
    src: sample9,
    title: "Aurora Peak",
    author: "Ingrid Berg",
    category: "Nature",
    orientation: "Landscape",
    tags: ["aurora", "snow", "mountain"],
  },
];

export const categories: ImageCategory[] = ["All", "Nature", "Architecture", "Wildlife", "Urban"];
export const orientations: ImageOrientation[] = ["All", "Landscape", "Portrait", "Square"];
