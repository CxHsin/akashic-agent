/** DOM-backed brand projection shared by independently bundled web modules. */
export const appearanceChanged = "akashic-appearance-change";
export const readBrandName = (): string => document.documentElement.dataset.akBrandName || "Akashic";
export const readBrandIcon = (): string => document.documentElement.dataset.akBrandIcon || "";
export function subscribeBrand(listener: () => void): () => void {
  window.addEventListener(appearanceChanged, listener);
  return () => window.removeEventListener(appearanceChanged, listener);
}
