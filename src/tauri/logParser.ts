import type { LiveReporter } from "./status";
import type { LiveStatus, Outcome } from "./types";

export class LogParser {
  successCount = 0;
  failedCount = 0;
  notParsedCount = 0;
  totalCount = 0;
  processedCount = 0;
  pendingCourseActive = false;
  currentCourseId: string | undefined;
  excelPath: string | undefined;

  consume(line: string, reporter: LiveReporter) {
    const m = line.match(/数据已导出到:\s*(.+)\s*$/);
    if (m) this.excelPath = m[1].trim();

    const totalM = line.match(/\[步骤1\]\s*开始爬取课程，共(\d+)个课程ID/);
    if (totalM) {
      this.totalCount = Number(totalM[1]);
      this.write(reporter);
    }

    const prog = line.match(/\[处理进度\]\s*正在处理第(\d+)\/(\d+)个课程/);
    if (prog) {
      this.totalCount = Number(prog[2]);
      if (this.pendingCourseActive) {
        this.notParsedCount += 1;
        this.processedCount += 1;
        this.pendingCourseActive = false;
        this.write(reporter);
      }
      this.pendingCourseActive = true;
    }

    const vid = line.match(/\[(\d+)\]:.*?提取视频链接.*?(成功|失败)/);
    if (vid) {
      const outcome = vid[2] as Outcome;
      const cid = vid[1];
      this.currentCourseId = cid;
      reporter.event({ type: "result", courseId: cid, outcome });
      if (outcome === "成功") this.successCount += 1; else this.failedCount += 1;
      this.processedCount += 1;
      this.pendingCourseActive = false;
      this.write(reporter);
    }

    const ppt = line.match(/\[(\d+)\]:类型:ppt语音/);
    if (ppt) {
      const cid = ppt[1];
      this.currentCourseId = cid;
      reporter.event({ type: "ignore", courseId: cid });
      this.notParsedCount += 1;
      this.processedCount += 1;
      this.pendingCourseActive = false;
      this.write(reporter);
    }

    const idLine = line.match(/正在处理 id:(\d+)/);
    if (idLine) {
      const cid = idLine[1];
      if (this.pendingCourseActive) {
        reporter.event({ type: "ignore", courseId: this.currentCourseId });
        this.notParsedCount += 1;
        this.processedCount += 1;
        this.pendingCourseActive = false;
        this.write(reporter);
      }
      this.currentCourseId = cid;
      reporter.event({ type: "start", courseId: cid });
      this.pendingCourseActive = true;
    }
  }

  finalize(reporter: LiveReporter) {
    if (this.pendingCourseActive) {
      this.notParsedCount += 1;
      this.processedCount += 1;
      this.pendingCourseActive = false;
      this.write(reporter);
    }
  }

  write(reporter: LiveReporter) {
    const payload: LiveStatus = {
      successCount: this.successCount,
      failedCount: this.failedCount,
      notParsedCount: this.notParsedCount,
      totalCount: this.totalCount,
      processedCount: this.processedCount,
      updatedAt: new Date().toISOString(),
    };
    reporter.update(payload);
  }
}
