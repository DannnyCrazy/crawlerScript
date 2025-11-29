import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";

type ProgressEvent = {
  done: number;
  total: number;
  success: number;
  failed: number;
  current_id?: string;
};

function App() {
  const [token, setToken] = useState<string>(
    () => localStorage.getItem("token") || ""
  );
  const [startId, setStartId] = useState<string>(
    () => localStorage.getItem("startId") || ""
  );
  const [endId, setEndId] = useState<string>(
    () => localStorage.getItem("endId") || ""
  );
  const [concurrency, setConcurrency] = useState<string>(
    () => localStorage.getItem("concurrency") || "10"
  );
  const [chunkSize, setChunkSize] = useState<string>(
    () => localStorage.getItem("chunkSize") || "0"
  );
  const [delayMs, setDelayMs] = useState<string>(
    () => localStorage.getItem("delayMs") || "0"
  );
  const [outDir, setOutDir] = useState<string>(
    () => localStorage.getItem("outDir") || ""
  );
  const [running, setRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<ProgressEvent>({
    done: 0,
    total: 0,
    success: 0,
    failed: 0,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [mergeInputs, setMergeInputs] = useState<string>("");
  const [mergeOut, setMergeOut] = useState<string>("");

  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unlisten = listen<ProgressEvent>("crawl_progress", (e) => {
      setProgress(e.payload);
      setLogs((prev) => [
        ...prev.slice(-500),
        `${new Date().toLocaleTimeString()} id:${
          e.payload.current_id ?? ""
        } done:${e.payload.done}/${e.payload.total}`,
      ]);
    });
    const unlistenDone = listen<{ outputs: string[] }>("crawl_done", (e) => {
      setOutputs(e.payload.outputs);
      setRunning(false);
    });
    const unlistenErr = listen<{ message: string }>("crawl_error", (e) => {
      setLogs((prev) => [
        ...prev.slice(-500),
        `${new Date().toLocaleTimeString()} error:${e.payload.message}`,
      ]);
    });
    return () => {
      unlisten.then((f) => f());
      unlistenDone.then((f) => f());
      unlistenErr.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const totalLabel = useMemo(
    () =>
      `${progress.done}/${progress.total} 成功:${progress.success} 失败:${progress.failed}`,
    [progress]
  );

  const onStart = async () => {
    if (!token || !startId || !endId) return;
    localStorage.setItem("token", token);
    localStorage.setItem("startId", startId);
    localStorage.setItem("endId", endId);
    localStorage.setItem("concurrency", concurrency);
    localStorage.setItem("chunkSize", chunkSize);
    localStorage.setItem("delayMs", delayMs);
    localStorage.setItem("outDir", outDir);
    setRunning(true);
    setLogs([]);
    setOutputs([]);
    setProgress({ done: 0, total: 0, success: 0, failed: 0 });
    await invoke("crawl_courses", {
      token,
      startId: Number(startId),
      endId: Number(endId),
      concurrency: Number(concurrency || "10"),
      chunkSize: Number(chunkSize || "0"),
      delayMs: Number(delayMs || "0"),
      outDir: outDir || null,
    });
  };

  const onCancel = async () => {
    await invoke("cancel_task");
    setRunning(false);
  };

  const onMerge = async () => {
    const paths = mergeInputs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!paths.length || !mergeOut) return;
    await invoke("merge_excels", { paths, outPath: mergeOut });
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Excel 爬取工具</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm text-gray-600">Token</label>
          <input
            className="px-3 py-2 border rounded w-full"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-gray-600">开始ID</label>
          <input
            className="px-3 py-2 border rounded w-full"
            value={startId}
            onChange={(e) => setStartId(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-gray-600">结束ID</label>
          <input
            className="px-3 py-2 border rounded w-full"
            value={endId}
            onChange={(e) => setEndId(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-gray-600">并发数</label>
          <input
            className="px-3 py-2 border rounded w-full"
            value={concurrency}
            onChange={(e) => setConcurrency(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-gray-600">分组大小</label>
          <input
            className="px-3 py-2 border rounded w-full"
            value={chunkSize}
            onChange={(e) => setChunkSize(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-gray-600">请求延迟(ms)</label>
          <input
            className="px-3 py-2 border rounded w-full"
            value={delayMs}
            onChange={(e) => setDelayMs(e.target.value)}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm text-gray-600">输出目录</label>
          <input
            className="px-3 py-2 border rounded w-full"
            value={outDir}
            onChange={(e) => setOutDir(e.target.value)}
            placeholder="留空使用默认下载目录"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onStart}
          disabled={running}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          开始爬取
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded bg-gray-600 text-white"
        >
          取消任务
        </button>
      </div>
      <div className="space-y-2">
        <div className="text-sm text-gray-700">{totalLabel}</div>
        <div className="w-full bg-gray-200 rounded h-3">
          <div
            className="bg-green-500 h-3 rounded"
            style={{
              width: progress.total
                ? `${(progress.done / progress.total) * 100}%`
                : "0%",
            }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-sm text-gray-700">日志</div>
        <div
          ref={logRef}
          className="h-48 overflow-auto border rounded bg-neutral-50 p-2 text-xs"
        >
          {logs.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
      {!!outputs.length && (
        <div className="space-y-2">
          <div className="text-sm text-gray-700">导出文件</div>
          {outputs.map((p) => (
            <div key={p} className="text-xs">
              {p}
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        <div className="text-sm text-gray-700">合并 Excel（逗号分隔路径）</div>
        <input
          className="px-3 py-2 border rounded w-full"
          value={mergeInputs}
          onChange={(e) => setMergeInputs(e.target.value)}
          placeholder="示例：C:\\a.xlsx, C:\\b.xlsx"
        />
        <input
          className="px-3 py-2 border rounded w-full"
          value={mergeOut}
          onChange={(e) => setMergeOut(e.target.value)}
          placeholder="输出路径：C:\\merged.xlsx"
        />
        <button
          onClick={onMerge}
          className="px-4 py-2 rounded bg-blue-600 text-white"
        >
          合并 Excel
        </button>
      </div>
    </div>
  );
}

export default App;
