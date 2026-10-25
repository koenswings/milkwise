// Okabe-Ito palette per bottle size (water ml) — colour-vision-deficiency safe.
// design/2026-10-25-feeding-zones.md §11.1 / §10. Colour is never the only cue: bars carry the size label.
export const SIZE_COLOURS: Record<number, string> = {
  30: "#E69F00",
  60: "#56B4E9",
  90: "#009E73",
  120: "#F0E442",
  150: "#CC79A7",
  180: "#0072B2",
  210: "#D55E00",
};

export function sizeColour(waterMl: number): string {
  return SIZE_COLOURS[waterMl] ?? "#94a3b8";
}
