/** Render layers shared by both renderers (kept dependency-free so the Planner never pulls in loaders). */
/** "Special" layer: excluded from AO / outline depth passes (glass, foliage cards, overlays). */
export const LAYER_SPECIAL = 1;
/** Seen only by shadow cameras: cut-away walls keep casting shadows, so cut-away never invalidates them. */
export const LAYER_SHADOW_ONLY = 2;
