import { useEffect, useRef, useState } from "react";
import Mannequin from "./Mannequin";

type Step = "clothes" | "setup" | "front" | "side" | "review";
type Side = "front" | "side";

type Props = {
  onBack: () => void;
  onDone: (info: { heightCm: number }) => void;
};

function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

function Overlay({ side }: { side: Side }) {
  if (side === "side") {
    return (
      <svg className="cap-overlay" viewBox="0 0 200 360" aria-hidden>
        <ellipse cx="108" cy="42" rx="18" ry="22" />
        <path d="M96 62 L88 150 L100 150 L108 78 L128 150 L140 150 L118 62 Z" />
        <path d="M100 150 L96 330 L112 330 L118 150 Z" />
      </svg>
    );
  }
  return (
    <svg className="cap-overlay" viewBox="0 0 200 360" aria-hidden>
      <circle cx="100" cy="40" r="22" />
      <rect x="78" y="62" width="44" height="70" rx="18" />
      <rect x="36" y="70" width="28" height="88" rx="12" transform="rotate(-18 50 114)" />
      <rect x="136" y="70" width="28" height="88" rx="12" transform="rotate(18 150 114)" />
      <rect x="74" y="128" width="22" height="150" rx="10" />
      <rect x="104" y="128" width="22" height="150" rx="10" />
    </svg>
  );
}

function Shoot({
  side,
  onCapture,
  onBack,
}: {
  side: Side;
  onCapture: (url: string) => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((id) => clearTimeout(id)), []);
  function startCount() {
    if (count !== null) return;
    speak(side === "front" ? "请站进框内，三，二，一" : "请转九十度，三，二，一");
    setCount(3);
    timers.current.push(window.setTimeout(() => setCount(2), 1000));
    timers.current.push(window.setTimeout(() => setCount(1), 2000));
    timers.current.push(
      window.setTimeout(() => {
        setCount(null);
        snap();
      }, 3000),
    );
  }

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (stop) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch {
        setErr("打不开相机。请允许摄像头，或把手机靠墙后再试。电脑上会用前置摄像头做演示。");
      }
    })();
    return () => {
      stop = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function snap() {
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    if (video && video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(video, 0, 0);
    } else {
      canvas.width = 360;
      canvas.height = 640;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#d1d5db";
        ctx.fillRect(0, 0, 360, 640);
        ctx.fillStyle = "#6b7280";
        ctx.font = "16px sans-serif";
        ctx.fillText(side === "front" ? "正面示意" : "侧面示意", 130, 320);
      }
    }
    onCapture(canvas.toDataURL("image/jpeg", 0.7));
  }

  return (
    <div className="cap-stage">
      <video ref={videoRef} className="cap-video" playsInline muted />
      <Overlay side={side} />
      <div className="cap-hud">
        <button className="linkbtn cap-back" onClick={onBack}>取消</button>
        <div className="cap-title">{side === "front" ? "正面 · 走进人台框" : "侧面 · 原地转 90°"}</div>
        <p className="cap-hint">头顶和脚都要在框里 · 双臂微张 · 不要自己按快门</p>
        {err ? <p className="err" style={{ color: "#fecaca" }}>{err}</p> : null}
        {count !== null ? <div className="cap-count">{count}</div> : null}
        <button className="btn btn-primary" disabled={count !== null} onClick={startCount}>
          {ready ? "我已走开站好，开始倒计时" : "无相机时用示意倒计时"}
        </button>
      </div>
    </div>
  );
}

export default function Capture({ onBack, onDone }: Props) {
  const [step, setStep] = useState<Step>("clothes");
  const [height, setHeight] = useState("170");
  const [front, setFront] = useState<string | null>(null);
  const [side, setSide] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  if (step === "front") {
    return (
      <Shoot
        side="front"
        onBack={() => setStep("setup")}
        onCapture={(url) => {
          setFront(url);
          setStep("side");
        }}
      />
    );
  }
  if (step === "side") {
    return (
      <Shoot
        side="side"
        onBack={() => setStep("front")}
        onCapture={(url) => {
          setSide(url);
          setStep("review");
        }}
      />
    );
  }

  const h = Number(height);

  return (
    <div className="page" style={{ paddingBottom: 24 }}>
      <button className="linkbtn" onClick={onBack}>返回首页</button>

      {step === "clothes" ? (
        <>
          <h1 className="h1" style={{ marginTop: 16 }}>拍照前换装</h1>
          <p className="muted">穿贴身家居或运动装。不拍裸体，也不要羽绒服、卫衣。</p>
          <div className="card" style={{ marginTop: 16 }}>
            <div>
              <b>请穿</b>
              <p className="muted" style={{ margin: "6px 0 0" }}>贴身短袖或运动背心 + 紧身裤 / 薄打底。口袋掏空，长发束起。</p>
            </div>
          </div>
          <div className="card">
            <div>
              <b>请换掉</b>
              <p className="muted" style={{ margin: "6px 0 0" }}>外套、宽松卫衣、连衣裙遮腰。算法看不见衣服下面的肚子。</p>
            </div>
          </div>
          <div className="privacy">端侧检测不合格不上云 · 禁止裸体/仅内衣</div>
          <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => setStep("setup")}>已换好贴身衣服</button>
        </>
      ) : null}

      {step === "setup" ? (
        <>
          <h1 className="h1" style={{ marginTop: 16 }}>把手机靠墙</h1>
          <p className="muted">一个人拍：镜头对着空地，你走开站进框。合格后自动倒计时，不用旁边有人按快门。</p>
          <label className="muted">身高（厘米，用来定尺度）</label>
          <input className="field" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} />
          <div className="steps">
            <span>正面 A 字站</span>
            <span>转 90° 侧面</span>
            <span>原图不保存</span>
          </div>
          <button
            className="btn btn-primary"
            disabled={!Number.isFinite(h) || h < 120 || h > 220}
            onClick={() => setStep("front")}
          >
            打开相机，拍正面
          </button>
        </>
      ) : null}

      {step === "review" ? (
        <>
          <h1 className="h1" style={{ marginTop: 16 }}>这两张只作建模燃料</h1>
          <p className="muted">原图留在这台手机的内存里，点完成后丢弃，不传业务库。人脸后续会端侧模糊。</p>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            {front ? <img className="cap-thumb" src={front} alt="" /> : null}
            {side ? <img className="cap-thumb" src={side} alt="" /> : null}
          </div>
          <p className="muted">身高 {h} cm · 正 + 侧</p>
          <div className="privacy">人体照片处理完即删，不留原图</div>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => onDone({ heightCm: h })}>
            完成（本步尚未反解人台）
          </button>
          <button className="linkbtn" style={{ marginTop: 12 }} onClick={() => { setFront(null); setSide(null); setStep("front"); }}>
            重拍
          </button>
        </>
      ) : null}
    </div>
  );
}
