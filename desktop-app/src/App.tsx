import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/api/dialog";
import { open as openShell } from "@tauri-apps/api/shell";

type ProgressEvent = {
  done: number;
  total: number;
  success: number;
  failed: number;
  started?: number;
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
  const [currentId, setCurrentId] = useState<string>("");
  const [mergeDir, setMergeDir] = useState<string>("");
  const [mergeOut, setMergeOut] = useState<string>("");
  const [completed, setCompleted] = useState<boolean>(false);
  const [tokenError, setTokenError] = useState<string>("");

  const logRef = useRef<HTMLDivElement | null>(null);
  const lastProgressRef = useRef<{
    done: number;
    success: number;
    failed: number;
    ignored: number;
  }>({ done: 0, success: 0, failed: 0, ignored: 0 });

  useEffect(() => {
    const unlisten = listen<ProgressEvent>("crawl_progress", (e) => {
      setProgress((prev) => {
        const ignoredPayload = (e.payload as any).ignored ?? 0;
        const ignoredPrev = (prev as any).ignored ?? 0;
        return {
          ...prev,
          ...e.payload,
          done: Math.max(prev.done, e.payload.done),
          success: Math.max(prev.success, e.payload.success),
          failed: Math.max(prev.failed, e.payload.failed),
          ignored: Math.max(ignoredPrev, ignoredPayload),
        } as any;
      });
    });
    const unlistenTick = listen<{ id: string }>("crawl_tick", (e) => {
      setCurrentId(e.payload.id);
      setLogs((prev) => [
        ...prev.slice(-500),
        `${new Date().toLocaleTimeString()} 正在处理 id:${e.payload.id}`,
      ]);
    });
    const unlistenItem = listen<{ id: string; result: string }>(
      "crawl_item",
      (e) => {
        setProgress((prev) => {
          const ignoredPrev = (prev as any).ignored ?? 0;
          const next = {
            ...prev,
            done: prev.done + 1,
            success:
              e.payload.result === "成功" ? prev.success + 1 : prev.success,
            failed: e.payload.result === "失败" ? prev.failed + 1 : prev.failed,
          } as any;
          const ignored =
            e.payload.result === "不解析" ? ignoredPrev + 1 : ignoredPrev;
          const changed =
            next.done !== lastProgressRef.current.done ||
            next.success !== lastProgressRef.current.success ||
            next.failed !== lastProgressRef.current.failed ||
            ignored !== lastProgressRef.current.ignored;
          if (changed) {
            setLogs((prevLogs) => [
              ...prevLogs.slice(-500),
              `${new Date().toLocaleTimeString()} 进度 ${next.done}/${
                next.total
              } 成功:${next.success} 失败:${next.failed} 忽略:${ignored}`,
            ]);
            lastProgressRef.current = {
              done: next.done,
              success: next.success,
              failed: next.failed,
              ignored,
            };
          }
          return { ...next, ignored } as any;
        });
      }
    );
    const unlistenDone = listen<{ outputs: string[] }>("crawl_done", (e) => {
      setOutputs(e.payload.outputs);
      setLogs((prev) => [
        ...prev.slice(-500),
        ...e.payload.outputs.map(
          (p) => `${new Date().toLocaleTimeString()} [完成] 数据已导出到: ${p}`
        ),
        `${new Date().toLocaleTimeString()} === 爬虫工具结束(Tauri版) ===`,
      ]);
      setRunning(false);
      setCompleted(true);
    });
    const unlistenExported = listen<{ path: string }>("crawl_exported", (e) => {
      setOutputs((prev) => [...prev, e.payload.path]);
      setLogs((prev) => [
        ...prev.slice(-500),
        `${new Date().toLocaleTimeString()} [导出] 数据已导出到: ${
          e.payload.path
        }`,
      ]);
    });
    const unlistenErr = listen<{ message: string }>("crawl_error", (e) => {
      const msg = e.payload.message;
      setLogs((prev) => [
        ...prev.slice(-500),
        `${new Date().toLocaleTimeString()} error:${msg}`,
      ]);
      if (msg.includes("连续超过10次")) {
        setTokenError("Token 无效或过期(403)，任务已终止");
        setRunning(false);
      }
    });
    return () => {
      unlisten.then((f) => f());
      unlistenDone.then((f) => f());
      unlistenTick.then((f) => f());
      unlistenErr.then((f) => f());
      unlistenItem.then((f) => f());
      unlistenExported.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const totalLabel = useMemo(
    () =>
      `${progress.done}/${progress.total} 成功:${progress.success} 失败:${
        progress.failed
      } 忽略:${(progress as any).ignored ?? 0} 启动:${progress.started ?? 0}`,
    [progress]
  );

  const onStart = async () => {
    if (!token || !startId || !endId) return;
    setTokenError("");
    setCompleted(false);
    localStorage.setItem("token", token);
    localStorage.setItem("startId", startId);
    localStorage.setItem("endId", endId);
    localStorage.setItem("concurrency", concurrency);
    localStorage.setItem("chunkSize", chunkSize);

    localStorage.setItem("outDir", outDir);
    setRunning(true);
    setLogs([]);
    setOutputs([]);
    setProgress({ done: 0, total: 0, success: 0, failed: 0 });
    setCurrentId("");
    lastProgressRef.current = { done: 0, success: 0, failed: 0, ignored: 0 };
    const sIdNum = Number(startId);
    const eIdNum = Number(endId);
    const gSize = Number(chunkSize || "0");
    const expect =
      gSize && gSize > 0
        ? `${sIdNum}-${Math.min(sIdNum + gSize - 1, eIdNum)}.xlsx 等分组导出`
        : `${sIdNum}-${eIdNum}.xlsx`;
    setLogs((prev) => [
      ...prev.slice(-500),
      `${new Date().toLocaleTimeString()} === 爬虫工具启动(Tauri版) ===`,
      `${new Date().toLocaleTimeString()} [步骤1] 开始爬取课程，共${
        eIdNum - sIdNum + 1
      }个课程ID`,
      `${new Date().toLocaleTimeString()} [配置] 输出文件路径: ${expect}`,
    ]);
    await invoke("crawl_courses", {
      token,
      startId: Number(startId),
      endId: Number(endId),
      concurrency: Number(concurrency || "10"),
      chunkSize: Number(chunkSize || "0"),
      outDir: outDir || null,
    });
  };

  const onCancel = async () => {
    await invoke("cancel_task");
    setRunning(false);
  };

  const onMerge = async () => {
    if (!mergeDir) return;
    const sep = mergeDir.includes("\\") ? "\\" : "/";
    const outPath =
      mergeOut && mergeOut.trim()
        ? mergeOut
        : `${mergeDir}${sep}合并【${startId}-${endId}】.xlsx`;
    await invoke("merge_excels_dir", { dir: mergeDir, outPath });
    setLogs((prev) => [
      ...prev.slice(-500),
      `${new Date().toLocaleTimeString()} [合并] 已输出到: ${outPath}`,
    ]);
  };

  const onMergeOutputs = async () => {
    if (outputs.length < 2) return;
    const dir = outputs[0].replace(/[\\/][^\\/]+$/, "");
    const sep = dir.includes("\\") ? "\\" : "/";
    const outPath = `${dir}${sep}合并【${startId}-${endId}】.xlsx`;
    try {
      await invoke("merge_excels", { paths: outputs, outPath });
      setLogs((prev) => [
        ...prev.slice(-500),
        `${new Date().toLocaleTimeString()} [合并] 已合并到: ${outPath}`,
      ]);
      setOutputs((prev) => [...prev, outPath]);
    } catch (_) {
      setLogs((prev) => [
        ...prev.slice(-500),
        `${new Date().toLocaleTimeString()} error:合并失败`,
      ]);
    }
  };

  const onPickMergeDir = async () => {
    const dir = await openDialog({ directory: true });
    if (typeof dir === "string") setMergeDir(dir);
  };

  const onPickMergeOutDir = async () => {
    const dir = await openDialog({ directory: true });
    if (typeof dir === "string") {
      const sep = (dir as string).includes("\\") ? "\\" : "/";
      setMergeOut(`${dir}${sep}合并【${startId}-${endId}】.xlsx`);
    }
  };
  const onClearMergeOut = () => setMergeOut("");

  const onPickOutDir = async () => {
    const dir = await openDialog({ directory: true });
    if (typeof dir === "string") setOutDir(dir);
  };

  const onClearTask = () => {
    setLogs([]);
    setOutputs([]);
    setProgress({ done: 0, total: 0, success: 0, failed: 0 });
    setCurrentId("");
    lastProgressRef.current = { done: 0, success: 0, failed: 0, ignored: 0 };
    setCompleted(false);
    setTokenError("");
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* <h1 className="text-2xl font-semibold">荔枝视频爬取工具</h1> */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm text-gray-600">
            Token{" "}
            {tokenError && (
              <span className="text-red-600 text-xs ml-2">{tokenError}</span>
            )}
          </label>
          <input
            className="px-2 py-1 text-sm border rounded w-full disabled:opacity-50 disabled:cursor-not-allowed"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={running}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <div className="flex items-end gap-2">
            <div>
              <label className="text-sm text-gray-600">开始-结束：</label>
              <div className="flex items-center gap-1">
                <input
                  className="px-2 py-1 text-sm border rounded flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  value={startId}
                  onChange={(e) => setStartId(e.target.value)}
                  disabled={running}
                />
                <span>-</span>
                <input
                  className="px-2 py-1 text-sm border rounded flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  value={endId}
                  onChange={(e) => setEndId(e.target.value)}
                  disabled={running}
                />
              </div>
            </div>
            <div className="w-40 flex-1">
              <label className="text-sm text-gray-600">分组大小</label>
              <input
                className="px-2 py-1 text-sm border rounded w-full disabled:opacity-50 disabled:cursor-not-allowed"
                value={chunkSize}
                onChange={(e) => setChunkSize(e.target.value)}
                disabled={running}
              />
            </div>
          </div>
        </div>
        {/* <div className="space-y-2">
          <label className="text-sm text-gray-600">并发数</label>
          <input
            className="px-3 py-2 border rounded w-full"
            value={concurrency}
            onChange={(e) => setConcurrency(e.target.value)}
          />
        </div> */}

        {/* <div className="space-y-2">
          <label className="text-sm text-gray-600">请求延迟(ms)</label>
          <input
            className="px-3 py-2 border rounded w-full"
            value={delayMs}
            onChange={(e) => setDelayMs(e.target.value)}
          />
        </div> */}
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm text-gray-600">输出目录</label>
          <div className="flex gap-1">
            <input
              className="px-2 py-1 text-sm border rounded flex-1"
              value={outDir}
              readOnly
              placeholder="选择输出目录，留空默认下载目录"
            />
            <button
              onClick={() => openShell(outDir || ".")}
              className="px-3 py-1 rounded bg-gray-600 text-white w-40 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={running}
              title="打开此文件夹"
            >
              打开此文件夹
            </button>
            <button
              onClick={onPickOutDir}
              className="px-3 py-1 rounded bg-gray-600 text-white w-40 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={running}
            >
              选择文件夹
            </button>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onStart}
          disabled={running || (logs.length > 0 || outputs.length > 0)}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          开始任务
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded bg-gray-600 text-white"
        >
          终止任务
        </button>
        <button
          onClick={onClearTask}
          disabled={!((logs.length > 0 || outputs.length > 0) && !running)}
          className="px-4 py-2 rounded bg-gray-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          清空当前任务结果
        </button>
      </div>
      <div className="space-y-2">
        {currentId && (
          <div className="text-sm text-gray-700">当前ID: {currentId}</div>
        )}
        <div className="text-sm text-gray-700">{totalLabel}</div>
        <div className="w-full bg-gray-200 rounded h-3 relative overflow-hidden">
          <div
            className="bg-blue-200 h-3"
            style={{
              width: progress.total
                ? `${(((progress.started ?? 0) / progress.total) * 100).toFixed(
                    2
                  )}%`
                : "0%",
            }}
          />
          <div
            className="bg-green-500 h-3 absolute top-0"
            style={{
              left: "0%",
              width: progress.total
                ? `${((progress.success / progress.total) * 100).toFixed(2)}%`
                : "0%",
            }}
          />
          <div
            className="bg-red-500 h-3 absolute top-0"
            style={{
              left: progress.total
                ? `${((progress.success / progress.total) * 100).toFixed(2)}%`
                : "0%",
              width: progress.total
                ? `${((progress.failed / progress.total) * 100).toFixed(2)}%`
                : "0%",
            }}
          />
          <div
            className="bg-gray-500 h-3 absolute top-0"
            style={{
              left: progress.total
                ? `${(
                    (((progress.success + progress.failed) as number) /
                      progress.total) *
                    100
                  ).toFixed(2)}%`
                : "0%",
              width: progress.total
                ? `${(
                    ((((progress as any).ignored ?? 0) as number) /
                      progress.total) *
                    100
                  ).toFixed(2)}%`
                : "0%",
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <div className="space-y-2 flex flex-col h-64">
          <div className="text-sm text-gray-700">日志</div>
          <div
            ref={logRef}
            className="flex-1 overflow-auto border rounded bg-neutral-50 p-2 text-xs"
          >
            {logs.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
        <div className="space-y-2 flex flex-col h-64">
          <div className="text-sm text-gray-700 flex items-center justify-between">
            <span>导出文件</span>
            <button
              onClick={onMergeOutputs}
              disabled={outputs.length < 2}
              className="px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              合并下列文件
            </button>
          </div>
          <div className="flex-1 overflow-auto border rounded bg-neutral-50 p-2 text-xs">
            {outputs.map((p) => (
              <div key={p} className="text-xs flex items-center gap-2">
                <span className="flex-1 truncate">
                  {p.split(/[\\/]/).pop() || p}
                </span>
                <button
                  onClick={() => openShell(p)}
                  className="px-2 py-1 rounded bg-blue-600 text-white"
                >
                  打开
                </button>
                <button
                  onClick={() => openShell(p.replace(/[\\/][^\\/]+$/, ""))}
                  className="px-2 py-1 rounded bg-gray-600 text-white"
                >
                  所在文件夹
                </button>
              </div>
            ))}
            {!outputs.length && (
              <div className="text-gray-400">等待爬取任务...</div>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-sm text-gray-700">
          合并 Excel（选择文件夹）
          <button
            onClick={onMerge}
            className="px-4 py-2 rounded bg-blue-600 text-white"
          >
            开始合并 Excel
          </button>
        </div>
        <div className="flex gap-1">
          <input
            className="px-2 py-1 text-sm border rounded flex-1"
            value={mergeDir}
            readOnly
            placeholder="选择包含需合并的Excel文件的文件夹"
          />

          <button
            onClick={onPickMergeDir}
            className="px-3 py-1 rounded bg-gray-600 text-white"
          >
            选择文件夹
          </button>
          {/* 清空 */}
          <button
            onClick={() => setMergeDir("")}
            className="px-3 py-1 rounded bg-gray-600 text-white"
          >
            清空
          </button>
        </div>
        <div className="flex gap-1">
          <input
            className="px-2 py-1 text-sm border rounded flex-1"
            value={mergeOut}
            onChange={(e) => setMergeOut(e.target.value)}
            placeholder="留空默认输出到所选文件夹"
          />
          <button
            onClick={onPickMergeOutDir}
            className="px-3 py-1 rounded bg-gray-600 text-white"
          >
            选择文件夹
          </button>
          <button
            onClick={onClearMergeOut}
            className="px-3 py-1 rounded bg-gray-600 text-white"
          >
            清空
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
