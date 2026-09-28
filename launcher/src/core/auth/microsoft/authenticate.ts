/**
 * Microsoft → Xbox Live → Minecraft authentication.
 *
 * Flow: open browser OAuth → localhost callback (server.ts) → token exchange →
 * profile/ownership check → encrypted refresh token in electron-store.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCb } from 'crypto';

import { app, shell, WebContents } from 'electron';
import fsa from 'fs/promises';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { exec as execCb } from 'child_process';

const scrypt = promisify(scryptCb);
const exec = promisify(execCb);
import { jwtVerify, decodeJwt } from 'jose';

import { deleteConfig, getConfig, setConfig } from '../../../main/settings';
import { logger } from '../../utils/logger';
import { AuthorizationTokenResponse, EntitlementsResponse, MinecraftAuthResponse, MinecraftProfile, XboxAuthResponse, XSTSResponse } from '../../../types/auth/authTypes';

import { startServer } from './server';

const KEY_FILE_NAME = 'secret.key';

async function getOrCreateEncryptionKey(): Promise<Buffer> {
    try {
        const userData = app.getPath('userData');
        const keyPath = path.join(userData, KEY_FILE_NAME);
        try {
            const existing = await fsa.readFile(keyPath);
            // key stored as raw bytes or hex. Try as raw first, else hex.
            if (existing.length === 32) return existing;
            const maybeHex = existing.toString('utf8').trim();
            if (maybeHex.length === 64) return Buffer.from(maybeHex, 'hex');
            // Fallback: regenerate
        } catch {
            // No key yet, create one
        }

        const key = randomBytes(32);
        // Persist as hex to be platform-friendly
        await fsa.writeFile(keyPath, key.toString('hex'), { mode: 0o600 });
        return key;
    } catch (error) {
        // If anything goes wrong, fall back to an in-memory key for this session
        logger.error('Failed to read/create encryption key. Falling back to volatile key: ' + (error as Error)?.message);
        return randomBytes(32);
    }
}

async function getMachineId(): Promise<string> {
    try {
        if (process.platform === 'darwin') {
            try {
                const { stdout } = await exec('ioreg -rd1 -c IOPlatformExpertDevice');
                const match = stdout.match(/"IOPlatformUUID"\s=\s"([^"]+)"/);
                if (match && match[1]) return match[1].trim();
            } catch { }
        } else if (process.platform === 'win32') {
            try {
                const { stdout } = await exec('wmic csproduct get uuid');
                const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                const uuid = lines.find(l => /[0-9A-Fa-f-]{8,}/.test(l) && !/uuid/i.test(l));
                if (uuid) return uuid;
            } catch { }
            try {
                const { stdout } = await exec('powershell -NoProfile -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID"');
                const val = stdout.trim();
                if (val) return val;
            } catch { }
        } else {
            // linux / unix
            try {
                const id = (await fsa.readFile('/etc/machine-id', 'utf8')).trim();
                if (id) return id;
            } catch { }
            try {
                const id = (await fsa.readFile('/var/lib/dbus/machine-id', 'utf8')).trim();
                if (id) return id;
            } catch { }
        }
    } catch { }
    // Fallback: hostname
    return os.hostname();
}

async function deriveKey(baseKey: Buffer): Promise<Buffer> {
    const machineId = await getMachineId();
    const key = await scrypt(baseKey, machineId, 32) as Buffer;
    return key;
}

/**
 * Encrypts a string using AES-256-GCM with a per-installation key stored in userData.
 * Returns a base64 payload with prefix 'v2:' containing IV(12) + TAG(16) + CIPHERTEXT.
 */
export const encrypt = async (text: string): Promise<string> => {
    const baseKey = await getOrCreateEncryptionKey();
    const key = await deriveKey(baseKey);
    const iv = randomBytes(12); // GCM standard IV length
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, ciphertext]);
    return 'v3:' + payload.toString('base64');
}

/**
 * Decrypts tokens previously encrypted with encrypt(). Supports v3 AES-GCM payloads only.
 */
export const decrypt = async (encryptedText: string): Promise<string | null> => {
    try {
        if (!encryptedText || !encryptedText.startsWith('v3:')) return null;
        const baseKey = await getOrCreateEncryptionKey();
        const key = await deriveKey(baseKey);
        const payload = Buffer.from(encryptedText.slice(3), 'base64');
        if (payload.length < 12 + 16) return null;
        const iv = payload.subarray(0, 12);
        const tag = payload.subarray(12, 28);
        const data = payload.subarray(28);
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([decipher.update(data), decipher.final()]);
        return plain.toString('utf8');
    } catch (error) {
        logger.error('Decryption failed: ' + (error as Error)?.message);
        return null;
    }
}

/**
 * Securely saves the refresh token for the account.
 *
 * @param token  The plain (un-encrypted) refresh token returned by Microsoft.
 * @param uuid   The UUID of the Minecraft account this token belongs to.
 * @param username The username of the Minecraft account.
 */
export const saveRefreshToken = async (token: string, uuid: string, username?: string): Promise<void> => {
    try {
        const encryptedToken = await encrypt(token);
        setConfig('auth', {
            loginType: 'microsoft',
            username: username ?? 'Unknown',
            uuid: uuid,
            refreshToken: encryptedToken,
        });
        logger.info(`Refresh token successfully saved for account ${uuid}.`);
    } catch (error) {
        logger.error('Failed to save token to keychain: ' + (error as Error)?.message);
    }
}

/**
 * Securely retrieves the refresh token from the configuration.
 *
 * @param uuid Optional UUID (ignored in single-account mode).
 * @returns The decrypted refresh token, or null if not found.
 */
export const loadRefreshToken = async (uuid?: string): Promise<string | null> => {
    try {
        const auth = getConfig('auth');
        if (!auth || !auth.refreshToken) return null;

        if (typeof auth.refreshToken === 'string' && auth.refreshToken.startsWith('v3:')) {
            const decryptedToken = await decrypt(auth.refreshToken);
            if (decryptedToken) {
                logger.debug('Refresh token (v3) loaded from configuration.');
                return decryptedToken;
            }
        }
        return null;
    } catch (error) {
        logger.error('Failed to load token from keychain: ' + (error as Error)?.message);
        return null;
    }
}

/**
 * Securely deletes the refresh token.
 */
export const deleteRefreshToken = async (uuid?: string): Promise<void> => {
    try {
        const auth = getConfig('auth');
        if (auth && auth.loginType === 'microsoft') {
            setConfig('auth', { ...auth, refreshToken: '' });
        }
        logger.info('Refresh token deleted from configuration.');
    } catch (error) {
        logger.error('Failed to delete token from keychain: ' + (error as Error)?.message);
    }
}

/** Builds the Microsoft OAuth authorize URL with CSRF state. */
const constructURL = (clientID: string, redirectURI: string, state: string): string => {
  if (!clientID || !redirectURI || !state) {
    throw new Error('Client ID, redirect URI, and state must be provided');
  }

  const baseURL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
  const params = new URLSearchParams({
    client_id: clientID,
    response_type: 'code',
    redirect_uri: redirectURI,
    scope: 'XboxLive.signin offline_access',
    response_mode: 'query',
    state,
  });
  return `${baseURL}?${params.toString()}`;
};

/** Opens Microsoft login in the system browser and starts the callback server. */
export const authenticate = async (clientID: string, redirectURI: string, webContents: WebContents): Promise<string> => {
  if (!clientID || !redirectURI) {
    throw new Error('Client ID and redirect URI must be provided');
  }
  const state = randomBytes(24).toString('base64url');
  startServer(clientID, webContents, state);
  const url = constructURL(clientID, redirectURI, state);
  shell.openExternal(url);
  return url;
};

export const refreshMicrosoftToken = async (clientID: string, redirectURI: string, refreshToken: string): Promise<AuthorizationTokenResponse> => {
    logger.debug('Attempting to refresh Microsoft token...');

    const tokenUrl = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
    const params = new URLSearchParams({
        client_id: clientID,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        redirect_uri: redirectURI,
    });

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    if (!response.ok) {
        // This likely means the refresh token is expired or invalid
        const errorBody = await response.text();
        throw new Error(`Failed to refresh token. Status: ${response.status} - ${errorBody}`);
    }

    const newTokens: AuthorizationTokenResponse = await response.json();
    logger.info('Token refreshed successfully.');

    return newTokens;
}

/** Exchanges an OAuth authorization code for Microsoft access + refresh tokens. */
export const exchangeCodeForToken = async (code: string, clientID: string, redirectURI: string): Promise<AuthorizationTokenResponse> => {
  if (!code || !clientID || !redirectURI) {
    throw new Error('Authorization code, client ID, and redirect URI must be provided');
  }

  const tokenURL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
  const params = new URLSearchParams({
    client_id: clientID,
    code,
    redirect_uri: redirectURI,
    grant_type: 'authorization_code',
  });

  const response = await fetch(tokenURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
        throw new Error(`Failed to exchange code for token: ${response.statusText}`); // Throw an error if the request fails.
    }
    const data: AuthorizationTokenResponse = await response.json(); // Parse the JSON response to get the token data.
    if (!data.access_token) { // Check if the access token is present
        throw new Error('Access token not found in the response'); // Throw an error if the access token is missing.
    }
    return data; // Return the token data containing the access token and other information.
};

/**
 * Authenticates the user with Xbox Live using the access token obtained from Microsoft authentication.
 * @param accessToken The access token obtained from the Microsoft authentication process.
 * @returns The Xbox Live authentication response containing user information and token.
 */
export const authenticateXBL = async (accessToken: string): Promise<XboxAuthResponse> => {
    if (!accessToken) throw new Error('Access token is required'); // Ensure the access token is provided before proceeding with Xbox Live authentication.

    // Authenticate the user with Xbox Live using the access token obtained from Microsoft authentication.
    const response = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json', // Set the content type to JSON for the request body because the endpoint will complain if it is not explicitly set.
            Accept: 'application/json', // Same for the Accept header, the endpoint will complain if it is not explicitly set.
        },
        body: JSON.stringify({
            Properties: {
                AuthMethod: 'RPS',
                SiteName: 'user.auth.xboxlive.com',
                RpsTicket: `d=${accessToken}`, // IMPORTANT: must prefix with `d=`
            },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType: 'JWT',
        }),
    });

    // Check if the response is successful; if not, throw an error with the status and error body.
    if (!response.ok) {
        const errorBody = await response.text(); // Read the error body for more details.
        throw new Error(`Xbox Live authentication failed: ${response.status} ${errorBody}`);
    }

    const json: XboxAuthResponse = await response.json(); // Parse the JSON response to get the Xbox Live authentication data.
    return json; // Return the Xbox Live authentication response containing user information and token.
};

/**
 * Obtains an XSTS token using the Xbox Live token.
 * @param xblToken The Xbox Live token obtained from the Xbox Live authentication process.
 * @returns The Minecraft XSTS response containing user information and token.
 */
export const getXstsToken = async (xblToken: string): Promise<XSTSResponse> => {
    if (!xblToken) throw new Error('XBL token is required to get XSTS token.'); // Ensure the XBL token is provided before proceeding with XSTS token retrieval.

    // Obtain an XSTS token using the Xbox Live token.
    const response = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json', // Set the content type to JSON for the request body because the endpoint will complain if it is not explicitly set.
            'Accept': 'application/json', // Same for the Accept header, the endpoint will complain if it is not explicitly set.
        },
        body: JSON.stringify({
            Properties: {
                SandboxId: 'RETAIL', // The sandbox ID for the XSTS token, typically "RETAIL" for production use.
                UserTokens: [xblToken], // The Xbox Live token obtained from the Xbox Live authentication process, wrapped in an array.
                // IMPORTANT: The UserTokens property must be an array, even if there is only one token.
            },
            RelyingParty: 'rp://api.minecraftservices.com/',
            TokenType: 'JWT',
        }),
    });

    // Check if the response is successful; if not, throw an error with the status and error body.
    if (!response.ok) {
        const error = await response.text(); // Read the error body for more details.
        throw new Error(`Failed to get XSTS token: ${response.status} ${error}`); // Throw an error if the request fails.
    }

    const data = (await response.json()) as XSTSResponse; // Parse the JSON response to get the XSTS token data.
    return data; // Return the XSTS response containing user information and token.
};

/**
 * Exchanges XSTS token + user hash for a Minecraft access token.
 * @param userHash - The user hash (uhs) obtained from the XSTS step.
 * @param xstsToken - The XSTS token obtained from the XSTS step.
 * @returns MinecraftAuthResponse containing the Minecraft access token.
 */
export const getMinecraftAccessToken = async (userHash: string, xstsToken: string): Promise<MinecraftAuthResponse> => {
    if (!userHash || !xstsToken) throw new Error('Both userHash and xstsToken are required.'); // Ensure both user hash and XSTS token are provided before proceeding with Minecraft access token retrieval.

    const identityToken = `XBL3.0 x=${userHash};${xstsToken}`; // Construct the identity token using the user hash and XSTS token, formatted as required by the Minecraft authentication API.

    // Exchange the XSTS token and user hash for a Minecraft access token.
    const response = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
        method: 'POST', // Use POST method for the request.
        headers: {
            'Content-Type': 'application/json', // Set the content type to JSON for the request body because the endpoint will complain if it is not explicitly set.
            'Accept': 'application/json', // Same for the Accept header, the endpoint will complain if it is not explicitly set.
        },
        body: JSON.stringify({
            identityToken,
        }),
    }
    );

    // Check if the response is successful; if not, throw an error with the status and error body.
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to obtain Minecraft access token: ${response.status} ${error}`);
    }

    const data = (await response.json()) as MinecraftAuthResponse;
    return data;
};

const MOJANG_PUBLIC_KEY_PEM = `
-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAtz7jy4jRH3psj5AbVS6W
NHjniqlr/f5JDly2M8OKGK81nPEq765tJuSILOWrC3KQRvHJIhf84+ekMGH7iGlO
4DPGDVb6hBGoMMBhCq2jkBjuJ7fVi3oOxy5EsA/IQqa69e55ugM+GJKUndLyHeNn
X6RzRzDT4tX/i68WJikwL8rR8Jq49aVJlIEFT6F+1rDQdU2qcpfT04CBYLM5gMxE
fWRl6u1PNQixz8vSOv8pA6hB2DU8Y08VvbK7X2ls+BiS3wqqj3nyVWqoxrwVKiXR
kIqIyIAedYDFSaIq5vbmnVtIonWQPeug4/0spLQoWnTUpXRZe2/+uAKN1RY9mmaB
pRFV/Osz3PDOoICGb5AZ0asLFf/qEvGJ+di6Ltt8/aaoBuVw+7fnTw2BhkhSq1S/
va6LxHZGXE9wsLj4CN8mZXHfwVD9QG0VNQTUgEGZ4ngf7+0u30p7mPt5sYy3H+Fm
sWXqFZn55pecmrgNLqtETPWMNpWc2fJu/qqnxE9o2tBGy/MqJiw3iLYxf7U+4le4
jM49AUKrO16bD1rdFwyVuNaTefObKjEMTX9gyVUF6o7oDEItp5NHxFm3CqnQRmch
HsMs+NxEnN4E9a8PDB23b4yjKOQ9VHDxBxuaZJU60GBCIOF9tslb7OAkheSJx5Xy
EYblHbogFGPRFU++NrSQRX0CAwEAAQ==
-----END PUBLIC KEY-----
`;

/**
 * Checks Minecraft ownership by verifying the entitlements using the provided Minecraft access token.
 * @param minecraftAccessToken The access token obtained from the Minecraft authentication process.
 * @returns A boolean indicating whether the user owns Minecraft or not.
 */
export const checkMinecraftOwnershipWithVerification = async (minecraftAccessToken: string) => {
    if (!minecraftAccessToken) throw new Error('Minecraft access token is required.'); // Ensure the Minecraft access token is provided before proceeding with ownership verification.

    // Check Minecraft ownership by fetching entitlements and verifying the JWT signatures.
    const response = await fetch('https://api.minecraftservices.com/entitlements/mcstore', {
        headers: {
            Authorization: `Bearer ${minecraftAccessToken}`,
            Accept: 'application/json',
        },
    }
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch entitlements: ${await response.text()}`);
    }

    const entitlements = await response.json();

    if (!entitlements.items || entitlements.items.length === 0) {
        logger.info('No game ownership found.');
        return false;
    }

    // Loop through each entitlement JWT and verify
    for (const item of entitlements.items) {
        try {
            const { payload } = await jwtVerify(Buffer.from(item.signature, 'utf8'), await importPublicKey(MOJANG_PUBLIC_KEY_PEM));
            logger.debug(`Verified JWT for entitlement: ${JSON.stringify(payload)}`);
        } catch (e) {
            logger.error(`Failed to verify JWT for entitlement '${item.name}': ` + (e as Error)?.message);
            throw new Error('JWT verification failed; the response might be tampered!');
        }
    }

    logger.info('All entitlements verified successfully. Ownership confirmed.');
    return true;
};

/**
 * Imports the public key from PEM format to a CryptoKey object.
 * @param pem The PEM formatted public key.
 * @returns A Promise that resolves to a CryptoKey object.
 */
async function importPublicKey(pem: string) {
    const keyData = pem
        .replace(/-----BEGIN PUBLIC KEY-----/, '')
        .replace(/-----END PUBLIC KEY-----/, '')
        .replace(/\s+/g, '');
    const binaryDer = Buffer.from(keyData, 'base64');
    return crypto.subtle.importKey(
        'spki',
        binaryDer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        true,
        ['verify']
    );
}

/**
 * Gets the Minecraft profile (UUID, username, skins, capes) using the Minecraft access token.
 * @param minecraftAccessToken The valid Minecraft access token.
 * @returns The Minecraft profile or throws an error if profile is not found or request fails.
 */
export const getMinecraftProfile = async (minecraftAccessToken: string): Promise<MinecraftProfile> => {
    const response = await fetch('https://api.minecraftservices.com/minecraft/profile', {
        headers: {
            Authorization: `Bearer ${minecraftAccessToken}`,
            Accept: 'application/json',
        },
    }
    );

    if (response.status === 404) {
        throw new Error("Minecraft profile not found. The account might not own Minecraft, or hasn't logged in to the new launcher at least once.");
    }

    if (!response.ok) {
        throw new Error(`Failed to get Minecraft profile: ${await response.text()}`);
    }

    const profile: MinecraftProfile = await response.json();
    logger.info(`Successfully fetched profile: ${profile.name} (${profile.id})`);
    return profile;
};



export const logOut = async () => {
    try {
        const account = getConfig('auth');
        if (!account) {
            logger.info('Logout not needed: No account stored.');
            return;
        }

        logger.info(`Logging out user: ${account.username} (type: ${account.loginType})`);

        // Clear the account using store.delete
        deleteConfig('auth');

        logger.info('Logout successful. Account removed.');
    } catch (error) {
        logger.error('An error occurred during the logout process: ' + (error as Error)?.message);
    }
};
