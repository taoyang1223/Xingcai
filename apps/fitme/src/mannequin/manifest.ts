/**
 * 与《12》第 4 节对齐的人台资产清单。
 * 美术导出 GLB 后改 URL / morph 名即可，App 只认这份合同。
 */

export type HeightMode = "uniformScale" | "scaleY";

export type MannequinManifest = {
  assetId: string;
  /** 相对站点根，如 /mannequin/mannequin_headless_v1.glb */
  glbUrl: string;
  format: "glb";
  units: "meters";
  upAxis: "Y";
  headless: true;
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

/** 阶段 1 占位资产：程序生成的无头胶囊人台 + 三 morph */
export const PLACEHOLDER_MANIFEST: MannequinManifest = {
  assetId: "mannequin_headless_v1",
  glbUrl: "/mannequin/mannequin_headless_v1.glb?v=3",
  format: "glb",
  units: "meters",
  upAxis: "Y",
  headless: true,
  triangleCountMax: 5000,
  baseHeightCm: 170,
  heightMode: "uniformScale",
  morphs: {
    fat: "BS_Fat",
    belly: "BS_Belly",
    shoulder: "BS_Shoulder",
  },
  licenseRef: "docs/licenses/mannequin_v1.txt",
  notes: "body.ts 同源烘焙；基准 DEFAULT_BETA；morph 为单轴拉满差值；≤5k 面",
};

export type AssetMode = "procedural" | "glb";

/** #shape?asset=glb 或 ?asset=glb */
export function assetModeFromLocation(loc: Location = window.location): AssetMode {
  const q = new URLSearchParams(loc.search);
  if (q.get("asset") === "glb") return "glb";
  const hash = loc.hash.replace(/^#/, "");
  const [, query = ""] = hash.split("?");
  if (new URLSearchParams(query).get("asset") === "glb") return "glb";
  return "procedural";
}
