import fs from "fs";
import path from "path";

export function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export function projectRoot() {
  return process.cwd();
}

export function tauriOutputDir() {
  const dir = path.join(projectRoot(), "tauri-output");
  ensureDir(dir);
  return dir;
}

export function logsDir() {
  const dir = path.join(tauriOutputDir(), "logs");
  ensureDir(dir);
  return dir;
}

export function exportsDir() {
  const dir = path.join(tauriOutputDir(), "exports");
  ensureDir(dir);
  return dir;
}
