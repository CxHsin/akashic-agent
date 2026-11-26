# custom 维护入口

本 fork（[CxHsin/akashic-agent](https://github.com/CxHsin/akashic-agent)）服务于个人日常使用与求职展示，不作为通用发行版维护。开发优先解决实际使用问题，并保留可解释的设计、实现与验证证据。

## 上游基线

第一版外观定制基于上游 [kachofugetsu09/akashic-agent](https://github.com/kachofugetsu09/akashic-agent) 的提交 [`6c4273b9baed25ccc0ada8fffa93d18b6875ba73`](https://github.com/kachofugetsu09/akashic-agent/commit/6c4273b9baed25ccc0ada8fffa93d18b6875ba73)（`docs: 最小包管理器设计（Phase 1） (#2166)`）。此处记录实际采用的代码基线；本地 `upstream/main` 引用可能更新或落后，不作为版本依据。

当前第一版在 `feat/appearance-customization` 收口。确认、提交并验收后，该功能分支的提交将作为 `custom` 的初始基线；当前尚未发布。

## 已落地特性

下表记录第一版源码实现范围；静态检查、功能验收与部署结果分别记录在对应 PR，不以实现存在代替验收通过。

| 特性 | 行为与实现入口 |
| --- | --- |
| 品牌名称与图标 | Shell 外观设置支持改名、上传 SVG / PNG / WebP 图标及恢复默认；图标上限 512 KB。入口：`frontend/plugins/shell_ui/src/appearance.tsx`。 |
| 三类字体设置 | 正文、界面、代码字体分别选择预设或上传字体；支持 WOFF2 / TTF / OTF，上限 50 MB。删除上传字体后，引用它的角色恢复默认。 |
| 服务端持久化 | 设置与上传资源由 `shell-ui` 保存于其 `data_root/appearance/`；API 和存储入口：`plugins/shell_ui/appearance.py`。个人上传文件不进入 Git。 |
| 运行时外观应用 | `akashic-theme` 应用字体 token、品牌名称与图标；localStorage 缓存用于首屏预应用，随后读取服务端配置。入口：`packages/akashic-theme/src/appearance-runtime.ts`。 |
| 聊天品牌展示 | 聊天侧栏、默认身份入口及页面标题跟随品牌设置；已有自定义入口名称保留。聊天模块通过 theme 中的品牌投影读取外观，不直接导入 Shell 插件。 |

## 分支与同步约定

| 分支 | 用途 |
| --- | --- |
| `main` | 跟踪上游 `main`，不直接提交二开代码。 |
| `custom` | 集成已验收的二开功能，作为个人使用版本的来源。首次建立时指向第一版外观定制的已确认提交。 |
| 功能分支 | 首版为 `feat/appearance-customization`；后续从 `custom` 建分支，一次完成一项可独立验收的变化。 |

功能通过 PR 合入 `custom`。需要回馈上游时，从相应上游基线整理独立分支，仅携带该功能所需改动。

同步上游时，先 fetch 并检查更新，再以 fast-forward 方式将 `main` 对齐上游。从 `custom` 建独立同步分支，merge 已更新的 `main`，解决冲突并验证外观、设置持久化和基本聊天流程，验收后合入 `custom`。长期集成分支采用 merge 保留历史，不通过 rebase 改写已共享提交。

每次同步完成后更新本文的完整上游 commit。第一版收口期间不进行上游同步。发布记录绑定具体提交，不用浮动分支名代替版本。

## 开发与验证

开发流程遵循 [WORKFLOW.md](../WORKFLOW.md)，行为与数据约束见 [projectneed.md](../projectneed.md)，前端遵循 [设计合同](../../packages/akashic-theme/design.md)。每项任务明确问题、目标、变更边界及实际操作验收标准。

本轮相关静态检查入口：

```text
python scripts/plugin_boundary.py check
pyright --level error
pyright plugins/shell_ui --level error
npm run typecheck
npm run check:css-tokens
```

Python 检查在具备依赖的项目虚拟环境中运行。默认 pyright 范围不包含 `shell_ui`，因此单独检查该目录。构建使用 `npm run build`，生成产物不入库。

外观 API 集成验证：`python -m pytest -q tests/test_shell_appearance.py`；品牌行的真实 React 组件集成验证：`node tests/test_destination_brand.mjs`。API 验证仅写入临时目录，组件验证使用 JSDOM，不代表真实浏览器视觉验收。

展示材料随 PR 保留问题说明、关键取舍、实际验证结果及截图。未完成的浏览器、重启或部署验收应明确标出；本维护入口不重复保存检查流水账。
