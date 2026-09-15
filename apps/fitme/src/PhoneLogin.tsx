type Props = {
  phone: string;
  code: string;
  busy?: boolean;
  error?: string;
  onPhone: (v: string) => void;
  onCode: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
};

export default function PhoneLogin({ phone, code, busy, error, onPhone, onCode, onSubmit, onBack }: Props) {
  return (
    <div className="page">
      <button className="linkbtn" onClick={onBack}>返回</button>
      <h1 className="h1" style={{ marginTop: 24 }}>手机号登录</h1>
      <p className="muted">只作登录钥匙，界面不展示完整号码，不采集身份证。</p>
      <div style={{ marginTop: 24 }}>
        <input className="field" inputMode="numeric" placeholder="手机号" value={phone} onChange={(e) => onPhone(e.target.value)} />
        <input className="field" inputMode="numeric" placeholder="验证码（开发环境填 000000）" value={code} onChange={(e) => onCode(e.target.value)} />
        <button className="btn btn-primary" disabled={busy} onClick={onSubmit}>登录</button>
        {error ? <p className="err">{error}</p> : null}
      </div>
    </div>
  );
}
