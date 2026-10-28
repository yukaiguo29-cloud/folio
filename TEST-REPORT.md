# Folio 0.2.0 阅读回跳与安装路径验证

验证日期：2026-10-27（Asia/Shanghai）。

## 0.2.0 变更

- NSIS 安装器提供目录选择页，用户可以自定义安装路径。
- Tauri 通过 `appDirectoriesOverride` 将资料库、笔记、WebView 数据、窗口配置、缓存和日志统一放进安装目录的 `data` 子目录。
- 仓库改为公开开源项目，源码采用 MIT License；源码包、浏览器运行版、Windows 安装包和校验文件随 GitHub Release 发布。
- 更新侧栏、工具栏、按钮、卡片、统计面板、弹窗、滚动条和品牌图标的视觉层级，统一浅色与暗色模式的设计语言。
- 快捷键提示根据系统显示 `Ctrl` 或 `⌘`，并同步命令面板、设置页和全局搜索入口。
- 新增统一 `ReadingNavigationService`：返回/前进、主动页码跳转、目录、搜索、书签、批注、缩略图和跨文档跳转均保留阅读位置；普通滚动不新增历史，双栏窗格独立维护最近 50 条记录。

## 修复原因与行为

0.1.0 在保存后调用 close() 再次触发关闭事件；Tauri SDK 随后调用 destroy()，但主窗口权限未包含 core:window:allow-destroy，导致退出被拦住。

0.1.1 增加仅限主窗口的销毁权限，改为「拦截关闭 → 保存完成 → 直接销毁窗口」，不再重复发起关闭事件。连续关闭请求合并为一次保存；保存失败保留窗口并允许重试；关闭权限错误单独报告，不再误报为保存失败。0.1.2 保留这套关闭流程，并验证安装目录覆盖后的数据库和 WebView 路径。

## 验证结果

- **39 项前端与导航协议测试通过**，其中新增阅读回跳历史、去重、双窗格隔离和 50 条上限测试。
- **3 项 Rust 原生测试通过**：Windows 原子替换及旧版本备份、文件引用过滤与持久化、AI 地址安全边界。
- **真实原生退出自检通过**：使用独立应用标识、独立 WebView/资料库和隐藏窗口；等待真实前端与 SQLite 就绪后，连续发送两次原生关闭请求。只保存一次数据库，保存文件 69,632 字节，进程在 1,358ms 内以退出码 0 正常退出。
- 自检由单独的 close-smoke-test 编译特性启用。正式构建中该特性关闭，打包脚本还检查正式可执行文件不含自检标识，防止误发自动关闭的测试程序。
- TypeScript 严格检查、Vite 生产构建、Rust release 和 NSIS 打包通过。
- 实际覆盖升级至 0.2.0，安装器退出 0；升级前后用户数据库 SHA-256 一致。已安装程序版本为 0.2.0，启动响应正常。
- 用户本地数据已备份到 D:/codex/output/Folio-backups/before-0.1.1-20261026-212433，备份不进入源码包。

## 安装包

文件：D:/codex/output/Folio-0.2.0-windows-x64-setup.exe

大小：6,134,509 字节，约 5.85 MiB。

SHA-256：

```text
d4f924c17652622a43bc85de51f5a228a85fc62298606c62820ff8f78c00a9e5
```

本机安装位置：`D:/Apps/Folio`。资料库、笔记、WebView 数据、窗口配置、缓存和日志统一位于 `D:/Apps/Folio/data`。安装器未做代码签名。

独立安装路径验证：将同一安装包安装到 `D:/Apps/Folio-OpenTest` 后，程序正常启动；`data/library`、`data/webview`、`data/config`、`data/cache` 和 `data/logs` 均在该目录下生成。

## 可复查证据

- test-results/windows-close.json：真实原生退出、保存次数、耗时和退出码。
- test-results/windows-install.json：0.2.0 安装、版本、数据库保留与正式构建检查。
- tests/desktop-close.test.ts：真实 SDK、当前打包权限和退出流程回归。
- src/core/desktop-close.ts：关闭流程实现。
- src-tauri/capabilities/main.json：主窗口关闭权限。
- scripts/test-windows-close.ps1：隔离的真实原生退出测试。
- scripts/build-windows.ps1：正式构建、原生测试、安装包和校验值输出。

```powershell
npm test
.\scripts\test-windows-close.ps1
.\scripts\build-windows.ps1
```

原生退出自检验证的是实际关闭协议与落盘，不是鼠标点击自动化。此前应用控制授权超时，原生对话框、全部文档操作、触控板、高 DPI 和复杂阅读会话重启恢复仍需进一步人工验收。macOS 尚未构建。前端解析与存储测试覆盖六种真实格式、批注和进度恢复；AI 测试使用本机协议测试服务，未调用用户云端模型。




