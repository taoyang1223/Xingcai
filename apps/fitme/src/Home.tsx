import Mannequin from "./Mannequin";

type Props = {
  nickname: string;
  hasProfile: boolean;
  preview: boolean;
  tab: string;
  onTab: (t: string) => void;
  onPreview: () => void;
  onLogout: () => void;
  onShape: () => void;
  onSize: () => void;
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

export default function Home({ nickname, hasProfile, preview, tab, onTab, onPreview, onLogout, onShape, onSize }: Props) {
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
              : "当前仅提供本地人台演示；拍照和尺码推荐尚未开放。"}
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
              <span className="pill">
                {preview && !hasProfile ? "首页界面演示 · 无真实尺寸" : "档案状态未知 · 请核对来源"}
              </span>
              <div>
                <button className="linkbtn" onClick={onShape}>打开本地人台演示</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hero">
            <Mannequin faded />
            <div>
              <div style={{ fontWeight: 650 }}>还没有你的人台</div>
              <p className="muted" style={{ margin: "6px 0 10px" }}>可查看无拍照的本地演示；尺寸非实测。</p>
              <button className="btn btn-primary btn-sm" onClick={onShape}>打开人台演示</button>
            </div>
          </div>
        )}

        <div className="paste disabled">
          <span>🔗</span>
          <input readOnly placeholder="尺码推荐尚未开放" />
          <button className="btn btn-primary btn-sm" disabled>推荐尺码未开放</button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>人台演示尺寸不可用于尺码推荐；拍照功能尚未开放。</p>
        <button className="linkbtn" onClick={onSize}>开发环境手填选码</button>

        <div className="steps">
          <span>1 查看本地演示</span>
          <span>2 区分推算与未测</span>
          <span>3 不用于选码</span>
        </div>

        {!hasProfile ? (
          <button className="linkbtn" onClick={onPreview}>{preview ? "回到空态首页" : "预览已建档首页"}</button>
        ) : null}

        <div className="privacy">本地人台演示不请求摄像头、不上传身体数据、不保存输入。</div>
      </div>
      <Tabs tab={tab} onTab={onTab} />
    </>
  );
}
