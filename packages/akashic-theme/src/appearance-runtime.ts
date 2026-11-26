import { appearanceChanged } from "./appearance-brand";
import { appearanceAssets, appearanceIcon, fontFallbacks, fontPresets, type AppearanceConfig, type FontRole } from "./appearance-presets";

export const appearanceCacheKey = "akashic_appearance_cache";
export function applyAppearance(config: AppearanceConfig): void {
  const values: Record<string, string> = {};
  const faces = new Set<string>();
  for (const role of ["reading", "ui", "technical"] as FontRole[]) {
    const selection = config.fonts[role];
    let value = "";
    if (selection.mode === "uploaded") {
      const font = config.fonts.uploaded.find((font) => font.id === selection.value);
      if (font && /^[a-f0-9]{32}$/.test(font.id) && /^[a-f0-9]{64}$/.test(font.sha)) {
        const family = `ak-upload-${font.id}`;
        const format = font.file.endsWith(".woff2") ? "woff2" : font.file.endsWith(".otf") ? "opentype" : "truetype";
        faces.add(`@font-face{font-family:"${family}";src:url("${appearanceAssets}/font?font_id=${font.id}&v=${font.sha}") format("${format}");font-display:swap;}`);
        value = `"${family}", ${fontFallbacks[role]}`;
      }
    } else value = fontPresets[role].find((preset) => preset.id === selection.value)?.css ?? "";
    values[`--ak-type-${role}`] = value;
    if (value) document.documentElement.style.setProperty(`--ak-type-${role}`, value);
    else document.documentElement.style.removeProperty(`--ak-type-${role}`);
  }
  let style = document.getElementById("akashic-custom-fonts");
  if (!style) { style = document.createElement("style"); style.id = "akashic-custom-fonts"; document.head.append(style); }
  style.textContent = [...faces].join("\n");
  const brandName = config.brand.name || "Akashic";
  const iconHref = appearanceIcon(config);
  document.documentElement.dataset.akBrandName = brandName;
  const sidebarIcon = config.brand.icon_mode === "preset" && config.brand.icon_preset === "default" ? "" : iconHref;
  document.documentElement.dataset.akBrandIcon = sidebarIcon;
  document.title = `${brandName} Dashboard`;
  let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; document.head.append(icon); }
  icon.removeAttribute("type"); icon.href = iconHref;
  window.dispatchEvent(new Event(appearanceChanged));
  try { localStorage.setItem(appearanceCacheKey, JSON.stringify({ config, brandName, iconHref, sidebarIcon, values, faces: style.textContent })); } catch { /* Storage may be disabled. */ }
}
