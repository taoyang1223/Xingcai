import { useEffect, useState } from "react";
import * as api from "./api";
import Login from "./Login";
import PhoneLogin from "./PhoneLogin";
import Home from "./Home";

type Screen = "boot" | "login" | "phone" | "home";

export default function App() {
  const [screen, setScreen] = useState<Screen>("boot");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nickname, setNickname] = useState("用户");
  const [hasProfile, setHasProfile] = useState(false);
  const [preview, setPreview] = useState(false);
  const [tab, setTab] = useState("home");
  const [toast, setToast] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      setScreen("login");
      return;
    }
    api.profile().then((j) => {
      if (j.code === 0 && j.data) {
        setNickname(j.data.nickname);
        setHasProfile(j.data.has_body_profile);
        setScreen("home");
      } else {
        api.clearToken();
        setScreen("login");
      }
    }).catch(() => {
      api.clearToken();
      setScreen("login");
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function doLogin(provider: string, extra: { phone?: string; code?: string } = {}) {
    setBusy(true);
    setError("");
    try {
      const j = await api.login(provider, extra);
      if (j.code !== 0 || !j.data) {
        setError(j.message || "登录失败");
        return;
      }
      api.setToken(j.data.access_token);
      setNickname(j.data.nickname);
      setHasProfile(j.data.has_body_profile);
      setTab("home");
      setScreen("home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="phone">
      {screen === "boot" ? <div className="page muted">加载中…</div> : null}
      {screen === "login" ? (
        <Login
          busy={busy}
          error={error}
          onWechat={() => doLogin("wechat")}
          onAlipay={() => doLogin("alipay")}
          onPhone={() => { setError(""); setScreen("phone"); }}
        />
      ) : null}
      {screen === "phone" ? (
        <PhoneLogin
          phone={phone}
          code={code}
          busy={busy}
          error={error}
          onPhone={setPhone}
          onCode={setCode}
          onBack={() => setScreen("login")}
          onSubmit={() => doLogin("phone", { phone, code })}
        />
      ) : null}
      {screen === "home" ? (
        <Home
          nickname={nickname}
          hasProfile={hasProfile}
          preview={preview}
          tab={tab}
          toast={toast}
          onTab={setTab}
          onPreview={() => setPreview((v) => !v)}
          onLogout={() => { api.logout(); setPreview(false); setScreen("login"); }}
          onToast={setToast}
        />
      ) : null}
    </div>
  );
}
