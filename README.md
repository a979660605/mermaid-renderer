# Mermaid Markdown Editor

一个纯前端的 Markdown 编辑器，支持实时预览、Mermaid 图表渲染、代码高亮、绘图嵌入、多标签编辑，以及 Word / PDF / HTML 导出。

## 项目状态

这是一个静态 Web 应用，不需要构建步骤。当前项目没有 `package.json`，也没有 Git 仓库元数据；核心代码都在 `index.html`、`style.css`、`app.js` 中，第三方库以本地 `.min.js` 文件形式直接引入。

我已做过一次基础体检：

- `node --check app.js`：通过，未发现 JavaScript 语法错误。
- 本地静态服务器加载首页：通过，默认内容和 Mermaid 示例可以正常渲染。
- 未发现首屏控制台报错。
- 已修复 Markdown 预览 HTML 清洗、自定义 CSS 入口、多标签文件句柄隔离、service worker 旧缓存清理和网络优先更新策略。

## 功能特性

- Markdown 实时编辑和预览
- Mermaid 图表渲染
- Mermaid 模板插入
- 非 Mermaid 代码块高亮
- Mermaid 单图导出 PNG
- 文档导出 Word、HTML
- PDF 通过浏览器打印功能导出
- 打开、拖拽 `.md` / `.markdown` 文件
- 粘贴或拖拽图片并以内联 base64 形式插入 Markdown，较大图片会提示并压缩
- 多标签编辑
- 标签未保存状态提示
- 编辑区行号、字号调整、查找、快捷键
- 分屏拖拽调整
- UI 主题和 Mermaid 主题切换
- 内置轻量画板，可把绘图嵌入 Markdown
- 演示模式和全屏预览
- PWA manifest 和 service worker 离线缓存

## 目录结构

```text
.
├── index.html        # 页面结构和第三方库加载入口
├── style.css         # 页面样式、主题、响应式、打印样式
├── app.js            # 编辑器、渲染、标签、绘图等主逻辑
├── modules/
│   ├── sanitizer.js  # Markdown 预览 HTML 清洗模块
│   └── export.js     # Word / HTML / Mermaid PNG 导出模块
├── tests/            # 浏览器冒烟测试页面
├── sw.js             # service worker 离线缓存
├── manifest.json     # PWA 配置
├── marked.min.js     # Markdown 解析库
├── mermaid.min.js    # Mermaid 图表库
├── highlight.min.js  # 代码高亮库
├── html-docx.js      # HTML 转 Word 导出库
└── purify.min.js     # DOMPurify HTML 清洗库
```

## 本地运行

### 方式一：直接打开

1. 在文件管理器中双击 `index.html`。
2. 成功标志：浏览器显示 `Mermaid Markdown Editor`，左侧是编辑区，右侧能看到默认 Markdown 预览。

这种方式最简单，但部分浏览器可能限制 service worker 或文件保存相关能力。

### 方式二：启动本地静态服务器

1. 在项目目录执行：

   ```bash
   python3 -m http.server 17667
   ```

2. 浏览器打开：

   ```text
   http://localhost:17667
   ```

3. 成功标志：页面正常打开，默认 Mermaid 图表能渲染成 SVG。

推荐用这种方式测试 PWA、文件 API 和浏览器兼容性。

## 基本使用

1. 在左侧编辑区输入 Markdown。
2. 右侧预览区会自动渲染内容。
3. Mermaid 图表使用代码块：

   ````markdown
   ```mermaid
   graph TD;
     A[开始] --> B[结束];
   ```
   ````

4. 点击顶部按钮导出 Word、PDF 或 HTML。
5. 点击「绘图」打开画板，绘制后点击「嵌入」插入当前 Markdown。
6. 用 `---`、`***` 或 `___` 分隔幻灯片，再点击「演示」进入演示模式。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl / Cmd + S` | 保存当前 Markdown |
| `Ctrl / Cmd + O` | 打开 Markdown 文件 |
| `Ctrl / Cmd + F` | 查找 |
| `Ctrl / Cmd + Shift + F` | 专注模式 |
| `Tab` | 插入 4 个空格 |
| `?` | 显示快捷键帮助 |
| `Esc` | 关闭弹窗或退出部分模式 |

## 已完成的关键优化

1. **降低 Markdown 预览 XSS 风险**

   Markdown 转 HTML 后会经过 DOMPurify 清洗，移除 `script`、`iframe`、内联事件属性、`javascript:` 链接等危险内容；Mermaid 也已切换为 `securityLevel: 'strict'`。

2. **补齐自定义 CSS 入口**

   工具栏已增加「CSS」按钮，可打开自定义预览 CSS 弹窗，原有保存、重置、关闭逻辑现在可以被用户正常使用。

3. **修复多标签文件句柄错配风险**

   File System Access API 的文件句柄已从全局变量改为绑定到当前 tab，避免多个文件标签之间保存到错误文件。

4. **优化 service worker 缓存更新**

   缓存版本已更新，并在激活阶段清理旧缓存；资源请求改为网络优先、缓存兜底，减少发布后继续使用旧 `app.js` / `style.css` 的概率。

5. **补齐第一阶段优化**

   已引入 DOMPurify、本地安全冒烟测试、多标签持久化测试；画板元素拖动会进入撤销栈；多标签内容会保存到 `localStorage` 并在刷新后恢复。

6. **补齐第二阶段优化**

   已将安全清洗和导出逻辑拆分到 `modules/`，新增导出冒烟测试；service worker 只处理 GET 请求，只缓存同源成功响应，并继续保持网络优先、缓存兜底策略。

7. **补齐第三阶段优化**

   已增加 Mermaid 模板入口、标签未保存状态提示、大图嵌入确认和压缩提示、Mermaid 渲染失败的修复建议，并新增产品体验冒烟测试。

## 测试

启动本地服务后可以打开以下测试页：

```text
http://localhost:17667/tests/security-smoke.html
http://localhost:17667/tests/tabs-persistence-smoke.html
http://localhost:17667/tests/export-smoke.html
http://localhost:17667/tests/product-smoke.html
```

成功标志：

- 安全测试显示「全部安全冒烟测试通过」。
- 多标签测试显示「全部多标签持久化测试通过」。
- 导出测试显示「全部导出冒烟测试通过」。
- 产品体验测试显示「全部产品体验冒烟测试通过」。

## 仍可继续优化的点

### 中优先级

1. **localStorage 多标签持久化仍有容量上限**

   多标签内容已经可以恢复，但大量 base64 图片或超大 Markdown 仍可能触发浏览器存储上限。

   建议：后续引入 IndexedDB，或提供导出工作区 / 打包保存能力。

2. **图片以内联 base64 保存，文档容易快速变大**

   粘贴图片会把图片直接写进 Markdown，虽然有压缩逻辑，但大图或多图会让文件体积和 localStorage 压力明显增加。

   建议：提示图片大小，支持外链或本地资源目录模式。

### 低优先级

1. **统计口径文案不完全一致**

   状态栏显示「字数 / 符 / 行数」，统计弹窗显示「总字数 / 单词数 / 总行数」。其中「总字数」在弹窗里实际是字符数，容易误解。

2. **PWA 图标使用 data URL**

   manifest 里图标是内联 SVG data URL。部分平台对 PWA 图标兼容性可能不如独立图标文件。

3. **移动端工具栏按钮较多**

   小屏幕下按钮压缩到较小字号，能用但可用性一般。可以考虑折叠菜单。

## 优化建议

### 代码结构

- 把 `app.js` 拆成多个模块，例如 `renderer`、`file-manager`、`tabs`、`export`、`drawing`。
- 增加最小测试用例，至少覆盖 Markdown 渲染、Mermaid 渲染失败、导出 HTML、标签切换保存。
- 给第三方库版本做记录，方便后续升级和排查兼容问题。

### 安全

- 清洗所有 Markdown 输出 HTML。
- 对导出的 HTML 标题、正文进行更严格转义和过滤。
- 如果允许自定义 CSS，明确提示它只适合信任环境，因为 CSS 也可能影响导出内容和页面显示。

### 性能

- 大文档渲染时可以只在停止输入后渲染，或增加手动渲染模式。
- 行号生成可以进一步虚拟化，避免超大文档时 DOM 节点过多。
- Mermaid 图表多时可以缓存渲染结果，避免每次全文输入都重绘所有图。

### 用户体验

- 增加“新建文档 / 清空当前文档”入口。
- 增加“导出失败原因”的详细提示。
- 文件名、未保存状态、标签关闭确认可以更明确。
- 给自定义 CSS、演示模式分隔规则、图片嵌入大小增加轻量说明。

## 发布注意事项

1. 修改静态资源后，记得更新 `sw.js` 里的缓存版本。
2. 发布前用本地服务器打开页面，确认默认内容、Mermaid、导出按钮、拖拽文件功能正常。
3. 如果用于打开外部人员提供的 Markdown，仍建议保持依赖库更新，并按需引入成熟 HTML 清洗库做进一步加固。
