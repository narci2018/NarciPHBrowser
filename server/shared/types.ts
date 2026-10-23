export interface Account {
  id: string;
  email: string;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  owner_account_id: string;
  plan_tier: 'free' | 'pro' | 'enterprise';
  created_at: string;
}

export interface Role {
  id: string;
  team_id: string | null;
  code: string;
  name: string;
  is_system: boolean;
  max_profiles: number;
  max_concurrent: number;
  permissions?: string[];
  created_at: string;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  name: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
}

export interface InternalUser {
  id: string;
  team_id: string;
  account_id: string;
  nickname: string;
  role_id: string;
  role_code: string;
  role_name: string;
  data_scope: 'ALL' | 'GROUP' | 'OWN';
  status: 'active' | 'suspended';
  perm_version: number;
  created_at: string;
}

export interface PermissionOverride {
  team_id: string;
  internal_user_id: string;
  permission_id: string;
  effect: 'ALLOW' | 'DENY';
}

export interface AuthUserTokenPayload {
  account_id: string;
  email: string;
  team_id: string;
  internal_user_id: string;
  role_code: string;
  permissions: string[];
  perm_version: number;
  quotas: {
    max_profiles: number;
    max_concurrent: number;
  };
  exp: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  invite_code?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    account_id: string;
    email: string;
    team_id: string;
    team_name: string;
    internal_user_id: string;
    nickname: string;
    role_code: string;
    role_name: string;
    permissions: string[];
    quotas: {
      max_profiles: number;
      max_concurrent: number;
    };
  };
}

export interface PreflightAccessRequest {
  profile_id: string;
  action: 'launch' | 'edit' | 'export' | 'delete';
}

export interface PreflightAccessResponse {
  allowed: boolean;
  reason?: string;
}
