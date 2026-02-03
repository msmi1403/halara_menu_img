
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ProductMetadata, GenerationSettings } from "./types";

export const analyzeProductImage = async (base64Image: string): Promise<ProductMetadata> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `Analyze this product image for commercial re-design.
    Identify:
    1. **Strain Name**: The name of the product/strain.
    2. **Primary Fruit Flavor**: The main fruit associated with the product.
    3. **Primary Color**: The color of the vape device or dominant brand color.
    4. **Secondary Colors**: Identify any accent colors or secondary brand colors.
    5. **Aroma/Vibe Notes**: Identify any notes like "calming", "citrusy", "lavender", or specific vibe descriptors.
    
    Return the data in the following JSON format.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: 'image/png' } },
        { text: prompt }
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
};

export const generateAdImage = async (
  base64SourceImage: string,
  metadata: ProductMetadata,
  settings: GenerationSettings
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const secondaryColorsStr = metadata.secondaryColors.join(", ");
  
  // Using the user's exact provided prompt structure with dynamic metadata injection
  const finalPrompt = `Instruction: Create a high-end, commercial advertisement image optimized for Shopify mobile feeds.

    Product Reference Details:

    - Main Subject: ${metadata.strainName}
    - Flavor Profile: ${metadata.fruitFlavor}
    - Brand Colors: ${metadata.primaryColor} (Primary), ${secondaryColorsStr} (Accents)

    Composition & High-Visibility Style:

    1. **Central Focus**: Feature the packaging and device angled prominently in the center. Package should be flat. Use crisp, commercial lighting.
    2. High-Legibility Typography: Create massive, 3D stylized "Bubble-Script" text for "${metadata.strainName}" at the bottom.
    -Internal Depth: Use a deep, dark-saturated gradient for the interior of the letters.
    - High-Contrast Edges: Wrap each letter in a thick, brilliant white outer-stroke and a high-gloss "wet" shine
    3. **Atmospheric Environment**: Surround the product with stylized slices of ${metadata.fruitFlavor}. 
      - Add depth with watercolor splashes or related organic elements.
    4.Background: Use a soft radial gradient that matches the "${metadata.primaryColor}", gradually fading to off white at the bottom. Not sharp lines
    5. Finishing Touches: Add a red circular badge in the top-right corner that says "90%+ THC" in bold white text. 
  
`;

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

  let imageUrl = "";
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      imageUrl = `data:image/png;base64,${part.inlineData.data}`;
      break;
    }
  }

  if (!imageUrl) throw new Error("No image data returned from model");
  return imageUrl;
};
