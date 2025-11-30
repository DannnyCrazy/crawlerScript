export type Outcome = "成功" | "失败" | "不解析";

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
  overall?: Outcome;
}

export interface LiveStatus {
  successCount: number;
  failedCount: number;
  notParsedCount: number;
  totalCount: number;
  processedCount: number;
  updatedAt: string;
}

export interface LiveEvent {
  type: "start" | "result" | "ignore" | "status";
  courseId?: string;
  outcome?: Outcome;
  payload?: LiveStatus;
}
