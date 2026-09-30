/**
 * 与《12》第 4 节对齐的人台资产清单。
 * 美术导出 GLB 后改 URL / morph 名即可，App 只认这份合同。
 */

export type HeightMode = "uniformScale" | "scaleY";

export type MannequinManifest = {
  assetId: string;
  /** 相对站点根，如 /mannequin/mannequin_headless_v1.glb */
  glbUrl: string;
  /** 关掉衣服后补上的躯干和腿。没有这层时仍显示衣服内衬。 */
  bodyCompleteUrl?: string;
  format: "glb";
  units: "meters";
  upAxis: "Y";
  /** 当前占位仍是无头。下一版展示可以带固定抽象头。 */
  headless: boolean;
  triangleCountMax: number;
  /** 基准网格对应的身高（cm），用于 heightCm → scale */
  baseHeightCm: number;
  heightMode: HeightMode;
  morphs: {
    fat: string;
    belly: string;
    shoulder: string;
  };
  licenseRef?: string;
  notes?: string;
};

/** 混元生 3D 文字生成的外形预览。没有衣服分件，也没有三个形态键。 */
export const PLACEHOLDER_MANIFEST: MannequinManifest = {
  assetId: "hunyuan_preview",
  glbUrl: "/mannequin/hunyuan_preview.glb?v=2",
  bodyCompleteUrl: "/mannequin/body_complete.glb?v=16",
  format: "glb",
  units: "meters",
  upAxis: "Y",
  headless: false,
  triangleCountMax: 25000,
  baseHeightCm: 118,
  heightMode: "uniformScale",
  morphs: {
    fat: "BS_Fat",
    belly: "BS_Belly",
    shoulder: "BS_Shoulder",
  },
  notes: "混元外形。上衣和裤子是单独网格，名字含 garment，可由衣服开关隐藏。头、手臂和鞋留在身体上。胖瘦、肚子、肩宽还没有形态键。围度仍来自 measure(β)。",
};

export type AssetMode = "procedural" | "glb";

/** 人台页默认显示混元外形。只有显式 asset=procedural 时才用参数网格。 */
export function assetModeFromLocation(loc: Location = window.location): AssetMode {
  const q = new URLSearchParams(loc.search);
  if (q.get("asset") === "procedural") return "procedural";
  const hash = loc.hash.replace(/^#/, "");
  const [, query = ""] = hash.split("?");
  if (new URLSearchParams(query).get("asset") === "procedural") return "procedural";
  return "glb";
}
