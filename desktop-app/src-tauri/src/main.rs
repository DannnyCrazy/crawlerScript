#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use tauri::{State, AppHandle, Manager};
use serde::{Deserialize, Serialize};
use reqwest::Client;
use tokio::sync::Semaphore;
use tokio::time::{sleep, Duration};
use umya_spreadsheet::{Spreadsheet, writer};
use futures::stream::FuturesUnordered;
use futures::StreamExt;

#[derive(Default)]
struct CancelState(AtomicBool);

#[derive(Serialize, Deserialize, Clone)]
struct CourseItem {
  index: usize,
  title: String,
  courseId: String,
  r#type: String,
  llaUrl: String,
  courseType: String,
  result: String,
  channelId: String,
  channelName: String,
  liveroomName: String,
  lectureCount: i32,
  createTime: String,
  updateTime: String,
}

#[derive(Deserialize)]
struct CourseInfoResponse { code: i32, data: Option<CourseInfoData> }

#[derive(Deserialize)]
struct CourseInfoData { liveroom: Liveroom, lecture: LectureBasic, channel: Option<Channel> , audio_info: Option<serde_json::Value>}

#[derive(Deserialize)]
struct Liveroom { id: i64, name: String, verify_type: i32 }

#[derive(Deserialize)]
struct LectureBasic { name: String, image_mode: Option<String>, create_time: Option<String>, update_time: Option<String> }

#[derive(Deserialize)]
struct Channel { id: Option<i64>, name: Option<String>, channel_lecture_count: Option<i32> }

#[derive(Deserialize)]
struct CourseDetailResponse { code: i32, data: Option<CourseDetailData> }

#[derive(Deserialize)]
struct CourseDetailData { lecture: LectureDetail }

#[derive(Deserialize)]
struct LectureDetail { title: Option<String>, lla_type: Option<String>, lla_url: Option<String>, create_time: Option<String>, update_time: Option<String> }

fn bj_time(s: Option<&str>) -> String {
  if let Some(v) = s { if !v.is_empty() { if let Ok(t) = chrono::DateTime::parse_from_rfc3339(v) { let bj = t + chrono::Duration::hours(8); return bj.format("%Y/%m/%d %H:%M:%S").to_string(); } } }
  String::new()
}

async fn fetch_course_info(client: &Client, course_id: &str, token: &str) -> anyhow::Result<CourseInfoResponse> {
  let url = format!("https://apiv1.lizhiweike.com/api/lecture/{}/info?token={}", course_id, token);
  let resp = client.get(url).header("Accept", "application/json, text/plain, */*").header("Accept-Language", "zh-cn").header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36").send().await?;
  if resp.status().as_u16() == 403 { anyhow::bail!("HTTP_403") }
  let v = resp.json::<CourseInfoResponse>().await?;
  Ok(v)
}

async fn fetch_course_detail(client: &Client, liveroom_id: i64, lecture_id: &str, token: &str) -> anyhow::Result<CourseDetailResponse> {
  let url = format!("https://admin.lizhiweike.com/api/liverooms/{}/lectures/{}?token={}&fresh=0.95&level=normal_edit", liveroom_id, lecture_id, token);
  let resp = client.get(url).header("Accept", "application/json, text/plain, */*").header("Accept-Language", "zh-cn").header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36").header("Origin", "https://m.lizhiweike.com").send().await?;
  if resp.status().as_u16() == 403 { anyhow::bail!("HTTP_403") }
  let v = resp.json::<CourseDetailResponse>().await?;
  Ok(v)
}

async fn process_course(client: &Client, course_id: &str, token: &str) -> anyhow::Result<Vec<CourseItem>> {
  let info = fetch_course_info(client, course_id, token).await?;
  if info.code != 0 { anyhow::bail!("bad info code") }
  let data = info.data.ok_or_else(|| anyhow::anyhow!("no info data"))?;
  let mut course_type = String::from("未知");
  let mut result = CourseItem { index: 1, title: String::new(), courseId: course_id.to_string(), r#type: String::new(), llaUrl: String::new(), courseType: course_type.clone(), result: String::from("不解析"), channelId: data.channel.as_ref().and_then(|c| c.id).map(|v| v.to_string()).unwrap_or_default(), channelName: data.channel.as_ref().and_then(|c| c.name.clone()).unwrap_or_default(), liveroomName: data.liveroom.name.clone(), lectureCount: data.channel.as_ref().and_then(|c| c.channel_lecture_count).unwrap_or_default(), createTime: bj_time(data.lecture.create_time.as_deref()), updateTime: bj_time(data.lecture.update_time.as_deref()) };
  if data.lecture.image_mode.as_deref() == Some("ppt") { course_type = String::from("ppt语音"); result.courseType = course_type.clone(); return Ok(vec![result]); }
  if data.liveroom.verify_type == 2 || data.liveroom.verify_type == 1 { course_type = String::from("视频"); let detail = fetch_course_detail(client, data.liveroom.id, course_id, token).await?; if detail.code != 0 { anyhow::bail!("bad detail code") } let d = detail.data.ok_or_else(|| anyhow::anyhow!("no detail data"))?; let lecture = d.lecture; let mut item = CourseItem { index: 1, title: lecture.title.unwrap_or_default(), courseId: course_id.to_string(), r#type: lecture.lla_type.unwrap_or_default(), llaUrl: lecture.lla_url.clone().unwrap_or_default(), courseType: course_type.clone(), result: if lecture.lla_url.is_some() { String::from("成功") } else { String::from("失败") }, channelId: data.channel.as_ref().and_then(|c| c.id).map(|v| v.to_string()).unwrap_or_default(), channelName: data.channel.as_ref().and_then(|c| c.name.clone()).unwrap_or_default(), liveroomName: data.liveroom.name.clone(), lectureCount: data.channel.as_ref().and_then(|c| c.channel_lecture_count).unwrap_or_default(), createTime: bj_time(lecture.create_time.as_deref()), updateTime: bj_time(lecture.update_time.as_deref()) };
    return Ok(vec![item]);
  }
  if data.audio_info.is_some() { course_type = String::from("audio语音"); }
  if data.liveroom.verify_type == 0 { course_type = String::from("语音"); }
  result.courseType = course_type;
  Ok(vec![result])
}

fn export_to_excel(path: &str, rows: &[CourseItem]) -> anyhow::Result<()> {
  let mut book = umya_spreadsheet::new_file();
  let sheet = book.get_sheet_by_name_mut("Sheet1").unwrap();
  let headers = ["序号","课程 id","标题","课程类型","解析地址","解析结果","频道ID","频道名称","直播间名称","课程数量","创建时间","更新时间"];
  for (i, h) in headers.iter().enumerate() {
      sheet.get_cell_by_column_and_row_mut(&(i as u32 + 1), &1).set_value(h.to_string());
  }
  for (idx, r) in rows.iter().enumerate() {
    let y = idx as u32 + 2;
    sheet.get_cell_by_column_and_row_mut(&1, &y).set_value(r.index.to_string());
    sheet.get_cell_by_column_and_row_mut(&2, &y).set_value(r.courseId.clone());
    sheet.get_cell_by_column_and_row_mut(&3, &y).set_value(r.title.clone());
    sheet.get_cell_by_column_and_row_mut(&4, &y).set_value(r.courseType.clone());
    sheet.get_cell_by_column_and_row_mut(&5, &y).set_value(r.llaUrl.clone());
    sheet.get_cell_by_column_and_row_mut(&6, &y).set_value(r.result.clone());
    sheet.get_cell_by_column_and_row_mut(&7, &y).set_value(r.channelId.clone());
    sheet.get_cell_by_column_and_row_mut(&8, &y).set_value(r.channelName.clone());
    sheet.get_cell_by_column_and_row_mut(&9, &y).set_value(r.liveroomName.clone());
    sheet.get_cell_by_column_and_row_mut(&10, &y).set_value(r.lectureCount.to_string());
    sheet.get_cell_by_column_and_row_mut(&11, &y).set_value(r.createTime.clone());
    sheet.get_cell_by_column_and_row_mut(&12, &y).set_value(r.updateTime.clone());
  }
  writer::xlsx::write(&book, path)?;
  Ok(())
}

#[tauri::command]
async fn cancel_task(state: State<'_, CancelState>) -> Result<(), String> { state.0.store(true, Ordering::SeqCst); Ok(()) }

#[tauri::command]
async fn crawl_courses(app: AppHandle, state: State<'_, CancelState>, token: String, start_id: u64, end_id: u64, concurrency: usize, chunk_size: usize, out_dir: Option<String>) -> Result<(), String> {
  state.0.store(false, Ordering::SeqCst);
  let total = if end_id >= start_id { (end_id - start_id + 1) as usize } else { 0 };
  let dir = out_dir.unwrap_or_else(|| tauri::api::path::download_dir().unwrap_or(std::env::current_dir().unwrap()).to_string_lossy().to_string());
  let _ = std::fs::create_dir_all(&dir);
  let client = Client::builder().danger_accept_invalid_certs(true).build().map_err(|e| e.to_string())?;
  let ids: Vec<u64> = (start_id..=end_id).collect();
  let group_size = if chunk_size > 0 { chunk_size } else { ids.len() };
  let cancel403 = Arc::new(AtomicBool::new(false));
  let mut outputs: Vec<String> = Vec::new();
  let mut processed = 0usize;
  let mut success = 0usize;
  let mut failed = 0usize;
  let mut ignored = 0usize;
  let mut started = 0usize;
  let _ = app.emit_all("crawl_progress", serde_json::json!({"done": 0, "total": total, "success": 0, "failed": 0, "ignored": 0, "started": 0, "current_id": ""}));
  for chunk in ids.chunks(group_size) {
    let mut all_rows: Vec<CourseItem> = Vec::new();
    let sem = Arc::new(Semaphore::new(concurrency.max(1)));
    let mut futs = FuturesUnordered::new();
    for id_ref in chunk.iter() {
      let id = *id_ref;
      if state.0.load(Ordering::SeqCst) || cancel403.load(Ordering::SeqCst) { break }
      let permit = sem.clone().acquire_owned().await.unwrap();
      let token_cl = token.clone();
      let client_cl = client.clone();
      let app_cl = app.clone();
      let cancel403_cl = cancel403.clone();
      futs.push(tokio::spawn(async move {
        let cid = id.to_string();
        let mut rows = Vec::<CourseItem>::new();
        let res = process_course(&client_cl, &cid, &token_cl).await;
        let out: Result<Vec<CourseItem>, ()> = match res {
          Ok(mut v) => { rows.append(&mut v); let _ = app_cl.emit_all("crawl_tick", serde_json::json!({"id": cid })); let r = rows.first().map(|it| it.result.clone()).unwrap_or_else(|| String::from("失败")); let _ = app_cl.emit_all("crawl_item", serde_json::json!({"id": cid, "result": r })); Ok(rows) }
          Err(e) => {
            let msg = format!("{}", e);
            if msg.contains("HTTP_403") {
              let _ = app_cl.emit_all("crawl_error", serde_json::json!({"message": "403 登录失效，任务已终止"}));
              cancel403_cl.store(true, Ordering::SeqCst);
              Ok(Vec::new())
            } else {
              let _ = app_cl.emit_all("crawl_item", serde_json::json!({"id": cid.clone(), "result": "失败" }));
              Ok(vec![CourseItem{ index: 1, title: String::new(), courseId: cid.clone(), r#type: String::new(), llaUrl: String::new(), courseType: String::new(), result: String::from("失败"), channelId: String::new(), channelName: String::new(), liveroomName: String::new(), lectureCount: 0, createTime: String::new(), updateTime: String::new() }])
            }
          }
        };
        drop(permit);
        out
      }));
      started += 1;
      let _ = app.emit_all("crawl_progress", serde_json::json!({"done": processed, "total": total, "success": success, "failed": failed, "ignored": ignored, "started": started, "current_id": ""}));
      sleep(Duration::from_millis(200)).await;
    }
    while let Some(res) = futs.next().await { if let Ok(Ok(mut r)) = res { for mut item in r.drain(..) { processed += 1; item.index = all_rows.len() + 1; if item.result == "成功" { success += 1 } else if item.result == "失败" { failed += 1 } else { ignored += 1 } all_rows.push(item); let _ = app.emit_all("crawl_progress", serde_json::json!({"done": processed, "total": total, "success": success, "failed": failed, "ignored": ignored, "started": started, "current_id": ""})); } } if cancel403.load(Ordering::SeqCst) { break } }
    if cancel403.load(Ordering::SeqCst) { break }
    if all_rows.is_empty() { continue }
    let start = chunk.first().unwrap();
    let end_name = all_rows
      .iter()
      .filter_map(|it| it.courseId.parse::<u64>().ok())
      .max()
      .unwrap_or(*start);
    let fname = format!("{}-{}.xlsx", start, end_name);
    let mut path = PathBuf::from(&dir);
    path.push(fname);
    match export_to_excel(path.to_string_lossy().as_ref(), &all_rows) {
      Ok(()) => {
        outputs.push(path.to_string_lossy().to_string());
        let _ = app.emit_all("crawl_exported", serde_json::json!({"path": path.to_string_lossy().to_string()}));
      }
      Err(e) => {
        let _ = app.emit_all("crawl_error", serde_json::json!({"message": format!("导出失败: {}", e) }));
      }
    }
  }
  let _ = app.emit_all("crawl_done", serde_json::json!({"outputs": outputs}));
  Ok(())
}

#[tauri::command]
async fn merge_excels(paths: Vec<String>, out_path: String) -> Result<(), String> {
  let mut book = umya_spreadsheet::new_file();
  let sheet = book.get_sheet_by_name_mut("Sheet1").unwrap();
  let headers = ["序号","课程 id","标题","课程类型","解析地址","解析结果","频道ID","频道名称","直播间名称","课程数量","创建时间","更新时间"];
  for (i, h) in headers.iter().enumerate() { sheet.get_cell_by_column_and_row_mut(&(i as u32 + 1), &1).set_value(h.to_string()); }
  let mut idx = 1usize;
  for p in paths {
    if let Ok(b) = umya_spreadsheet::reader::xlsx::read(&std::path::Path::new(&p)) {
      if let Ok(s) = b.get_sheet_by_name("Sheet1") {
        let last_row = s.get_highest_row();
        for y in 2..=last_row {
            idx += 1;
            let y2 = idx as u32;
            sheet.get_cell_by_column_and_row_mut(&1, &y2).set_value(idx.to_string());
            for x in 2..=12 {
                if let Some(cell) = s.get_cell_by_column_and_row(&x, &y) {
                    let c = cell.get_value();
                    if !c.is_empty() {
                        sheet.get_cell_by_column_and_row_mut(&x, &y2).set_value(c.to_string());
                    }
                }
            }
        }
      }
    }
  }
  writer::xlsx::write(&book, out_path).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
async fn merge_excels_dir(dir: String, out_path: String) -> Result<(), String> {
  let mut paths: Vec<String> = Vec::new();
  let rd = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
  for e in rd {
    if let Ok(de) = e {
      let p = de.path();
      if p.is_file() {
        if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
          if ext.eq_ignore_ascii_case("xlsx") {
            paths.push(p.to_string_lossy().to_string());
          }
        }
      }
    }
  }
  merge_excels(paths, out_path).await
}

fn main() {
  tauri::Builder::default().manage(CancelState(AtomicBool::new(false))).invoke_handler(tauri::generate_handler![crawl_courses, cancel_task, merge_excels, merge_excels_dir]).run(tauri::generate_context!()).expect("error while running tauri application");
}
