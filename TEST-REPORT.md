# Folio 0.1.1 Windows 关闭修复与验证

验证日期：2026-10-26（Asia/Shanghai）。

## 修复原因与行为

0.1.0 在保存后调用 close() 再次触发关闭事件；Tauri SDK 随后调用 destroy()，但主窗口权限未包含 core:window:allow-destroy，导致退出被拦住。

0.1.1 增加仅限主窗口的销毁权限，改为「拦截关闭 → 保存完成 → 直接销毁窗口」，不再重复发起关闭事件。连续关闭请求合并为一次保存；保存失败保留窗口并允许重试；关闭权限错误单独报告，不再误报为保存失败。

## 验证结果

- **36 项前端与协议测试通过**，其中新增 4 项退出回归：真实 Tauri SDK 关闭监听与打包权限联动、连续关闭、未初始化数据库、保存/关闭失败后的重试。
- **3 项 Rust 原生测试通过**：Windows 原子替换及旧版本备份、文件引用过滤与持久化、AI 地址安全边界。
- **真实原生退出自检通过**：使用独立应用标识、独立 WebView/资料库和隐藏窗口；等待真实前端与 SQLite 就绪后，连续发送两次原生关闭请求。只保存一次数据库，保存文件 69,632 字节，进程在 1,358ms 内以退出码 0 正常退出。
- 自检由单独的 close-smoke-test 编译特性启用。正式构建中该特性关闭，打包脚本还检查正式可执行文件不含自检标识，防止误发自动关闭的测试程序。
- TypeScript 严格检查、Vite 生产构建、Rust release 和 NSIS 打包通过。
- 实际覆盖升级至 0.1.1，安装器退出 0；升级前后用户数据库 SHA-256 一致。已安装程序版本为 0.1.1，启动响应正常。
- 用户本地数据已备份到 D:/codex/output/Folio-backups/before-0.1.1-20261026-212433，备份不进入源码包。

## 安装包

文件：D:/codex/output/Folio-0.1.1-windows-x64-setup.exe

大小：6,131,959 字节，约 5.85 MiB。

SHA-256：

```text
d314b89264434d94dc35c6048f8f31902f83dc15a1d7dc4ad8476e886afaf261
```

本机安装位置：当前用户 AppData/Local/知间 Folio。安装器未做代码签名。

## 可复查证据

- test-results/windows-close.json：真实原生退出、保存次数、耗时和退出码。
- test-results/windows-install.json：0.1.1 安装、版本、数据库保留与正式构建检查。
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
