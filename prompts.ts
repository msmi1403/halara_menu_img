import { ProductMetadata, GenerationSettings } from "./types";

// ============================================
// ANALYZE PROMPTS
// ============================================

export const analyzePrompts = {
  v1: `Analyze this product image for commercial re-design.
    Identify:
    1. **Strain Name**: The name of the product/strain.
    2. **Primary Flavor**: The main flavor associated with the product (e.g., mango, strawberry, pine, lavender, mint, earthy, woody).
    3. **Primary Color**: The hex color code (#RRGGBB format) of the vape device or dominant brand color.
    4. **Secondary Colors**: Hex color codes for any accent colors or secondary brand colors.
    5. **Aroma/Vibe Notes**: Identify any notes like "calming", "citrusy", "lavender", or specific vibe descriptors.

    IMPORTANT: All colors MUST be returned as hex codes (e.g., #3B82F6 for blue, #F97316 for orange).

    Return the data in the following JSON format.`,
};

// ============================================
// GENERATE PROMPTS
// ============================================

// Element section generators for different prompt variants
const elementSections = {
  // Standard flavor imagery (default - v2)
  standard: (meta: ProductMetadata) =>
    `FLAVOR ELEMENTS: Surround the product with vibrant, clean, stylized ${meta.fruitFlavor} elements (fruits, botanicals, herbs, or nature elements as appropriate). These should look fresh and "perfect," with a smooth, illustrative commercial finish.
Also include watercolor splashes and supporting objects such as related plants, leaves, or complementary natural elements.`,

  // Watercolor only - NY mode (no flavor imagery - v3)
  watercolor: (meta: ProductMetadata) =>
    `BACKGROUND ELEMENTS: Create an explosive burst of bright, vibrant watercolor splashes emerging from behind the product. Use ${meta.primaryColor} prominently along with bold, saturated complementary colors. The paint splashes should radiate outward from behind the products, creating dynamic depth and visual energy.`,
};

// Optional addon blurbs that can be appended to element sections
const elementAddons = {
  // Weed leaves addon for Resin/Rosin mode (v4)
  weedLeaves: `
Include stylized cannabis/marijuana leaves throughout the composition. The weed leaves should complement the flavor imagery, creating a cohesive cannabis concentrate aesthetic.`,
};

// Unified base generator for v2/v3/v4 prompts
const generateBase = (
  meta: ProductMetadata,
  elementSection: string,
  settings?: GenerationSettings,
  addon?: string
): string => {
  const fullElementSection = addon ? elementSection + addon : elementSection;
  const basePrompt = `Create a premium cannabis vape marketing image:

REFERENCE IMAGE: Use the uploaded image as the structural and brand reference.
- PRESERVE the exact packaging design, logo placement, text, and graphics
- PRESERVE the exact vape device appearance and form factor
- Change ONLY the surrounding scene and styling - keep product visuals unchanged

BACKGROUND: Smooth, soft vertical gradient from lighter tint of ${meta.primaryColor} at top to warm cream (#F5F0E8) at bottom.
CRITICAL: NO streaks, NO radiating lines, NO burst effects. Pure smooth gradient only.

${fullElementSection}

PRODUCTS: Center composition with packaging box on left (tilted slightly to the left), vape device on right angled slightly to the right.
- CRITICAL: Products must match the reference image EXACTLY - do not redesign or alter them
- NO outlines or borders around the package or device. Products should blend naturally into the scene without any drawn edges or strokes around them.

THC BADGE: Top-right corner. Solid red (#E53935) filled circle. Inside the circle, an off-white/cream inset ring stroke (NOT on the outer edge - positioned inward from the perimeter). Center text in off-white/cream bold: "90%+" on first line, "TAC" on second line.

HERO TEXT: Bottom of image, large script typography reading "${meta.strainName}".
- Interior fill: Pure WHITE or light cream (NOT colored gradient)
- Outline: Thick stroke in phthalo green or darker shade of ${meta.primaryColor}
- 3D shadow effect toward bottom-right

STYLE: Premium but playful, craft beverage aesthetic, Instagram-ready square format.
`;

  const additionalInstructions = settings?.additionalInstructions?.trim();
  return additionalInstructions
    ? `${basePrompt}
ADDITIONAL INSTRUCTIONS:
${additionalInstructions}`
    : basePrompt;
};

export const generatePrompts = {
  v1: (meta: ProductMetadata): string => {
    const secondaryColorsStr = meta.secondaryColors.join(", ");
    return `
<style>
STYLE REFERENCE: High-end commercial product photography.
Clean, professional, premium cannabis dispensary aesthetic.
Soft diffused lighting. Smooth gradients. No harsh contrasts.
</style>

<subject>
Product: ${meta.strainName}
Flavor: ${meta.fruitFlavor}
Colors: ${meta.primaryColor} (primary), ${secondaryColorsStr} (accents)
</subject>

<composition>
1. **Central Focus**: Feature the packaging and device in the center.
   - CRITICAL: PRESERVE the EXACT package design from the source image - do NOT redraw, redesign, or alter it in any way
   - The package must appear EXACTLY as it does in the input image (same text, colors, graphics, layout)
   - Display the package FLAT (2D front-facing view) - NOT at an angle, NOT 3D, NOT with perspective
   - The vape device can be angled/styled, but the PACKAGE itself must match the original exactly
   - Use crisp, commercial lighting

2. **High-Legibility Typography**: Create massive, 3D stylized "Bubble-Script" text for "${meta.strainName}" at the bottom.
   - CRITICAL - Interior Fill: Pure WHITE or very light cream. The text interior MUST be light-colored for contrast.
   - Outline: Thick, bold stroke in a darker shade of ${meta.primaryColor}
   - Effects: High-gloss "wet" shine and subtle 3D depth/shadow
   - DO NOT use dark or medium-toned fills - the text must pop against the colored background

3. **Atmospheric Environment**: Surround the product with stylized slices of ${meta.fruitFlavor}.
   - Add depth with watercolor splashes or related organic elements.
</composition>

<background>
CRITICAL - Soft gradient background with radial center glow:

1. **Vertical Gradient**: Soft, pastel-toned ${meta.primaryColor} at the TOP, smoothly transitioning to light cream or off-white at the BOTTOM
2. **Radial Center Glow**: A soft, luminous halo emanating from the center where the product sits

KEY REQUIREMENTS:
- Top of image: Light, airy tint of ${meta.primaryColor}
- Bottom of image: Fades to soft cream/off-white
- Center: Soft radial glow that highlights the product with a long transition.
- The gradient should feel smooth and natural, like professional product photography

Think: High-end dispensary advertisement with studio lighting on a colored backdrop.
</background>

<badge>
Add a red circular badge in the top-right corner that says "90%+ THC" in bold white text.
</badge>
`;
  },

  v2: (meta: ProductMetadata, settings?: GenerationSettings) =>
    generateBase(meta, elementSections.standard(meta), settings),

  v3: (meta: ProductMetadata, settings?: GenerationSettings) =>
    generateBase(meta, elementSections.watercolor(meta), settings),

  v4: (meta: ProductMetadata, settings?: GenerationSettings) =>
    generateBase(meta, elementSections.standard(meta), settings, elementAddons.weedLeaves),
};

// ============================================
// ACTIVE VERSIONS - Change these to switch prompts
// ============================================

export const ACTIVE_ANALYZE_PROMPT = analyzePrompts.v1;
export function ACTIVE_GENERATE_PROMPT(meta: ProductMetadata, settings?: GenerationSettings): string {
  if (settings?.nyMode) return generatePrompts.v3(meta, settings);
  if (settings?.resinRosinMode) return generatePrompts.v4(meta, settings);
  return generatePrompts.v2(meta, settings);
}
