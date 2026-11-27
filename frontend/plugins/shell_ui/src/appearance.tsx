import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { WebHostContextV1 } from "@akashic/web-ui-v1";
import { appearanceBase, appearanceIcon, defaultAppearance, fontPresets, iconPresets, type AppearanceConfig, type FontRole } from "../../../../packages/akashic-theme/src/appearance-presets";
import { applyAppearance } from "../../../../packages/akashic-theme/src/appearance-runtime";

export function createAppearance(ctx: Pick<WebHostContextV1, "http" | "data">) {
  let config = defaultAppearance;
  try {
    const cached = JSON.parse(localStorage.getItem("akashic_appearance_cache") || "null")?.config;
    if (cached?.version === 1 && Array.isArray(cached.fonts?.uploaded)) {
      config = cached;
      if (!iconPresets.some((icon) => icon.id === config.brand.icon_preset)) {
        config = { ...config, brand: { ...config.brand, icon_preset: "default" } };
      }
    }
  } catch { /* Storage may be disabled. */ }
  async function read(path = "", init?: RequestInit): Promise<AppearanceConfig> {
    const response = await ctx.http.request(appearanceBase + path, init);
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : `请求失败（${response.status}）`);
    return data as AppearanceConfig;
  }
  const resource = ctx.data.resource<AppearanceConfig>("appearance", (signal) => read("", { signal }));
  // Only accepted resource values may affect the DOM/cache; a superseded GET never reaches here.
  let applied: AppearanceConfig | undefined;
  const dispose = resource.subscribe(() => {
    if (resource.current && resource.current !== applied) {
      applied = resource.current;
      applyAppearance(applied);
    }
  });
  async function request(path = "", init?: RequestInit): Promise<void> {
    if (!init) await resource.refresh();
    else resource.set(await read(path, init));
  }
  return {
    get: () => resource.current ?? config,
    loaded: () => resource.current !== undefined,
    error: () => resource.error?.message ?? "",
    subscribe: resource.subscribe,
    dispose,
    request,
    save: (next: AppearanceConfig) => request("", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand: { name: next.brand.name, icon_mode: next.brand.icon_mode, icon_preset: next.brand.icon_preset }, fonts: { reading: next.fonts.reading, ui: next.fonts.ui, technical: next.fonts.technical } }) }),
  };
}
export type AppearanceState = ReturnType<typeof createAppearance>;
function AppearanceGroup({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  const id = useId();
  return <section className="shell-appearance-group" aria-labelledby={id}>
    <h4 id={id}>{title}</h4><div className="shell-appearance-card">{children}</div>
  </section>;
}

function SettingRow({ title, description, htmlFor, children }: {
  title: string; description: string; htmlFor?: string; children: React.ReactNode;
}): React.ReactElement {
  return <div className="shell-appearance-row">
    <div className="shell-appearance-copy">
      {htmlFor ? <label htmlFor={htmlFor}>{title}</label> : <strong>{title}</strong>}
      <p>{description}</p>
    </div>
    <div className="shell-appearance-controls">{children}</div>
  </div>;
}

function BrandPreview({ config }: { config: AppearanceConfig }): React.ReactElement {
  const name = config.brand.name || "Akashic";
  const icon = appearanceIcon(config);
  return <div className="shell-appearance-brand" data-custom-icon={config.brand.icon_mode === "custom" || undefined} aria-label="品牌效果预览">
    <span className="shell-appearance-preview-label">预览</span>
    <span className="shell-appearance-topbar"><img src={icon} alt="" /><strong>{name}</strong></span>
    <span className="shell-appearance-tab"><img src={icon} alt="" /><span>{name} Dashboard</span></span>
  </div>;
}

function FontPreview(): React.ReactElement {
  return <div className="shell-appearance-preview" aria-label="字体效果预览">
    <div><span>界面</span><p className="shell-appearance-ui">设置与导航 · Settings & Navigation</p></div>
    <div><span>正文</span><p className="shell-appearance-reading">书页之间，记录与思想相遇。The quick brown fox jumps over the lazy dog.</p></div>
    <div><span>代码</span><code>const answer = 42; // 代码与技术字面量</code></div>
  </div>;
}

const fontRows: { role: FontRole; title: string; description: string }[] = [
  { role: "reading", title: "正文阅读字体", description: "用于消息正文与长文阅读。" },
  { role: "ui", title: "界面 UI 字体", description: "用于侧栏、导航与操作控件。" },
  { role: "technical", title: "代码等宽字体", description: "用于代码块与技术字面量。" },
];

export function AppearanceSettings({ state }: { state: AppearanceState }): React.ReactElement {
  const config = useSyncExternalStore(state.subscribe, state.get);
  const loaded = useSyncExternalStore(state.subscribe, state.loaded);
  const loadError = useSyncExternalStore(state.subscribe, state.error);
  const [name, setName] = useState(config.brand.name);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const iconInput = useRef<HTMLInputElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);
  const nameChanged = name.trim() !== config.brand.name;
  useEffect(() => { setName(config.brand.name); }, [config.brand.name]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  function upload(file: File | undefined, kind: "fonts" | "brand-icon") {
    if (!file) return;
    const limit = kind === "fonts" ? 50 * 1024 * 1024 : 512 * 1024;
    void run(async () => {
      if (file.size > limit) throw new Error(kind === "fonts" ? "字体不能超过 50 MB" : "图标不能超过 512 KB");
      await state.request(`/${kind}?${new URLSearchParams({ filename: file.name, label })}`, { method: "POST", body: file });
    });
  }
  if (!loaded) return <section className="shell-appearance">
    <p className="shell-appearance-description">自定义品牌与字体。设置保存在当前实例，保存成功后立即应用。</p>
    <p className={loadError ? "shell-appearance-error" : "shell-appearance-status"} role={loadError ? "alert" : "status"}>{loadError || "正在读取外观配置…"}</p>
    {loadError && <button className="shell-appearance-secondary" type="button" disabled={busy} onClick={() => void run(() => state.request())}>重新加载</button>}
  </section>;
  return <section className="shell-appearance" aria-busy={busy}>
    <p className="shell-appearance-description">自定义品牌与字体。设置保存在当前实例，保存成功后立即应用。</p>
    {error && <div className="shell-appearance-error" role="alert"><span>{error}</span><button type="button" className="shell-appearance-text" aria-label="关闭错误提示" onClick={() => setError("")}>×</button></div>}
    <input ref={iconInput} hidden type="file" aria-label="选择品牌图标文件" disabled={busy} accept=".svg,.png,.webp" onChange={(event) => { upload(event.target.files?.[0], "brand-icon"); event.target.value = ""; }} />
    <input ref={fontInput} hidden type="file" aria-label="选择字体文件" disabled={busy} accept=".woff2,.ttf,.otf" onChange={(event) => { upload(event.target.files?.[0], "fonts"); event.target.value = ""; }} />
    <AppearanceGroup title="品牌">
      <form onSubmit={(event) => { event.preventDefault(); if (!busy && nameChanged) void run(() => state.save({ ...config, brand: { ...config.brand, name: name.trim() } })); }}>
        <SettingRow title="品牌名称" description="显示在左上角与浏览器标签页，留空恢复默认。" htmlFor={`${id}-name`}>
          <input id={`${id}-name`} disabled={busy} value={name} maxLength={80} placeholder="Akashic" onChange={(event) => setName(event.target.value)} />
          <button className="shell-appearance-primary" type="submit" disabled={busy || !nameChanged}>保存</button>
        </SettingRow>
      </form>
      <div className="shell-appearance-row shell-appearance-icon-row">
        <div className="shell-appearance-copy"><strong>品牌图标</strong><p>内置或上传（≤ 512 KB）</p></div>
        <div className="shell-appearance-icon-picker">
          <div className="shell-appearance-icons" role="group" aria-label="品牌图标">
            {iconPresets.map((icon) => <button key={icon.id} disabled={busy} type="button" aria-pressed={config.brand.icon_mode === "preset" && config.brand.icon_preset === icon.id} onClick={() => void run(() => state.save({ ...config, brand: { ...config.brand, icon_mode: "preset", icon_preset: icon.id } }))}><img src={icon.href} alt="" /><span>{icon.label}</span></button>)}
            {config.brand.custom_icon_sha && <div className="shell-appearance-custom-icon"><button type="button" disabled={busy} aria-pressed={config.brand.icon_mode === "custom"} onClick={() => void run(() => state.save({ ...config, brand: { ...config.brand, icon_mode: "custom", icon_preset: "default" } }))}>
              <img className="shell-appearance-custom-image" src={appearanceIcon({ ...config, brand: { ...config.brand, icon_mode: "custom" } })} alt="" /><span>自定义</span>
            </button><button type="button" className="shell-appearance-icon-delete" disabled={busy} aria-label="删除自定义图标" onClick={() => void run(() => state.request("/brand-icon", { method: "DELETE" }))}><span aria-hidden="true">×</span></button></div>}
            <button type="button" disabled={busy} className="shell-appearance-upload-tile" aria-label="上传品牌图标" onClick={() => iconInput.current?.click()}>
              <span className="shell-appearance-plus" aria-hidden="true">+</span><span>上传</span>
            </button>
          </div>
        </div>
      </div>
      <BrandPreview config={config} />
    </AppearanceGroup>
    <AppearanceGroup title="字体">
      {fontRows.map(({ role, title, description }) => <SettingRow key={role} title={title} description={description} htmlFor={`${id}-${role}`}>
        <span className="shell-appearance-select"><select id={`${id}-${role}`} disabled={busy} value={`${config.fonts[role].mode}:${config.fonts[role].value}`} onChange={(event) => {
          const [mode, value] = event.target.value.split(":") as ["preset" | "uploaded", string];
          void run(() => state.save({ ...config, fonts: { ...config.fonts, [role]: { mode, value } } }));
        }}>{fontPresets[role].map((preset) => <option key={preset.id} value={`preset:${preset.id}`}>{preset.label}</option>)}
          {config.fonts.uploaded.map((font) => <option key={font.id} value={`uploaded:${font.id}`}>{font.label}</option>)}
        </select></span>
      </SettingRow>)}
      <FontPreview />
    </AppearanceGroup>
    <AppearanceGroup title="自定义字体">
      <SettingRow title="上传字体" description="WOFF2 / TTF / OTF，最多 50 MB；选择文件后即上传。" htmlFor={`${id}-font-label`}>
        <input id={`${id}-font-label`} aria-label="字体显示名称" disabled={busy} value={label} maxLength={80} placeholder="字体名称（可选）" onChange={(event) => setLabel(event.target.value)} />
        <button className="shell-appearance-secondary" disabled={busy} type="button" onClick={() => fontInput.current?.click()}>上传字体</button>
      </SettingRow>
      {config.fonts.uploaded.length ? <ul className="shell-appearance-font-list">{config.fonts.uploaded.map((font) => <li className="shell-appearance-row" key={font.id}>
        <div className="shell-appearance-copy"><strong>{font.label}</strong><p>{font.file.split(".").pop()?.toUpperCase()}</p></div>
        <button className="shell-appearance-text shell-appearance-delete" disabled={busy} type="button" aria-label={`删除字体 ${font.label}`} onClick={() => void run(() => state.request(`/fonts/${font.id}`, { method: "DELETE" }))}>删除</button>
      </li>)}</ul> : <p className="shell-appearance-empty">尚未上传字体，上传后可在上方三类字体中选用。</p>}
    </AppearanceGroup>
    <p className="shell-appearance-status" role="status">{busy ? "正在保存…" : ""}</p>
  </section>;
}
