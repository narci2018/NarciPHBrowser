import { useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PermissionCode } from '@narc/sdk';

// 底层请求单次执行器 (通过 Tauri native 跨平台原生请求或浏览器 fetch)
async function executeSingleHttpRequest(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  headers: Record<string, string> = {},
  body?: string
): Promise<{ ok: boolean; status: number; data: any; raw: string }> {
  try {
    const res = await invoke<{ status: number; body: string }>('rbac_http_request', {
      url,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body || null,
    });
    let parsed: any = null;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      parsed = null;
    }
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      data: parsed,
      raw: res.body,
    };
  } catch (tauriError) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body || undefined,
      });
      const data = await res.json().catch(() => null);
      return {
        ok: res.ok,
        status: res.status,
        data,
        raw: '',
      };
    } catch (fetchError) {
      throw new Error(`连接失败: ${String(tauriError || fetchError)}`);
    }
  }
}

// 智能高可用调度器 (带自动故障转移 Failover 与写操作双向中继)
async function requestBackend(
  endpointPath: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  headers: Record<string, string> = {},
  body?: string
): Promise<{ ok: boolean; status: number; data: any; raw: string; activeServerUrl: string }> {
  // 解析候选服务器列表：当前首选优先，紧接着备选节点
  const currentUrl = currentState.serverUrl;
  const candidates: string[] = [currentUrl];
  for (const s of PREDEFINED_SERVERS) {
    if (s.url !== currentUrl && !candidates.includes(s.url)) {
      candidates.push(s.url);
    }
  }

  // 格式化 endpoint 路径，确保开头为 /
  const path = endpointPath.startsWith('http://') || endpointPath.startsWith('https://')
    ? endpointPath.replace(/^https?:\/\/[^\/]+/, '')
    : (endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`);

  let lastError: any = null;

  for (let i = 0; i < candidates.length; i++) {
    const targetBase = candidates[i];
    const fullUrl = `${targetBase}${path}`;
    try {
      const res = await executeSingleHttpRequest(fullUrl, method, headers, body);
      // 如果服务器返回 5xx (如 502/503/504) 或连接异常，且还有备用节点，则触发自动故障切换
      if (res.status >= 500 && i < candidates.length - 1) {
        console.warn(`[Failover] Node ${targetBase} returned HTTP ${res.status}, failing over to backup node...`);
        continue;
      }

      // 如果经历了故障转移才成功，将活跃节点更新到 store 中
      if (targetBase !== currentUrl && res.ok) {
        currentState = {
          ...currentState,
          serverUrl: targetBase,
          serverStatus: 'connected',
        };
        notify();
      }

      // 🌟 数据实时统一保证：如果是写操作（注册/更新等）且请求的是非 Primary 主节点，在后台异步同步至对端节点
      if (['POST', 'PUT', 'DELETE'].includes(method) && res.ok && path.startsWith('/api/v1/auth/')) {
        const secondary = candidates.find((c) => c !== targetBase);
        if (secondary) {
          void executeSingleHttpRequest(`${secondary}${path}`, method, headers, body).catch(() => {});
        }
      }

      return { ...res, activeServerUrl: targetBase };
    } catch (err) {
      lastError = err;
      console.warn(`[Failover] Node ${targetBase} connection failed: ${String(err)}, trying next candidate...`);
    }
  }

  throw lastError || new Error('所有可用服务节点均无法连通');
}

export interface UserQuotas {
  max_profiles: number;
  max_concurrent: number;
}

export interface AuthUser {
  account_id: string;
  email: string;
  team_id: string;
  team_name: string;
  internal_user_id: string;
  nickname: string;
  role_code: string;
  role_name: string;
  permissions: string[];
  quotas: UserQuotas;
}

export interface AccountState {
  serverUrl: string;
  token: string | null;
  user: AuthUser | null;
  serverStatus: 'connected' | 'error' | 'untested';
  serverInfo: string | null;
}

const STORAGE_KEY = 'narciph_account_storage';
export const PREDEFINED_SERVERS = [
  { id: 'server-1', name: '服务器-1', url: 'https://ilyou6.indevs.in' },
  { id: 'server-2', name: '服务器-2', url: 'https://qx.ilyou6.indevs.in' },
] as const;

export const DEFAULT_SERVER_URL = PREDEFINED_SERVERS[0].url;

function loadPersistedState(): { serverUrl: string; token: string | null; user: AuthUser | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        serverUrl: parsed.serverUrl || DEFAULT_SERVER_URL,
        token: parsed.token || null,
        user: parsed.user || null,
      };
    }
  } catch {
    // ignore
  }
  return {
    serverUrl: DEFAULT_SERVER_URL,
    token: null,
    user: null,
  };
}

const persisted = loadPersistedState();

let currentState: AccountState = {
  serverUrl: persisted.serverUrl,
  token: persisted.token,
  user: persisted.user,
  serverStatus: 'untested',
  serverInfo: null,
};

const listeners = new Set<() => void>();

function notify() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        serverUrl: currentState.serverUrl,
        token: currentState.token,
        user: currentState.user,
      })
    );
  } catch {
    // ignore
  }
  listeners.forEach((listener) => listener());
}

export const accountStore = {
  getState(): AccountState {
    return currentState;
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setServerUrl(url: string) {
    currentState = {
      ...currentState,
      serverUrl: url.replace(/\/+$/, ''),
      serverStatus: 'untested',
      serverInfo: null,
    };
    notify();
  },

  async testConnection(): Promise<boolean> {
    try {
      const res = await requestBackend('/api/v1/health', 'GET');
      if (res.ok && res.data) {
        const data = res.data as { status?: string; platform?: string; version?: string };
        currentState = {
          ...currentState,
          serverStatus: 'connected',
          serverInfo: `${data.platform || 'Online'} (v${data.version || '1.0.0'})`,
        };
        notify();
        return true;
      }
      currentState = {
        ...currentState,
        serverStatus: 'error',
        serverInfo: `HTTP ${res.status}`,
      };
      notify();
      return false;
    } catch (e) {
      currentState = {
        ...currentState,
        serverStatus: 'error',
        serverInfo: String(e),
      };
      notify();
      return false;
    }
  },

  async login(email: string, password: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await requestBackend(
        '/api/v1/auth/login',
        'POST',
        {},
        JSON.stringify({ email, password })
      );
      const data = res.data as { success?: boolean; message?: string; token?: string; user?: AuthUser } | null;
      if (res.ok && data?.success && data?.token && data?.user) {
        currentState = {
          ...currentState,
          token: data.token,
          user: data.user,
          serverStatus: 'connected',
        };
        notify();
        return { success: true, message: data.message || '登录成功' };
      }
      return { success: false, message: data?.message || `登录失败 (HTTP ${res.status})` };
    } catch (e) {
      return { success: false, message: `网络连接异常: ${String(e)}` };
    }
  },

  async register(email: string, password: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await requestBackend(
        '/api/v1/auth/register',
        'POST',
        {},
        JSON.stringify({ email, password })
      );
      const data = res.data as { success?: boolean; message?: string; token?: string; user?: AuthUser } | null;
      if (res.ok && data?.success && data?.token && data?.user) {
        currentState = {
          ...currentState,
          token: data.token,
          user: data.user,
          serverStatus: 'connected',
        };
        notify();
        return { success: true, message: data.message || '注册成功' };
      }
      return { success: false, message: data?.message || `注册失败 (HTTP ${res.status})` };
    } catch (e) {
      return { success: false, message: `网络连接异常: ${String(e)}` };
    }
  },

  logout() {
    currentState = {
      ...currentState,
      token: null,
      user: null,
    };
    notify();
  },

  async refreshProfile() {
    const { token } = currentState;
    if (!token) return;
    try {
      const res = await requestBackend('/api/v1/auth/me', 'GET', {
        Authorization: `Bearer ${token}`,
      });
      if (res.ok && res.data) {
        const data = res.data as { success?: boolean; user?: AuthUser };
        if (data.success && data.user) {
          currentState = { ...currentState, user: data.user };
          notify();
        }
      } else if (res.status === 401) {
        currentState = { ...currentState, token: null, user: null };
        notify();
      }
    } catch {
      // ignore
    }
  },

  hasPermission(permissionCode: PermissionCode | string): boolean {
    const { user } = currentState;
    if (!user) {
      // 匿名未登录用户没有任何功能权限，必须登录
      return false;
    }
    if (user.role_code === 'owner') return true;
    return Array.isArray(user.permissions) && user.permissions.includes(permissionCode);
  },
};

export function useAccountStore<T = AccountState>(selector?: (state: AccountState) => T): T {
  const state = useSyncExternalStore(
    accountStore.subscribe,
    accountStore.getState,
    accountStore.getState
  );
  return selector ? selector(state) : (state as unknown as T);
}
