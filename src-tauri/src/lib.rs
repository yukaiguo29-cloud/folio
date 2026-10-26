use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{Manager, State};

const MAX_DOCUMENT: u64 = 250 * 1024 * 1024;
struct LocalState {
    root: PathBuf,
    allowed: Mutex<HashSet<PathBuf>>,
    writer: Mutex<()>,
}

fn supported(path: &Path) -> bool {
    path.extension()
        .and_then(|x| x.to_str())
        .map(|x| {
            matches!(
                x.to_lowercase().as_str(),
                "pdf" | "epub" | "docx" | "txt" | "md" | "markdown" | "html" | "htm"
            )
        })
        .unwrap_or(false)
}
fn collect(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut result = Vec::new();
    for root in roots {
        for item in walkdir::WalkDir::new(root)
            .max_depth(16)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
        {
            let path = item.path();
            if item.file_type().is_file() && supported(path) {
                if let Ok(canonical) = path.canonicalize() {
                    if !result.contains(&canonical) {
                        result.push(canonical);
                    }
                }
            }
            if result.len() >= 2000 {
                return result;
            }
        }
    }
    result
}
// All filesystem access is limited to app-owned files and paths chosen in native dialogs or OS drop events.
fn authorize(state: &LocalState, paths: &[PathBuf]) -> Result<(), String> {
    let _writer = state.writer.lock().map_err(|_| "资料库写入锁不可用")?;
    let mut allowed = state.allowed.lock().map_err(|_| "文件权限锁不可用")?;
    allowed.extend(paths.iter().cloned());
    let bytes = serde_json::to_vec(&*allowed).map_err(|_| "文件引用序列化失败")?;
    atomic_write(&state.root.join("file-references.json"), &bytes)
}
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let temp = path.with_extension("tmp");
    let mut file = fs::File::create(&temp).map_err(|_| "无法创建临时保存文件")?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "磁盘写入失败，请导出备份")?;
    drop(file);
    // Retain the previous valid database so recovery is possible after disk errors or interruptions.
    if path.exists() {
        fs::copy(path, path.with_extension("bak")).map_err(|_| "备份旧资料库失败")?;
    }
    #[cfg(windows)]
    {
        // std rename cannot replace an existing file on Windows; ReplaceFileW is atomic.
        if path.exists() {
            use std::os::windows::ffi::OsStrExt;
            #[link(name = "Kernel32")]
            extern "system" {
                fn ReplaceFileW(
                    replaced: *const u16,
                    replacement: *const u16,
                    backup: *const u16,
                    flags: u32,
                    exclude: *mut core::ffi::c_void,
                    reserved: *mut core::ffi::c_void,
                ) -> i32;
            }
            let target: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            let source: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
            let ok = unsafe {
                ReplaceFileW(
                    target.as_ptr(),
                    source.as_ptr(),
                    std::ptr::null(),
                    0,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                )
            };
            return if ok != 0 {
                Ok(())
            } else {
                Err("原子保存失败，旧数据仍然保留".into())
            };
        }
    }
    fs::rename(temp, path).map_err(|_| "原子保存失败，旧数据仍然保留".into())
}

#[tauri::command]
async fn pick_documents(folder: bool, state: State<'_, LocalState>) -> Result<Vec<String>, String> {
    let dialog = rfd::AsyncFileDialog::new().set_title("导入知间 · Folio");
    let roots: Vec<PathBuf> = if folder {
        dialog
            .pick_folder()
            .await
            .into_iter()
            .map(|h| h.path().to_path_buf())
            .collect()
    } else {
        dialog
            .add_filter(
                "阅读文档",
                &[
                    "pdf", "epub", "docx", "txt", "md", "markdown", "html", "htm",
                ],
            )
            .pick_files()
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|h| h.path().to_path_buf())
            .collect()
    };
    let paths = collect(&roots);
    authorize(&state, &paths)?;
    Ok(paths
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}
#[tauri::command]
fn register_drop(paths: Vec<String>, state: State<'_, LocalState>) -> Result<Vec<String>, String> {
    let allowed = state.allowed.lock().map_err(|_| "文件权限锁不可用")?;
    let roots: Vec<PathBuf> = paths
        .iter()
        .filter_map(|p| PathBuf::from(p).canonicalize().ok())
        .collect();
    Ok(allowed
        .iter()
        .filter(|p| roots.iter().any(|root| *p == root || p.starts_with(root)))
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}
#[tauri::command]
async fn read_document(path: String, state: State<'_, LocalState>) -> Result<Vec<u8>, String> {
    let canonical = PathBuf::from(path)
        .canonicalize()
        .map_err(|_| "原文件不存在或无权限访问，请重新定位")?;
    if !state
        .allowed
        .lock()
        .map_err(|_| "文件权限锁不可用")?
        .contains(&canonical)
        || !supported(&canonical)
    {
        return Err("此文件尚未通过原生选择器或系统拖放授权".into());
    }
    if fs::metadata(&canonical)
        .map_err(|_| "无法读取文件信息")?
        .len()
        > MAX_DOCUMENT
    {
        return Err("首版最大支持 250 MB 文档".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        fs::read(canonical).map_err(|_| "读取原文件失败，请检查文件权限".to_string())
    })
    .await
    .map_err(|_| "文件读取任务失败")?
}
#[tauri::command]
fn load_database(state: State<'_, LocalState>) -> Result<Option<Vec<u8>>, String> {
    let path = state.root.join("library.sqlite");
    if !path.exists() {
        return Ok(None);
    }
    fs::read(path)
        .map(Some)
        .map_err(|_| "无法读取本地资料库，请保留目录中的 .bak 文件".into())
}
#[tauri::command]
fn save_database(bytes: Vec<u8>, state: State<'_, LocalState>) -> Result<(), String> {
    if bytes.len() > 512 * 1024 * 1024 || !bytes.starts_with(b"SQLite format 3\0") {
        return Err("无效或过大的资料库".into());
    }
    let _writer = state.writer.lock().map_err(|_| "资料库写入锁不可用")?;
    atomic_write(&state.root.join("library.sqlite"), &bytes)
}

#[derive(Deserialize, Serialize)]
struct Message {
    role: String,
    content: String,
}
#[tauri::command]
async fn ask_ai(
    endpoint: String,
    key: String,
    model: String,
    messages: Vec<Message>,
) -> Result<String, String> {
    let url = url::Url::parse(&endpoint).map_err(|_| "无效的 AI 服务地址")?;
    let local = matches!(
        url.host_str(),
        Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
    );
    if !(url.scheme() == "https" || url.scheme() == "http" && local)
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("远程服务必须使用 HTTPS，本地服务可使用 HTTP".into());
    }
    if messages.len() > 3 || messages.iter().map(|m| m.content.len()).sum::<usize>() > 100_000 {
        return Err("发送内容超过限制".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "无法创建网络连接")?;
    let mut request = client.post(url).json(
        &serde_json::json!({"model":model,"messages":messages,"stream":false,"temperature":0.2}),
    );
    if !key.is_empty() {
        request = request.bearer_auth(key);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "连接 AI 服务失败，请检查地址与本地模型服务")?;
    if !response.status().is_success() {
        return Err(format!("AI 服务返回 HTTP {}", response.status().as_u16()));
    }
    let json: serde_json::Value = response.json().await.map_err(|_| "AI 服务返回无效 JSON")?;
    json["choices"][0]["message"]["content"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "AI 服务没有返回回答内容".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    #[cfg(feature = "close-smoke-test")]
    let context = {
        let mut context = context;
        // Isolated profile: smoke verification must never touch the user's database or WebView data.
        context.config_mut().identifier =
            format!("com.zhijian.folio.close-smoke-{}", std::process::id());
        for window in &mut context.config_mut().app.windows {
            window.visible = false;
        }
        context
    };
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            fs::create_dir_all(&root)?;
            let allowed = fs::read(root.join("file-references.json"))
                .ok()
                .and_then(|bytes| serde_json::from_slice::<HashSet<PathBuf>>(&bytes).ok())
                .unwrap_or_default();
            app.manage(LocalState {
                root,
                allowed: Mutex::new(allowed),
                writer: Mutex::new(()),
            });
            #[cfg(feature = "close-smoke-test")]
            {
                use tauri::Listener;
                let handle = app.handle().clone();
                app.once("folio:close-listener-ready", move |_| {
                    let root = handle.state::<LocalState>().root.clone();
                    let _ = fs::write(
                        root.join("close-listener-ready.marker"),
                        b"SQLite and close listener ready",
                    );
                    std::thread::spawn(move || {
                        if let Some(window) = handle.get_webview_window("main") {
                            // Same native close-request path as the title-bar button, including frontend IPC ACL.
                            let _ = window.close();
                            let _ = window.close();
                        }
                    });
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                let paths = collect(paths);
                let _ = authorize(&window.state::<LocalState>(), &paths);
            }
        })
        .invoke_handler(tauri::generate_handler![
            pick_documents,
            register_drop,
            read_document,
            load_database,
            save_database,
            ask_ai
        ])
        .run(context)
        .expect("Folio could not start");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory(name: &str) -> PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("folio-tests")
            .join(format!("{name}-{stamp}"));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn atomic_replacement_preserves_previous_version_on_windows() {
        let root = test_directory("atomic-save");
        let file = root.join("library.sqlite");
        atomic_write(&file, b"first saved version").unwrap();
        atomic_write(&file, b"second saved version").unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"second saved version");
        assert_eq!(
            fs::read(root.join("library.bak")).unwrap(),
            b"first saved version"
        );
        assert!(!root.join("library.tmp").exists());
    }

    #[test]
    fn import_collects_only_supported_documents_and_persists_exact_references() {
        let root = test_directory("file-scope");
        let folder = root.join("chosen-folder");
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join("book.PDF"), b"test PDF reference").unwrap();
        fs::write(folder.join("notes.md"), b"# Notes").unwrap();
        fs::write(folder.join("executable.pdf.exe"), b"not a document").unwrap();
        let selected = collect(&[folder]);
        assert_eq!(selected.len(), 2);
        let state = LocalState {
            root: root.clone(),
            allowed: Mutex::new(HashSet::new()),
            writer: Mutex::new(()),
        };
        authorize(&state, &selected).unwrap();
        let saved: HashSet<PathBuf> =
            serde_json::from_slice(&fs::read(root.join("file-references.json")).unwrap()).unwrap();
        assert_eq!(saved, selected.into_iter().collect());
        assert!(!saved.contains(&root));
    }

    #[test]
    fn ai_rejects_insecure_remote_endpoints_without_connecting() {
        let error = tauri::async_runtime::block_on(ask_ai(
            "http://example.org/v1/chat/completions".into(),
            String::new(),
            "test".into(),
            Vec::new(),
        ))
        .unwrap_err();
        assert!(error.contains("HTTPS"));
    }
}
