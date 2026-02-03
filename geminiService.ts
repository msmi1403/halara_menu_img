
import { GoogleGenAI, Type } from "@google/genai";
import { ProductMetadata, GenerationSettings } from "./types";

export async function analyzeProductImage(base64Image: string): Promise<ProductMetadata> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `Analyze this product image for commercial re-design.
    Identify:
    1. **Strain Name**: The name of the product/strain.
    2. **Primary Fruit Flavor**: The main fruit associated with the product.
    3. **Primary Color**: The hex color code (#RRGGBB format) of the vape device or dominant brand color.
    4. **Secondary Colors**: Hex color codes for any accent colors or secondary brand colors.
    5. **Aroma/Vibe Notes**: Identify any notes like "calming", "citrusy", "lavender", or specific vibe descriptors.

    IMPORTANT: All colors MUST be returned as hex codes (e.g., #3B82F6 for blue, #F97316 for orange).

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
}

export async function generateAdImage(
  base64SourceImage: string,
  metadata: ProductMetadata,
  settings: GenerationSettings
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const secondaryColorsStr = metadata.secondaryColors.join(", ");
  
  const finalPrompt = `
<style>
STYLE REFERENCE: High-end commercial product photography.
Clean, professional, premium cannabis dispensary aesthetic.
Soft diffused lighting. Smooth gradients. No harsh contrasts.
</style>

<subject>
Product: ${metadata.strainName}
Flavor: ${metadata.fruitFlavor}
Colors: ${metadata.primaryColor} (primary), ${secondaryColorsStr} (accents)
</subject>

<composition>
1. **Central Focus**: Feature the packaging and device angled prominently in the center. Package should be flat. Use crisp, commercial lighting.

2. **High-Legibility Typography**: Create massive, 3D stylized "Bubble-Script" text for "${metadata.strainName}" at the bottom.
   - Internal Depth: Use a deep, dark-saturated gradient for the interior of the letters.
   - High-Contrast Edges: Wrap each letter in a thick, brilliant white outer-stroke and a high-gloss "wet" shine.

3. **Atmospheric Environment**: Surround the product with stylized slices of ${metadata.fruitFlavor}.
   - Add depth with watercolor splashes or related organic elements.
</composition>

<background>
CRITICAL - Must be consistent across all generations:
- Create a smooth, seamless RADIAL gradient centered behind the product
- Center color: A soft, muted tint of ${metadata.primaryColor} at 40% opacity
- Edge color: Off-white (#F5F5F5)
- Gradient style: Ultra-smooth continuous transition with absolutely NO visible banding, NO hard edges, NO color stops, NO sharp transitions
- The gradient must appear as a single, unified professional photography backdrop
- Think: soft studio lighting backdrop, not a graphic design gradient
</background>

<badge>
Add a red circular badge in the top-right corner that says "90%+ THC" in bold white text.
</badge>
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
}
