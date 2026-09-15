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
