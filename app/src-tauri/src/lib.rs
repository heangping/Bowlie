use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::json;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

const PET_LABEL: &str = "pet";
const WAVE_LABEL: &str = "wave";

#[cfg(target_os = "macos")]
fn show_over_full_screen(window: &WebviewWindow) {
    let Ok(ns_window_ptr) = window.ns_window() else {
        eprintln!("macOS window handle missing");
        return;
    };
    unsafe {
        let ns_window = &*ns_window_ptr.cast::<objc2_app_kit::NSWindow>();
        let behavior = ns_window.collectionBehavior()
            | objc2_app_kit::NSWindowCollectionBehavior::CanJoinAllSpaces
            | objc2_app_kit::NSWindowCollectionBehavior::FullScreenAuxiliary;
        ns_window.setCollectionBehavior(behavior);
    }
}

fn pet_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(PET_LABEL)
}

/// (x, y, width, height) in logical pixels of the monitor that owns the pet window.
fn wave_monitor_bounds(pet: &WebviewWindow) -> Option<(f64, f64, f64, f64)> {
    let monitor = pet
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| pet.primary_monitor().ok().flatten())?;
    let pos = monitor.position();
    let size = monitor.size();
    let scale = monitor.scale_factor();
    Some((
        pos.x as f64 / scale,
        pos.y as f64 / scale,
        size.width as f64 / scale,
        size.height as f64 / scale,
    ))
}

fn create_wave_window_at(
    app: &AppHandle,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), tauri::Error> {
    WebviewWindowBuilder::new(app, WAVE_LABEL, WebviewUrl::App("wave.html".into()))
        .title("bowlie-wave")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .position(x, y)
        .inner_size(w, h)
        .build()
        .map(|win| {
            if let Err(e) = win.set_ignore_cursor_events(true) {
                eprintln!("wave cursor ignore failed: {e}");
            }
        })
}

fn sync_wave_window(app: &AppHandle) {
    let Some(pet) = pet_window(app) else {
        eprintln!("pet window missing before wave sync");
        return;
    };
    let Some((x, y, w, h)) = wave_monitor_bounds(&pet) else {
        return;
    };

    if let Some(wave) = app.get_webview_window(WAVE_LABEL) {
        #[cfg(target_os = "macos")]
        show_over_full_screen(&wave);
        let _ = wave.emit("wave:clear", ());
        if let Err(e) = wave.set_position(LogicalPosition::new(x, y)) {
            eprintln!("wave position update failed: {e}");
        }
        if let Err(e) = wave.set_size(LogicalSize::new(w, h)) {
            eprintln!("wave size update failed: {e}");
        }
        let _ = pet.set_focus();
        return;
    }

    if let Err(e) = create_wave_window_at(app, x, y, w, h) {
        eprintln!("wave window create failed: {e}");
        return;
    }
    #[cfg(target_os = "macos")]
    if let Some(wave) = app.get_webview_window(WAVE_LABEL) {
        show_over_full_screen(&wave);
    }
    if let Some(pet) = pet_window(app) {
        #[cfg(target_os = "macos")]
        show_over_full_screen(&pet);
        let _ = pet.set_focus();
    }
}

fn monitor_local_position(
    pet_position: PhysicalPosition<i32>,
    monitor_position: PhysicalPosition<i32>,
    scale: f64,
    x: f64,
    y: f64,
) -> (f64, f64) {
    (
        (pet_position.x - monitor_position.x) as f64 / scale + x,
        (pet_position.y - monitor_position.y) as f64 / scale + y,
    )
}

/// 波纹从点击点扩散到该显示器边缘所需的最大半径（逻辑像素）。
///
/// 取点击点到四条边的最远距离，留 5% 余量，保证视觉上确实抵达屏幕边缘而不是
/// 在半途消散。窗口可缩放后点击位置会偏移，因此必须按实际点击点计算。
fn wave_end_radius(x: f64, y: f64, width: f64, height: f64) -> f64 {
    let farthest = x.max(width - x).max(y).max(height - y);
    (farthest * 1.05).max(200.0)
}

#[tauri::command]
fn spawn_wave(app: AppHandle, x: f64, y: f64, speed: f64) {
    let Some(pet) = pet_window(&app) else { return };
    let Ok(pos) = pet.outer_position() else {
        return;
    };
    let monitor = pet
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| pet.primary_monitor().ok().flatten());
    let (monitor_pos, monitor_size, scale) = match monitor {
        Some(monitor) => (*monitor.position(), *monitor.size(), monitor.scale_factor()),
        None => (PhysicalPosition::new(0, 0), PhysicalSize::new(0, 0), 1.0),
    };
    let (wave_x, wave_y) = monitor_local_position(pos, monitor_pos, scale, x, y);
    let end_radius = wave_end_radius(
        wave_x,
        wave_y,
        monitor_size.width as f64 / scale,
        monitor_size.height as f64 / scale,
    );
    let payload = json!({
        "x": wave_x,
        "y": wave_y,
        "speed": speed.clamp(0.5, 3.0),
        "endRadius": end_radius,
    });
    if let Some(wave) = app.get_webview_window(WAVE_LABEL) {
        let _ = wave.emit("wave:spawn", payload);
    }
}

#[tauri::command]
fn clear_waves(app: AppHandle) {
    if let Some(wave) = app.get_webview_window(WAVE_LABEL) {
        let _ = wave.emit("wave:clear", ());
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("Bowlie")
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            sync_wave_window(app.handle());

            // Recreate the wave layer when the pet window settles on a (possibly
            // different) monitor: debounce Moved events, compare monitor bounds.
            let Some(pet) = pet_window(app.handle()) else {
                eprintln!("pet window missing during setup");
                app.handle().exit(1);
                return Ok(());
            };
            let handle = app.handle().clone();
            let last_move = Arc::new(Mutex::new(Instant::now()));
            let bounds_now = Arc::new(Mutex::new(wave_monitor_bounds(&pet)));
            let last_move_events = last_move.clone();
            pet.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Moved(_)) {
                    *last_move_events.lock().unwrap() = Instant::now();
                }
            });
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(150));
                if last_move.lock().unwrap().elapsed() < Duration::from_millis(350) {
                    continue;
                }
                let Some(pet) = pet_window(&handle) else {
                    eprintln!("pet window missing during monitor poll");
                    handle.exit(0);
                    break;
                };
                let Some(new_bounds) = wave_monitor_bounds(&pet) else {
                    continue;
                };
                let mut old = bounds_now.lock().unwrap();
                if *old != Some(new_bounds) {
                    *old = Some(new_bounds);
                    sync_wave_window(&handle);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![spawn_wave, clear_waves, quit_app])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{monitor_local_position, wave_end_radius};
    use tauri::PhysicalPosition;

    #[test]
    fn converts_pet_positions_to_monitor_local_wave_coordinates() {
        let position = monitor_local_position(
            PhysicalPosition::new(-3800, 500),
            PhysicalPosition::new(-5120, -222),
            2.0,
            200.0,
            260.0,
        );
        assert_eq!(position, (860.0, 621.0));
    }

    #[test]
    fn wave_end_radius_reaches_the_farthest_screen_edge() {
        // 1920×1080 屏上点击点位于 (1200, 300)：最远边是左边缘（1200），
        // 而非右边缘（720）或上边缘（300）。
        assert!((wave_end_radius(1200.0, 300.0, 1920.0, 1080.0) - 1260.0).abs() < 1e-9);
    }

    #[test]
    fn wave_end_radius_keeps_a_floor_when_monitor_bounds_are_unknown() {
        // 显示器信息缺失时不应退化成 0，否则波纹会瞬间消散。
        assert_eq!(wave_end_radius(0.0, 0.0, 0.0, 0.0), 200.0);
    }
}
