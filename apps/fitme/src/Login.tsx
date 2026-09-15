import Mannequin from "./Mannequin";

type Props = {
  busy?: boolean;
  error?: string;
  onWechat: () => void;
  onAlipay: () => void;
  onPhone: () => void;
};

export default function Login({ busy, error, onWechat, onAlipay, onPhone }: Props) {
  return (
    <div className="page">
      <div className="center">
        <div className="logo-mark">
          <Mannequin />
        </div>
        <h1 className="h1">合身 FitMe</h1>
        <p className="muted">拍两张照，看这件穿哪个码</p>
      </div>
      <div className="stack" style={{ marginTop: 48 }}>
        <button className="btn btn-wx" disabled={busy} onClick={onWechat}>
          微信一键登录
        </button>
        <button className="btn btn-outline" disabled={busy} onClick={onAlipay}>
          支付宝登录
        </button>
        <button className="linkbtn" style={{ textAlign: "center" }} disabled={busy} onClick={onPhone}>
          手机号验证码登录
        </button>
      </div>
      {error ? <p className="err" style={{ textAlign: "center" }}>{error}</p> : null}
      <p className="legal">登录即表示同意用户协议与隐私政策 · 不采集真实姓名和身份证</p>
      <div className="privacy">不保存原图 · 人体照片处理完即删</div>
    </div>
  );
}
