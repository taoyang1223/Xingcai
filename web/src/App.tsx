import { useEffect, useState } from "react";

type Envelope = {
  code: number;
  message: string;
  data?: { status?: string; deps?: Record<string, string> };
  trace_id?: string;
};

export default function App() {
  const [live, setLive] = useState<string>("...");
  const [ready, setReady] = useState<string>("...");

  useEffect(() => {
    fetch("/healthz")
      .then((r) => r.json())
      .then((j: Envelope) => setLive(j.data?.status ?? j.message))
      .catch((e: Error) => setLive(e.message));
    fetch("/readyz")
      .then((r) => r.json())
      .then((j: Envelope) => setReady(JSON.stringify(j.data ?? j)))
      .catch((e: Error) => setReady(e.message));
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24, maxWidth: 720 }}>
      <h1>FitMe 后台（骨架）</h1>
      <p>批次 A：能连上服务端健康检查即可。审核队列与规则编辑在后续批次。</p>
      <p>
        <b>/healthz</b>：{live}
      </p>
      <p>
        <b>/readyz</b>：{ready}
      </p>
    </main>
  );
}
