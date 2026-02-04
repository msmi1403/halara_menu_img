
import { GoogleGenAI, Type } from "@google/genai";
import { ProductMetadata, GenerationSettings } from "./types";
import { ACTIVE_ANALYZE_PROMPT, ACTIVE_GENERATE_PROMPT } from "./prompts";

export async function analyzeProductImage(base64Image: string): Promise<ProductMetadata> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: 'image/png' } },
        { text: ACTIVE_ANALYZE_PROMPT }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          strainName: { type: Type.STRING },
          fruitFlavor: { type: Type.STRING },
          primaryColor: { type: Type.STRING },
          secondaryColors: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          notes: { type: Type.STRING }
        },
        required: ["strainName", "fruitFlavor", "primaryColor", "secondaryColors", "notes"]
      }
    }
  });

  return JSON.parse(response.text || "{}") as ProductMetadata;
}

export async function generateAdImage(
  base64SourceImage: string,
  metadata: ProductMetadata,
  settings: GenerationSettings
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const finalPrompt = ACTIVE_GENERATE_PROMPT(metadata, settings);

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [
        { inlineData: { data: base64SourceImage, mimeType: 'image/png' } },
        { text: finalPrompt }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: settings.aspectRatio,
        imageSize: settings.imageSize
      }
    }
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part.inlineData);

  if (!imagePart?.inlineData) {
    throw new Error("No image data returned from model");
  }

  return `data:image/png;base64,${imagePart.inlineData.data}`;
}
