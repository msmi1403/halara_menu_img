import { GoogleGenAI, Type } from "@google/genai";
import { ProductMetadata, GenerationSettings } from "./types";
import { ACTIVE_ANALYZE_PROMPT, ACTIVE_GENERATE_PROMPT } from "./prompts";

export enum GeminiErrorType {
  NETWORK = 'NETWORK',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  INVALID_API_KEY = 'INVALID_API_KEY',
  CONTENT_FILTERED = 'CONTENT_FILTERED',
  NO_IMAGE_DATA = 'NO_IMAGE_DATA',
  UNKNOWN = 'UNKNOWN'
}

export class GeminiError extends Error {
  type: GeminiErrorType;

  constructor(type: GeminiErrorType, message: string) {
    super(message);
    this.type = type;
    this.name = 'GeminiError';
  }
}

function categorizeError(error: unknown): GeminiError {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('failed to fetch')) {
    return new GeminiError(GeminiErrorType.NETWORK, 'Network connection failed');
  }

  if (lowerMessage.includes('quota') || lowerMessage.includes('rate limit') || lowerMessage.includes('429')) {
    return new GeminiError(GeminiErrorType.QUOTA_EXCEEDED, 'API quota exceeded');
  }

  if (lowerMessage.includes('api key') || lowerMessage.includes('401') || lowerMessage.includes('unauthorized')) {
    return new GeminiError(GeminiErrorType.INVALID_API_KEY, 'Invalid API key');
  }

  if (lowerMessage.includes('blocked') || lowerMessage.includes('safety') || lowerMessage.includes('filtered')) {
    return new GeminiError(GeminiErrorType.CONTENT_FILTERED, 'Content was filtered by safety settings');
  }

  return new GeminiError(GeminiErrorType.UNKNOWN, message);
}

export async function analyzeProductImage(base64Image: string): Promise<ProductMetadata> {
  try {
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
            notes: { type: Type.STRING },
            strainType: { type: Type.STRING }
          },
          required: ["strainName", "fruitFlavor", "primaryColor", "secondaryColors", "notes"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}") as ProductMetadata;
    // Normalize strainType to lowercase and validate
    if (data.strainType) {
      const normalized = data.strainType.toLowerCase();
      data.strainType = ['sativa', 'hybrid', 'indica'].includes(normalized)
        ? (normalized as 'sativa' | 'hybrid' | 'indica')
        : undefined;
    }
    return data;
  } catch (error) {
    throw categorizeError(error);
  }
}

export async function generateAdImage(
  base64SourceImage: string,
  metadata: ProductMetadata,
  settings: GenerationSettings
): Promise<string> {
  try {
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
      throw new GeminiError(GeminiErrorType.NO_IMAGE_DATA, 'No image data returned from model');
    }

    return `data:image/png;base64,${imagePart.inlineData.data}`;
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error;
    }
    throw categorizeError(error);
  }
}
