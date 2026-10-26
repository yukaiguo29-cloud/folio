# 知间 · Folio

**让阅读回归阅读，让知识自然沉淀。**

Folio 0.1.1 是一个离线优先的个人文档阅读器，包含可运行的 React 应用与 Tauri 2 桌面工程。它使用真实阅读引擎与 SQLite 数据库，不包含虚构的阅读数据或 AI 回答。

> **Windows x64 安装包已生成，并已实际安装、启动。** 36 项前端测试和 3 项原生测试全部通过。Rust、MSVC 与 Windows SDK 已在本机安装完成。桌面窗口自动控制因应用授权超时未能执行，原生文件对话框、真实 PDF 窗口操作、高 DPI、触控板与完整退出恢复仍需人工验收；macOS 尚未构建。

## 0.1.1 退出修复

修复关闭监听重复请求与销毁权限缺失，保存完成后直接关闭窗口；连续点击只保存一次。真实原生退出自检确认进程正常结束。数据已备份，覆盖升级保留现有资料库。详见 TEST-REPORT.md。

## 立即运行

Windows 用户可以从 [GitHub Releases 下载 0.1.1 安装包](https://github.com/yukaiguo29-cloud/folio/releases/tag/v0.1.1)。下载 `Folio-0.1.1-windows-x64-setup.exe`，双击安装；打开应用后点击「打开文档」，或把文件拖入窗口。支持 PDF、EPUB、DOCX、TXT、Markdown 和 HTML。

安装包不需要 Node.js、Rust 或 C++ 开发工具。软件的文档引用、笔记和阅读进度保存在本机，AI 默认关闭。

Windows 安装包：`D:\codex\output\Folio-0.1.1-windows-x64-setup.exe`（6,131,959 字节，约 5.85 MiB）。双击安装即可使用，不需要安装 Node.js、Rust 或 C++ 开发工具。默认为当前用户安装到 `%LOCALAPPDATA%\知间 Folio`，本机已安装并启动。校验文件为同目录的 `.exe.sha256`；本版未配置代码签名。

浏览器开发版本仍可通过 `D:\codex\folio\启动 Folio.cmd` 运行，需要 Node.js 24。脚本打开本机地址，保留服务窗口以继续使用。

也可以运行：

```powershell
cd D:\codex\folio
npm run serve
```

访问 <http://127.0.0.1:1420/>。服务只监听本机，浏览器数据与此地址绑定；更换地址、端口或浏览器会使用不同的资料库。请使用 Edge、Chrome 等较新的桌面浏览器。不要直接双击 `dist/index.html`，WASM、Worker 和本地存储需要 HTTP 来源。

首次运行可以打开自己的文件，也可以点击「阅读 Folio 使用指南」。指南是实际导入的 Markdown 文件，支持真实的标注与持久化。

## 开发与验证

```powershell
npm ci                    # 安装锁定依赖，并复制离线 PDF 字体/CMap/WASM
npm run dev               # Vite 开发模式，127.0.0.1:1420
npm run fixtures          # 生成真实 PDF/EPUB/DOCX/TXT/MD/HTML 测试文件
npm test                  # 核心、解析器、AI 协议及 React 交互集成测试
npm run build             # TypeScript 严格检查与生产构建
npm run serve             # 运行 dist/ 生产版本
npm audit                 # 检查依赖漏洞
```

测试生成的 PDF 实际渲染结果在 `test-results/pdf-render.png`。完整验收范围见 [TEST-REPORT.md](TEST-REPORT.md)。

## 桌面构建

编译 Windows 源码需要 Node.js 24、Rust stable 的 MSVC 工具链、Microsoft C++ Build Tools 与 Windows SDK、WebView2。本机已具备 Rust/Cargo 1.99.1、Build Tools 2022 17.14.42、Windows SDK 10.0.26100.0 与 WebView2 155。参见 [Tauri 官方环境要求](https://v2.tauri.app/start/prerequisites/)。

```powershell
npm run tauri -- info
npm run desktop                    # Tauri 开发窗口
npm run package:windows            # Windows NSIS 安装包
.\scripts\build-windows.ps1         # 完整测试、构建、复制和 SHA-256 流程
```

已生成的原始安装包位于 `src-tauri/target/release/bundle/nsis/知间 Folio_0.1.1_x64-setup.exe`，另已复制为上述 `output/Folio-0.1.1-windows-x64-setup.exe`。构建脚本会在当前进程补上 `%USERPROFILE%\.cargo\bin` 路径。

macOS 需要 Xcode Command Line Tools、Rust 与 Node.js：

```sh
npm ci
npm run tauri -- build --bundles app,dmg
```

Windows 安装包在 Windows 构建，macOS 应用在 macOS 构建。已提供手动触发的 `.github/workflows/desktop.yml`；需要把源码放到自己的 GitHub 仓库后自行触发，本次没有上传源码或运行云端构建。签名、公证、自动更新和发布尚未配置。

## 已实现

| 模块      | 当前能力                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 阅读引擎  | PDF.js 真实页面与可选择文本；epub.js 章节解析；Mammoth DOCX；TXT、Markdown、HTML 安全渲染                                                               |
| PDF       | 连续/分页、单双页、缩放、适配宽度/页面、原生目录、按需渲染的缩略图、真实全文搜索、首页封面                                                              |
| 排版      | 可重排文档的字号、字体、行距、宽度、页边距、暖纸与深色；UTF-8、UTF-16 BOM、GB18030 回退；TXT 换行                                                       |
| 资料库    | 文件/批量/文件夹导入、拖放、SHA-256 去重、最近阅读、收藏、书架/工作台分组、多标签、状态、筛选与排序、网格/列表                                          |
| 长列表    | 120 份以上文档切换到固定行高虚拟列表；PDF 仅在可见区域附近保留 Canvas 与文字层                                                                          |
| 批注      | 多色高亮、下划线、文字批注、书签、跨文档灵感摘录；修改、确认删除、搜索、原文定位与 Markdown 导出                                                        |
| 阅读状态  | SQLite 保存页码、页面内相对滚动位置、笔记、设置；最近文档恢复；多标签页；面板宽度记忆                                                                   |
| 专注/对照 | 双侧面板隐藏、工具栏淡出、阅读尺、全屏、独立双文档阅读、可调整比例、每个窗格独立目录                                                                    |
| 搜索/命令 | Ctrl/Cmd+K 搜索名称、标签、正文与笔记；跳页、主题、沉浸、阅读尺、双栏等明确命令                                                                         |
| 知识沉淀  | 灵感收集箱、轻量文档分组、真实活动统计、阅读/批注时光轴                                                                                                 |
| AI        | 默认关闭；OpenAI 兼容接口/本地 Ollama；选文/当前页/关键词检索问答；逐次预览发送内容；受来源页码约束的引用跳转                                           |
| 数据      | 真正的 SQLite 文件，schema v1 迁移、FTS4 索引、中文子串搜索回退、数据库备份/恢复、串行保存与错误反馈                                                    |
| 桌面工程  | 原生文件/文件夹对话框、受用户选择与系统拖放限制的文件引用、失效路径重新关联、原子落盘与旧版本备份、关闭前保存、窗口状态插件（部分界面操作待进一步验收） |

### 文件、笔记与隐私

- **浏览器模式**：SQLite 与文件副本保存于当前来源的 IndexedDB；清除站点数据会删除它们。应用不会改动原文件。数据库备份不包含文件副本，恢复后重新导入内容一致的原文件即可关联原笔记。
- **桌面模式**：原文件按路径引用，不复制。数据库位于系统应用数据目录 `com.zhijian.folio/library.sqlite`，上一版备份为 `library.bak`。文件移动后选择内容相同的原文件重新定位，哈希不一致时不会把旧批注强行附到新内容。Windows 原子替换与文件引用保存已通过原生测试。
- PDF 批注是独立本地层，不写回原 PDF。坐标按页面归一化保存。流式文档保存原文、前后文、偏移与章节位置；文本改变或多处完全相同的上下文仍可能需要人工确认。
- 不使用账号、遥测或后台上传。文档中的脚本、嵌入内容、远程图片和外链会过滤。PDF CMap、字体、WASM 与 Worker 均随包提供。
- AI 只有在用户配置、查看本次原文并确认发送后才调用。API Key 仅保留当前会话，不进入 SQLite 或备份。真实服务还未使用用户模型实测；协议测试使用明确标记的本机测试服务，不在产品中展示演示回答。

## 架构与目录

```text
folio/
├─ src/
│  ├─ core/
│  │  ├─ types.ts          数据模型、设置默认值
│  │  ├─ database.ts       SQLite schema、索引、持久化队列
│  │  ├─ platform.ts       Tauri / IndexedDB 平台适配
│  │  ├─ library.ts        导入、去重、解析缓存、异步索引
│  │  ├─ anchors.ts        文字定位与恢复
│  │  ├─ navigation.ts     引用与笔记导航
│  │  ├─ ai.ts             原文检索、服务协议与地址验证
│  │  └─ store.ts          Zustand 界面状态
│  ├─ readers/             格式引擎、按需页面、阅读窗格
│  ├─ ui/                  资料库、设置、命令与辅助面板
│  ├─ App.tsx              应用布局与生命周期
│  └─ styles.css           浅/深色设计系统
├─ src-tauri/              Rust 桌面能力与最小权限配置
├─ scripts/                离线资源准备、样本生成、生产服务
├─ public/                 本地指南与 PDF 资源
├─ test-fixtures/          六种真实文档与损坏文件
├─ tests/                  数据、引擎、AI 与交互集成测试
├─ dist/                   已构建前端（可直接本机服务运行）
├─ .github/workflows/      Windows / macOS 构建配置
└─ 启动 Folio.cmd          Windows 本地运行入口
```

阅读引擎通过 `ReadingEngine` 接口提供页数、目录、文本、HTML 或 PDF 页面。文件来源与数据库落盘通过平台层隔离。SQLite 使用 sql.js 的 WASM 引擎，以便浏览器与桌面共享同一套迁移、索引和备份格式。保存使用 250ms 防抖、串行队列；桌面落盘使用临时文件、同步写入、原子替换和上一版备份。关闭桌面窗口前会等待保存完成，失败时保留窗口。

全文索引按页异步提取，每五页让出主线程。FTS4 处理词项，中文与部分匹配使用 SQLite 子串回退。它是首版实现，未来可把完整数据库与检索迁至专门 Worker 或 Rust SQLite，以降低超大资料库的内存和快照写入开销。

## 尚未实现及已知限制

1. **完整真实屏幕验收未完成**：Windows 安装包已交付，Rust 已编译并通过 3 项原生测试，安装器退出 0，已安装程序能启动且响应正常。桌面控制的应用授权超时，原生对话框、系统拖放、失效路径、完整退出恢复、窗口恢复、高 DPI 和触控板仍需后续实测。macOS 尚无 `.dmg`；未配置代码签名。自动化测试不等价于这些验收。
2. EPUB 是经过安全过滤的章节流式阅读，复杂 CSS、固定版式、音视频、脚注往返及部分特殊图片资源未保证完整还原。DOCX 不保证 Word 分页、页眉页脚、修订、浮动图形与复杂版式一致。
3. 扫描 PDF 暂无 OCR；加密 PDF 不弹密码框，需要先解除密码。没有 PDF 表单编辑、签名、原 PDF 批注导入或写回。
4. 页面内恢复目前使用相对滚动偏移。大幅改变字号、窗口或章节结构后，恢复位置可能轻微偏移；批注另有原文与上下文定位。搜索与注释尽量定位文字，无法匹配时回到所在页/节。
5. 首版单文件上限 250MB；原生文件夹最多 2000 份、递归深度 16；索引和数据库快照仍有内存占用。EPUB/Word 的大章节会整体解析，PDF 超大文件、数万份资料库和极端混合页面尺寸尚未压力测试。
6. 书架/工作台目前是文档分组，尚无内置 Markdown 编辑器、工作台布局快照、书架重命名/删除或跨文档关系图。资料库位置目前由应用管理，尚不能在设置中迁移到自选目录。
7. AI 文档问答是关键词检索加有限原文窗口，没有向量检索、全书完整总结、长文自动分段摘要、双文档观点对比或独立卡片管理。通用提示可对当前提供的文本进行翻译/提纲/复习卡片生成。模型回答并非事实校验结果；不存在于本次来源的页码会标为未核实引用。桌面请求停止后服务端可能继续生成，但应用会忽略已取消的结果。
8. 浏览器外部 API 受 CORS 与 CSP 限制；远程接口要求 HTTPS，本地可使用 localhost/127.0.0.1 HTTP。未提供系统钥匙串、代理设置、联网重试和流式模型响应。
9. 阅读统计每 15 秒记一次有效前台活动，空闲 90 秒后停止累计，不声称精确眼动/阅读测量。突发断电可能损失最后一次防抖/计时尚未落盘的内容；请定期导出备份。

本工程采用 React、TypeScript、Vite、Tailwind CSS、Radix Dialog、Lucide、Zustand、Motion、PDF.js、epub.js、Mammoth、Marked、DOMPurify、sql.js 与 Tauri。第三方库保留各自许可证，随源代码附有 `package-lock.json` 以便复现。
