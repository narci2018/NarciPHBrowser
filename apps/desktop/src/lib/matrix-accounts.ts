/**
 * Matrix Platform Account & Session Management
 * Manages creator accounts across 12+ platforms (Douyin, Xiaohongshu, Channels, TikTok, Kuaishou, etc.)
 * Binds each account to an isolated Fingerprint Profile with dedicated residential proxy & storage state.
 */

export interface MatrixAccount {
  id: string;
  platformId: string;
  accountName: string;
  profileId: string;
  status: "logged_in" | "not_logged_in" | "expired";
  lastLoginTime?: string;
  notes?: string;
  avatar?: string;
  cookieData?: string; // Optional manual cookie cache
}

const STORAGE_KEY = "matrix_accounts_list_v1";

export function loadMatrixAccounts(): MatrixAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load matrix accounts:", err);
    return [];
  }
}

export function saveMatrixAccounts(accounts: MatrixAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch (err) {
    console.error("Failed to save matrix accounts:", err);
  }
}

export function createMatrixAccount(params: {
  platformId: string;
  accountName: string;
  profileId: string;
  notes?: string;
}): MatrixAccount {
  const newAccount: MatrixAccount = {
    id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    platformId: params.platformId,
    accountName: params.accountName.trim() || "未命名矩阵账号",
    profileId: params.profileId,
    status: "not_logged_in",
    notes: params.notes?.trim(),
  };

  const list = loadMatrixAccounts();
  const updated = [newAccount, ...list];
  saveMatrixAccounts(updated);
  return newAccount;
}

export function updateMatrixAccountStatus(
  id: string,
  status: "logged_in" | "not_logged_in" | "expired"
): MatrixAccount[] {
  const list = loadMatrixAccounts();
  const updated = list.map((a) =>
    a.id === id
      ? {
          ...a,
          status,
          lastLoginTime: status === "logged_in" ? new Date().toLocaleString() : a.lastLoginTime,
        }
      : a
  );
  saveMatrixAccounts(updated);
  return updated;
}

export function deleteMatrixAccount(id: string): MatrixAccount[] {
  const list = loadMatrixAccounts();
  const updated = list.filter((a) => a.id !== id);
  saveMatrixAccounts(updated);
  return updated;
}
