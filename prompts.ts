import { ProductMetadata } from "./types";

// ============================================
// ANALYZE PROMPTS
// ============================================

export const analyzePrompts = {
  v1: `Analyze this product image for commercial re-design.
    Identify:
    1. **Strain Name**: The name of the product/strain.
    2. **Primary Fruit Flavor**: The main fruit associated with the product.
    3. **Primary Color**: The hex color code (#RRGGBB format) of the vape device or dominant brand color.
    4. **Secondary Colors**: Hex color codes for any accent colors or secondary brand colors.
    5. **Aroma/Vibe Notes**: Identify any notes like "calming", "citrusy", "lavender", or specific vibe descriptors.

    IMPORTANT: All colors MUST be returned as hex codes (e.g., #3B82F6 for blue, #F97316 for orange).

    Return the data in the following JSON format.`,
};

// ============================================
// GENERATE PROMPTS
// ============================================

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

  v2: (meta: ProductMetadata): string => {
    return `Create a premium cannabis vape marketing image:

BACKGROUND: Smooth, soft vertical gradient from lighter tint of ${meta.primaryColor} at top to warm cream (#F5F0E8) at bottom.
CRITICAL: NO streaks, NO radiating lines, NO burst effects. Pure smooth gradient only.

FRUIT ELEMENTS: Surround the product with vibrant, clean, stylized ${meta.fruitFlavor}. Soft watercolor splashes. Keep it clean and minimal.

PRODUCTS: Center composition with packaging box on left (tilted slightly to the left), vape device on right angled slightly to the right.
CRITICAL: NO outlines or borders around the package or device. Products should blend naturally into the scene without any drawn edges or strokes around them.

THC BADGE: Top-right red (#E53935) circle with "90%+ THC" in white bold text and off white border.

HERO TEXT: Bottom of image, large script typography reading "${meta.strainName}".
- Interior fill: Pure WHITE or light cream (NOT colored gradient)
- Outline: Thick stroke in warm brown or darker shade of ${meta.primaryColor}
- 3D shadow effect toward bottom-right

STYLE: Premium but playful, craft beverage aesthetic, Instagram-ready square format.
`;
  },
};

// ============================================
// ACTIVE VERSIONS - Change these to switch prompts
// ============================================

export const ACTIVE_ANALYZE_PROMPT = analyzePrompts.v1;
export const ACTIVE_GENERATE_PROMPT = generatePrompts.v2;
