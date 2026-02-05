
export interface ProductMetadata {
  strainName: string;
  fruitFlavor: string;
  primaryColor: string;
  secondaryColors: string[];
  notes: string;
}

export interface GenerationSettings {
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  imageSize: "1K" | "2K" | "4K";
  numberOfVariants: number;
  additionalInstructions: string;
  nyMode: boolean;
}

export interface GeneratedImage {
  id: string;
  // url is for UI display (Object URL or Base64)
  url: string;
  // data is the actual binary storage
  blob?: Blob;
  timestamp: number;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  metadata: ProductMetadata;
  sourceImage: Blob | string; // Store as Blob for efficiency
  variants: GeneratedImage[];
  settings: GenerationSettings;
  thumbnail?: string; // Low-res Base64 for the history drawer
}
