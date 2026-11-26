/** Akashic Dashboard 使用的透明品牌图形。 */
export { defaultBrandIcon as akashicBrandIcon } from "../../../../packages/akashic-theme/src/appearance-presets";

// React 按对象身份比较 dangerouslySetInnerHTML；同一段图标复用同一个对象，重渲染时不再重新解析 SVG。
const markupCache = new Map<string, { __html: string }>();
export function markup(svg: string): { __html: string } {
  let value = markupCache.get(svg);
  if (!value) markupCache.set(svg, value = { __html: svg });
  return value;
}
