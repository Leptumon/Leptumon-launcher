/**
 * Response shapes for Microsoft OAuth, Xbox Live, and Minecraft Services APIs.
 */
export interface AuthorizationTokenResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
  refresh_token: string;
}

export interface XboxAuthResponse {
  IssueInstant: string;
  NotAfter: string;
  Token: string;
  DisplayClaims: {
    xui: Array<{ uhs: string }>;
  };
}

export interface XSTSResponse {
  IssueInstant: string;
  NotAfter: string;
  Token: string;
  DisplayClaims: {
    xui: Array<{ uhs: string }>;
  };
}

export interface MinecraftAuthResponse {
  username: string;
  access_token: string;
  expires_in: number;
  roles: string[];
  token_type: string;
  metadata: Record<string, unknown>;
}

export interface EntitlementItem {
  name: string;
  signature: string;
}

export interface EntitlementsResponse {
  items: EntitlementItem[];
  signature: string;
  keyId: string;
}

export interface MinecraftProfile {
  id: string;
  name: string;
  skins: MinecraftSkin[];
  capes: MinecraftCape[];
}

export interface MinecraftSkin {
  id: string;
  state: string;
  url: string;
  variant: string;
  alias: string;
}

export interface MinecraftCape {
  id: string;
  state: string;
  url: string;
  alias: string;
}
