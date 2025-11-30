import fs from "fs";
import path from "path";
import { tauriOutputDir, ensureDir } from "./pathUtils";
import type { LiveEvent, LiveStatus } from "./types";

function hhmmss() {
  const d = new Date();
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export class LiveReporter {
  outDirLive = tauriOutputDir();
  liveStatusPath = path.join(this.outDirLive, "live_status.json");
  liveEventsPath = path.join(this.outDirLive, "live_events.jsonl");
  prevProcessed = 0;
  prevSuccess = 0;
  prevFailed = 0;
  prevIgnore = 0;
  lastSignature = "";
  lastPrinted = "";

  update(payload: LiveStatus) {
    ensureDir(this.outDirLive);
    fs.writeFileSync(this.liveStatusPath, JSON.stringify(payload, null, 2));
    fs.appendFileSync(this.liveEventsPath, JSON.stringify({ type: "status", payload }) + "\n");
    const changed =
      payload.processedCount !== this.prevProcessed ||
      payload.successCount !== this.prevSuccess ||
      payload.failedCount !== this.prevFailed ||
      payload.notParsedCount !== this.prevIgnore;
    const signature = `${payload.processedCount}|${payload.successCount}|${payload.failedCount}|${payload.notParsedCount}`;
    if (changed && signature !== this.lastSignature) {
      this.prevProcessed = payload.processedCount;
      this.prevSuccess = payload.successCount;
      this.prevFailed = payload.failedCount;
      this.prevIgnore = payload.notParsedCount;
      this.lastSignature = signature;
      const msg = `${hhmmss()} 进度 ${payload.processedCount}/${payload.totalCount} 成功:${payload.successCount} 失败:${payload.failedCount} 忽略:${payload.notParsedCount}`;
      this.lastPrinted = msg;
      console.log(msg);
    }
  }

  event(evt: LiveEvent) {
    ensureDir(this.outDirLive);
    fs.appendFileSync(this.liveEventsPath, JSON.stringify(evt) + "\n");
  }
}
