export type Envelope<T> = {
  code: number;
  message: string;
  data: T;
  trace_id?: string;
};

export type Session = {
  access_token: string;
  expires_in: number;
  uid: string;
  nickname: string;
  has_body_profile: boolean;
};

const TOKEN_KEY = "fitme_token";
const DEVICE_KEY = "fitme_device_id";

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function parse<T>(res: Response): Promise<Envelope<T>> {
  return res.json() as Promise<Envelope<T>>;
}

export async function login(provider: string, extra: { phone?: string; code?: string } = {}): Promise<Envelope<Session>> {
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": deviceId() },
    body: JSON.stringify({ provider, device_id: deviceId(), ...extra }),
  });
  return parse<Session>(res);
}

export async function profile(): Promise<Envelope<Pick<Session, "uid" | "nickname" | "has_body_profile">>> {
  const token = getToken();
  const res = await fetch("/api/v1/user/profile", {
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  return parse(res);
}

async function authed<T>(path: string, method: string, body?: unknown): Promise<Envelope<T>> {
  const token = getToken();
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token ?? ""}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

export function grantBodyData(body: {
  scene: "body_data";
  policy_version: "body-data-v1";
  agree: true;
  ui_action: "separate_unchecked_checkbox";
  policy_sha256: string;
}) {
  return authed<{ consent_id: string; evidence: string }>("/api/v1/user/consents", "POST", body);
}

export function createWeakProfile(body: {
  consent_id: string;
  height_cm: number;
  body_shape: "standard" | "slim" | "broad";
  measurements_cm?: Record<string, number>;
}) {
  return authed<{ uid: string }>("/api/v1/body/profiles", "POST", body);
}

export function saveSizeChart(productUID: string, body: {
  category: "tshirt" | "shirt" | "pants";
  unit: "cm" | "inch";
  measure_mode: "flat_half" | "circumference";
  sizes: { label: string; measurements: Record<string, number> }[];
}) {
  return authed<{ product_uid: string }>(`/api/v1/catalog/products/${productUID}/size-chart`, "POST", body);
}

export type SizeResult = {
  main_size: string | null;
  alternative: string | null;
  diagnostics: { part: string; verdict: string }[];
  uncertainty: string;
  chart_basis: string;
  rule_version: string;
};

export function recommendSize(profileUID: string, productUID: string) {
  return authed<SizeResult>("/api/v1/recommend/size", "POST", { profile_uid: profileUID, product_uid: productUID });
}

export function revokeBodyData(consentID: string) {
  return authed<{ revoked: boolean }>(`/api/v1/user/consents/${consentID}`, "DELETE");
}

export async function logout() {
  const token = getToken();
  if (token) {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
  clearToken();
}
