import Mannequin from "./Mannequin";

type Props = {
  nickname: string;
  hasProfile: boolean;
  preview: boolean;
  tab: string;
  toast?: string;
  onTab: (t: string) => void;
  onPreview: () => void;
  onLogout: () => void;
  onToast: (s: string) => void;
};

function Tabs({ tab, onTab }: { tab: string; onTab: (t: string) => void }) {
  const items = [
    { id: "home", label: "首页", ic: "⌂" },
    { id: "tryon", label: "试穿", ic: "👔" },
    { id: "archive", label: "档案", ic: "👤" },
    { id: "me", label: "我的", ic: "☺" },
  ];
  return (
    <nav className="tabs">
      {items.map((it) => (
        <button key={it.id} className={tab === it.id ? "tab on" : "tab"} onClick={() => onTab(it.id)}>
          <span className="ic">{it.ic}</span>
          {it.label}
        </button>
      ))}
    </nav>
  );
}

export default function Home({ nickname, hasProfile, preview, tab, toast, onTab, onPreview, onLogout, onToast }: Props) {
  const ready = hasProfile || preview;
  const nickShort = nickname.replace("用户 ", "") || "7F2A";

  if (tab !== "home") {
    return (
      <>
        <div className="page">
          <h1 className="h1">{tab === "tryon" ? "试穿" : tab === "archive" ? "体型档案" : "我的"}</h1>
          <p className="muted" style={{ marginTop: 12 }}>
            {tab === "me"
              ? "账号为伪匿名展示名，可随时退出。"
              : "下一批次接入对准拍摄与人台。"}
          </p>
          {tab === "me" ? (
            <div className="stack" style={{ marginTop: 24 }}>
              <div className="card"><div><b>{nickname}</b><div className="muted">不展示真实姓名</div></div></div>
              <button className="btn btn-outline" onClick={onLogout}>退出登录</button>
            </div>
          ) : (
            <button className="linkbtn" onClick={() => onTab("home")}>回首页</button>
          )}
        </div>
        <Tabs tab={tab} onTab={onTab} />
      </>
    );
  }

  return (
    <>
      <div className="page">
        <div className="topbar">
          <h1 className="h1">今天适不适合</h1>
          <div className="avatar">{nickShort.slice(0, 4)}</div>
        </div>

        {ready ? (
          <div className="hero">
            <Mannequin />
            <div>
              <div style={{ fontWeight: 650 }}>我的人台</div>
              <span className="pill">{preview && !hasProfile ? "界面预览" : "18/22 已测"} · 推荐可用</span>
              <div>
                <button className="linkbtn" onClick={() => onToast("下一批次：对准框拍照补测")}>拍照补测</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hero">
            <Mannequin faded />
            <div>
              <div style={{ fontWeight: 650 }}>还没有你的人台</div>
              <p className="muted" style={{ margin: "6px 0 10px" }}>一部手机，靠墙拍正侧两张。</p>
              <button className="btn btn-primary btn-sm" onClick={() => onToast("下一批次：人台框对准拍摄")}>拍照建档</button>
              <div>
                <button className="linkbtn" onClick={() => onToast("弱档将在档案批次接入")}>用身高体重先建弱档</button>
              </div>
            </div>
          </div>
        )}

        <div className={`paste ${ready ? "" : "disabled"}`}>
          <span>🔗</span>
          <input readOnly placeholder="粘贴淘宝链接，看穿哪个码" />
          <button className="btn btn-primary btn-sm" onClick={() => onToast("下一批次：尺码推荐")}>推荐尺码</button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>也可以手填尺码表 · 照片不上传云端留存</p>

        {ready ? (
          <>
            <div className="section-h">
              <b>最近推荐</b>
              <span className="muted">全部</span>
            </div>
            <div className="card">
              <div className="thumb" />
              <div>
                <div>纯棉宽松长袖衬衫</div>
                <div style={{ marginTop: 6 }}><span className="badge">推荐 L</span><span className="muted">置信度 86%</span></div>
                <div className="muted">袖长可能偏短</div>
              </div>
            </div>
            <div className="card">
              <div className="thumb" />
              <div>
                <div>直筒休闲西裤</div>
                <div style={{ marginTop: 6 }}><span className="badge">推荐 32</span><span className="muted">置信度 74%</span></div>
              </div>
            </div>
          </>
        ) : (
          <div className="steps">
            <span>1 对准拍正侧</span>
            <span>2 粘贴链接</span>
            <span>3 看推荐码</span>
          </div>
        )}

        {!hasProfile ? (
          <button className="linkbtn" onClick={onPreview}>{preview ? "回到空态首页" : "预览已建档首页"}</button>
        ) : null}

        <div className="privacy">人体照片处理完即删，不留原图</div>
      </div>
      <Tabs tab={tab} onTab={onTab} />
      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
