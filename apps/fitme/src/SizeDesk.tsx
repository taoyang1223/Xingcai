import { useState } from "react";
import * as api from "./api";

const POLICY_TEXT = "FitMe body_data v1：仅用于开发环境手填身体数据与尺码规则演示。不同意不得写入档案或得到推荐。此记录不能代替生产环境的同意留痕、备份清除和密钥托管。";

type Category = "tshirt" | "shirt" | "pants";

type Props = { onBack: () => void };

async function policySHA(): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(POLICY_TEXT));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function partsOf(category: Category): Array<"chest" | "waist" | "hip"> {
  return category === "pants" ? ["waist", "hip"] : ["chest"];
}

const PART_LABEL = { chest: "胸围", waist: "腰围", hip: "臀围" };

export default function SizeDesk({ onBack }: Props) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [height, setHeight] = useState("170");
  const [shape, setShape] = useState<"standard" | "slim" | "broad">("standard");
  const [category, setCategory] = useState<Category>("tshirt");
  const [unit, setUnit] = useState<"cm" | "inch">("cm");
  const [mode, setMode] = useState<"flat_half" | "circumference">("flat_half");
  const [body, setBody] = useState({ chest: "90", waist: "80", hip: "96" });
  const [medium, setMedium] = useState({ chest: "51", waist: "43", hip: "52" });
  const [large, setLarge] = useState({ chest: "55", waist: "46", hip: "54" });
  const [productUID] = useState(() => crypto.randomUUID());
  const [consentID, setConsentID] = useState("");
  const [result, setResult] = useState<api.SizeResult | null>(null);

  const parts = partsOf(category);

  function readPart(source: { chest: string; waist: string; hip: string }, part: "chest" | "waist" | "hip") {
    const value = Number(source[part]);
    return Number.isFinite(value) ? value : Number.NaN;
  }

  async function submit() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const heightCM = Number(height);
      const measurements: Record<string, number> = {};
      const sizes = [
        { label: "M", source: medium },
        { label: "L", source: large },
      ].map((size) => {
        const measurements: Record<string, number> = {};
        for (const part of parts) measurements[part] = readPart(size.source, part);
        return { label: size.label, measurements };
      });
      for (const part of parts) measurements[part] = readPart(body, part);
      if (!agreed || !Number.isFinite(heightCM)) {
        setError("请先单独勾选同意，并填写身高");
        return;
      }
      if (Object.values(measurements).some((n) => !Number.isFinite(n)) || sizes.some((size) => Object.values(size.measurements).some((n) => !Number.isFinite(n)))) {
        setError("请填写这一品类需要的围度");
        return;
      }
      const sha = await policySHA();
      const grant = await api.grantBodyData({
        scene: "body_data",
        policy_version: "body-data-v1",
        agree: true,
        ui_action: "separate_unchecked_checkbox",
        policy_sha256: sha,
      });
      if (grant.code !== 0 || !grant.data) {
        setError(grant.code === 50002 ? "服务端未打开开发选码。需要 dev 环境，并设置 FITME_SAFE_SIZE_ENABLED、密钥。" : (grant.message || "同意没有写成"));
        return;
      }
      setConsentID(grant.data.consent_id);
      const profile = await api.createWeakProfile({
        consent_id: grant.data.consent_id,
        height_cm: heightCM,
        body_shape: shape,
        measurements_cm: measurements,
      });
      if (profile.code !== 0 || !profile.data) {
        setError(profile.message || "档案没有写成");
        return;
      }
      const chart = await api.saveSizeChart(productUID, { category, unit, measure_mode: mode, sizes });
      if (chart.code !== 0) {
        setError(chart.message || "尺码表没有写成");
        return;
      }
      const rec = await api.recommendSize(profile.data.uid, productUID);
      if (rec.code !== 0 || !rec.data) {
        setError(rec.message || "没有得到推荐");
        return;
      }
      setResult(rec.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!consentID) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.revokeBodyData(consentID);
      if (res.code !== 0) {
        setError(res.message || "撤回失败");
        return;
      }
      setConsentID("");
      setAgreed(false);
      setResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <button className="linkbtn" onClick={onBack}>返回</button>
      <h1 className="h1" style={{ marginTop: 24 }}>开发环境手填选码</h1>
      <p className="muted">只演示规则。身高和体型不会被换算成围度。尺码表由你声明口径，结果不能当成商家复核或可购买结论。</p>
      <div className="privacy">{POLICY_TEXT}</div>
      <label className="muted" style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        我单独同意以上说明。默认不勾选。
      </label>
      <div style={{ marginTop: 16 }}>
        <input className="field" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} aria-label="身高厘米" />
        <select className="field" value={shape} onChange={(e) => setShape(e.target.value as typeof shape)} aria-label="体型模板">
          <option value="standard">体型模板 · 标准</option>
          <option value="slim">体型模板 · 偏瘦</option>
          <option value="broad">体型模板 · 偏宽</option>
        </select>
        <select className="field" value={category} onChange={(e) => setCategory(e.target.value as Category)} aria-label="品类">
          <option value="tshirt">T 恤 / 卫衣</option>
          <option value="shirt">衬衫</option>
          <option value="pants">裤装</option>
        </select>
        <select className="field" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} aria-label="单位">
          <option value="cm">单位 · 厘米</option>
          <option value="inch">单位 · 英寸</option>
        </select>
        <select className="field" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="测量方式">
          <option value="circumference">成衣围量</option>
          <option value="flat_half">平铺半宽，服务端会乘二</option>
        </select>
        {parts.map((part) => (
          <input key={part} className="field" inputMode="decimal" aria-label={`人体${PART_LABEL[part]}`} placeholder={`人体${PART_LABEL[part]}`} value={body[part]} onChange={(e) => setBody({ ...body, [part]: e.target.value })} />
        ))}
        {parts.map((part) => (
          <input key={`m-${part}`} className="field" inputMode="decimal" aria-label={`M 码${PART_LABEL[part]}`} placeholder={`M 码${PART_LABEL[part]}`} value={medium[part]} onChange={(e) => setMedium({ ...medium, [part]: e.target.value })} />
        ))}
        {parts.map((part) => (
          <input key={`l-${part}`} className="field" inputMode="decimal" aria-label={`L 码${PART_LABEL[part]}`} placeholder={`L 码${PART_LABEL[part]}`} value={large[part]} onChange={(e) => setLarge({ ...large, [part]: e.target.value })} />
        ))}
        <button className="btn btn-primary" disabled={busy || !agreed} onClick={submit}>按手填围度计算</button>
        {consentID ? <button className="btn btn-outline" style={{ marginTop: 8 }} disabled={busy} onClick={revoke}>撤回同意并删除本次档案</button> : null}
        {error ? <p className="err">{error}</p> : null}
      </div>
      {result ? (
        <div className="card" style={{ marginTop: 16, display: "block" }}>
          <b>{result.main_size ? `主码 ${result.main_size}` : "没有可靠主码"}</b>
          <div className="muted">{result.alternative ? `备选 ${result.alternative}` : "没有备选"}</div>
          <div className="muted">{result.diagnostics.map((item) => `${item.part}: ${item.verdict}`).join(" · ") || "没有部位诊断"}</div>
          <div className="muted">{result.uncertainty}</div>
          <div className="muted">{result.chart_basis} · {result.rule_version}</div>
        </div>
      ) : null}
    </div>
  );
}
