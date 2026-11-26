import brandSvg from "./akashic-brand.svg?raw";
export const defaultBrandIcon = `data:image/svg+xml,${encodeURIComponent(brandSvg)}`;
export type FontRole = "reading" | "ui" | "technical";
export interface Selection { mode: "preset" | "uploaded"; value: string }
export interface AppearanceConfig {
  version: 1;
  brand: { name: string; icon_mode: "preset" | "custom"; icon_preset: string; custom_icon_file: string | null; custom_icon_sha: string | null };
  fonts: Record<FontRole, Selection> & { uploaded: { id: string; label: string; file: string; sha: string }[] };
}
export const appearanceAssets = "/shell-ui/appearance/assets";
export const appearanceBase = "/api/dashboard/shell-ui/appearance";
const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
export const fontFallbacks: Record<FontRole, string> = { reading: "var(--md-ref-typeface-brand)", ui: sans, technical: "monospace" };
const mono = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
export const fontPresets: Record<FontRole, { id: string; label: string; css: string }[]> = {
  reading: [
    { id: "default", label: "默认阅读字体", css: "" },
    { id: "system-sans", label: "系统无衬线", css: sans },
    { id: "system-serif", label: "系统衬线", css: '"Noto Serif CJK SC", "Songti SC", SimSun, serif' },
    { id: "kai", label: "系统楷体", css: '"Kaiti SC", STKaiti, KaiTi, serif' },
  ],
  ui: [
    { id: "default", label: "默认界面字体", css: "" },
    { id: "serif", label: "阅读衬线", css: "var(--md-ref-typeface-brand)" },
    { id: "mono", label: "等宽", css: mono },
  ],
  technical: [
    { id: "default", label: "默认 JetBrains Mono", css: "" },
    { id: "system-mono", label: "系统等宽", css: mono },
  ],
};
export const iconPresets = [
  { id: "default", label: "Akashic", href: defaultBrandIcon },
];
export const defaultAppearance: AppearanceConfig = {
  version: 1, brand: { name: "", icon_mode: "preset", icon_preset: "default", custom_icon_file: null, custom_icon_sha: null },
  fonts: { uploaded: [], reading: { mode: "preset", value: "default" }, ui: { mode: "preset", value: "default" }, technical: { mode: "preset", value: "default" } },
};
export function appearanceIcon(config: AppearanceConfig): string {
  return config.brand.icon_mode === "custom" && config.brand.custom_icon_sha
    ? `${appearanceAssets}/brand?v=${config.brand.custom_icon_sha}`
    : (iconPresets.find((icon) => icon.id === config.brand.icon_preset) ?? iconPresets[0]).href;
}
