import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { tauriOutputDir, logsDir, exportsDir, ensureDir } from "./pathUtils";
import { LiveReporter } from "./status";
import type { RunOptions, RunResult } from "./types";

export interface RunOptions {
  scriptPath?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RunResult {
  status: "success" | "error";
  excelPath?: string;
  copiedPath?: string;
  startedAt: string;
  endedAt: string;
  code: number | null;
  errorMessage?: string;
  logPath: string;
  successCount?: number;
  failedCount?: number;
  notParsedCount?: number;
  totalCount?: number;
  overall?: "成功" | "失败" | "不解析";
}

export async function runCrawler(opts: RunOptions = {}): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const outDir = tauriOutputDir();
  const logFile = path.join(logsDir(), `run_${Date.now()}.log`);
  const scriptTs = opts.scriptPath || path.join("src", "tauri", "爬虫.tauri.ts");
  const scriptJs = path.join("dist", "src", "tauri", "爬虫.tauri.js");
  let existsJs = fs.existsSync(scriptJs);
  let tsNodeReg: string | undefined;
  if (!existsJs) {
    try {
      tsNodeReg = require.resolve("ts-node/register", { paths: [process.cwd()] });
    } catch { }
  }
  if (!existsJs && !tsNodeReg) {
    const endedAt = new Date().toISOString();
    const result: RunResult = {
      status: "error",
      excelPath: undefined,
      copiedPath: undefined,
      startedAt,
      endedAt,
      code: null,
      errorMessage: "Missing dist build and ts-node/register. Build TypeScript or install ts-node.",
      logPath: logFile,
    };
    ensureDir(outDir);
    fs.writeFileSync(path.join(outDir, "last_run.json"), JSON.stringify(result, null, 2));
    return result;
  }
  ensureDir(path.dirname(logFile));
  const command = "node";
  const args = existsJs ? [scriptJs] : ["-r", tsNodeReg as string, scriptTs];
  const child = spawn(command, args, { env: { ...process.env, ...opts.env }, stdio: ["ignore", "pipe", "pipe"] });
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  let excelPath: string | undefined;
  let errorMessage: string | undefined;
  let successCount: number | undefined;
  let failedCount: number | undefined;
  let notParsedCount: number | undefined;
  let totalCount: number | undefined;
  let processedCount = 0;
  let pendingCourseActive = false;
  const reporter = new LiveReporter();
  let currentCourseId: string | undefined;
  function stripAnsi(str: string) {
    return str.replace(/\x1b\[[0-9;]*m/g, "");
  }
  function writeLive() {
    const payload = {
      successCount: successCount || 0,
      failedCount: failedCount || 0,
      notParsedCount: notParsedCount || 0,
      totalCount: totalCount || 0,
      processedCount,
      updatedAt: new Date().toISOString(),
    };
    reporter.update(payload);
  }
  let stdoutBuf = "";
  child.stdout.on("data", (d) => {
    const chunk = stripAnsi(d.toString());
    logStream.write(chunk);
    stdoutBuf += chunk;
    const lines = stdoutBuf.split(/\r?\n/);
    stdoutBuf = lines.pop() || "";
    console.log('d', d)
    for (const s of lines) {
      const m = s.match(/数据已导出到:\s*(.+)\s*$/);
      if (m) excelPath = m[1].trim();
      const totalM = s.match(/\[步骤1\]\s*开始爬取课程，共(\d+)个课程ID/);
      if (totalM) {
        totalCount = Number(totalM[1]);
        writeLive();
      }
      const prog = s.match(/\[处理进度\]\s*正在处理第(\d+)\/(\d+)个课程/);
      if (prog) {
        totalCount = Number(prog[2]);
        if (pendingCourseActive) {
          reporter.event({ type: "ignore", courseId: currentCourseId });
          notParsedCount = (notParsedCount || 0) + 1;
          processedCount++;
          pendingCourseActive = false;
          writeLive();
        }
        pendingCourseActive = true;
      }
  const vid = s.match(/\[(\d+)\]:.*?提取视频链接.*?(成功|失败)/);
  if (vid) {
        const outcome = vid[2];
        const cid = vid[1];
        currentCourseId = cid;
        reporter.event({ type: "result", courseId: cid, outcome });
        if (outcome === "成功") successCount = (successCount || 0) + 1;
        else failedCount = (failedCount || 0) + 1;
        processedCount++;
        pendingCourseActive = false;
        writeLive();
  }
  const ppt = s.match(/\[(\d+)\]:类型:ppt语音/);
  if (ppt) {
        const cid = ppt[1];
        currentCourseId = cid;
        reporter.event({ type: "ignore", courseId: cid });
        notParsedCount = (notParsedCount || 0) + 1;
        processedCount++;
        pendingCourseActive = false;
        writeLive();
      }
      const idLine = s.match(/正在处理 id:(\d+)/);
      if (idLine) {
        const cid = idLine[1];
        if (pendingCourseActive) {
          reporter.event({ type: "ignore", courseId: currentCourseId });
          notParsedCount = (notParsedCount || 0) + 1;
          processedCount++;
          pendingCourseActive = false;
          writeLive();
        }
        currentCourseId = cid;
        reporter.event({ type: "start", courseId: cid });
        pendingCourseActive = true;
      }
    }
  });
  child.stderr.on("data", (d) => {
    const s = d.toString();
    logStream.write(s);
    const m = s.match(/错误.*?(.*)$/m);
    if (m && !errorMessage) errorMessage = m[1].trim();
  });
  const code: number | null = await new Promise((resolve) => child.on("close", resolve));
  logStream.end();
  const endedAt = new Date().toISOString();
  if (pendingCourseActive) {
    notParsedCount = (notParsedCount || 0) + 1;
    processedCount++;
    pendingCourseActive = false;
    writeLive();
  }
  const ign = s.match(/\[(\d+)\]:忽略/);
  if (ign) {
    const cid = ign[1];
    currentCourseId = cid;
    reporter.event({ type: "ignore", courseId: cid });
    notParsedCount = (notParsedCount || 0) + 1;
    processedCount++;
    pendingCourseActive = false;
    writeLive();
  }
  let copiedPath: string | undefined;
  if (excelPath && fs.existsSync(excelPath)) {
    const base = path.basename(excelPath);
    const target = path.join(exportsDir(), `${Date.now()}_${base}`);
    fs.copyFileSync(excelPath, target);
    copiedPath = target;
  }
  let overall: "成功" | "失败" | "不解析" | undefined;
  if ((successCount || 0) > 0 && (failedCount || 0) === 0) overall = "成功";
  else if ((successCount || 0) === 0 && (failedCount || 0) > 0) overall = "失败";
  else if ((successCount || 0) === 0 && (failedCount || 0) === 0 && (notParsedCount || 0) > 0) overall = "不解析";
  else if ((successCount || 0) > 0) overall = "成功";
  const result: RunResult = {
    status: code === 0 ? "success" : "error",
    excelPath,
    copiedPath,
    startedAt,
    endedAt,
    code,
    errorMessage,
    logPath: logFile,
    successCount,
    failedCount,
    notParsedCount,
    totalCount,
    overall,
  };
  fs.writeFileSync(path.join(outDir, "last_run.json"), JSON.stringify(result, null, 2));
  return result;
}
