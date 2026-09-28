/**
 * Local OAuth callback server on localhost:59016.
 * Receives the Microsoft redirect, exchanges the code, and completes Xbox/Minecraft auth.
 */
import path from 'path';

import { WebContents } from 'electron';
import express from 'express';

import { t } from '../../../i18n';
import { getAvatar } from '../../../main/avatarCache';
import { logger } from '../../utils/logger';

import { authenticateXBL, checkMinecraftOwnershipWithVerification, exchangeCodeForToken, getMinecraftAccessToken, getMinecraftProfile, getXstsToken, saveRefreshToken } from './authenticate';

const app = express();
const port = 59016;
const AVATAR_WARMUP_MS = 3000;

let appClientID: string | null = null;
let authWebContents: WebContents | null = null;
let expectedState: string | null = null;

app.get('/auth/callback', async (req, res) => {
    if (!appClientID) {
        return res.status(500).send('Client ID not set. Please start the server with a valid client ID.');
    }

    try {
        const authorizationCode = req.query.code as string;
        const receivedState = typeof req.query.state === 'string' ? req.query.state : '';

        if (!authorizationCode) {
            return res.status(400).send(t('auth_missing_code'));
        }

        if (!expectedState || receivedState !== expectedState) {
            logger.warn('Rejected OAuth callback with invalid state.');
            return res.status(400).send(t('auth_invalid_state'));
        }

        expectedState = null;

        const tokenResult = await exchangeCodeForToken(authorizationCode, appClientID, `http://localhost:${port}/auth/callback`);
        const accessToken = tokenResult.access_token;
        const refreshToken = tokenResult.refresh_token;

        const xblResult = await authenticateXBL(accessToken);
        const xblToken = xblResult.Token;

        const xstsResult = await getXstsToken(xblToken);
        const userHash = xstsResult.DisplayClaims.xui[0]?.uhs;
        const xstsToken = xstsResult.Token;

        const mcTokenResult = await getMinecraftAccessToken(userHash, xstsToken);
        const minecraftAccessToken = mcTokenResult.access_token;

        const ownsMinecraft = await checkMinecraftOwnershipWithVerification(minecraftAccessToken);

        const minecraftProfile = await getMinecraftProfile(minecraftAccessToken);

        if (ownsMinecraft) {
            // Save the account (including encrypted refresh token)
            await saveRefreshToken(refreshToken, minecraftProfile.id, minecraftProfile.name);

            // Fetch the head before switching screens so it's there on arrival; don't hold sign-in up for long.
            await Promise.race([getAvatar(), new Promise((resolve) => setTimeout(resolve, AVATAR_WARMUP_MS))]);

            if (authWebContents) {
                authWebContents.send('auth-success');
            }
            return res.status(200).send(`
                <!DOCTYPE html>
                    <html>
                        <head>
                            <title>${t('auth_successful')}</title>
                            <style>
                                body {
                                    background-color: #121212;
                                    background-image: 
                                        radial-gradient(at 80% 20%, hsla(260, 55%, 25%, 0.4) 0px, transparent 50%),
                                        radial-gradient(at 20% 90%, hsla(220, 60%, 20%, 0.3) 0px, transparent 50%),
                                        radial-gradient(at 50% 50%, hsla(300, 50%, 15%, 0.2) 0px, transparent 50%);
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                    color: #ffffff;
                                    display: flex;
                                    justify-content: center;
                                    align-items: center;
                                    height: 100vh;
                                    margin: 0;
                                    overflow: hidden;
                                }

                                .container {
                                    background-color: rgba(30, 30, 30, 0.6);
                                    border-radius: 24px;
                                    padding: 40px 50px;
                                    text-align: center;
                                    border: 1px solid rgba(255, 255, 255, 0.1);
                                    backdrop-filter: blur(12px);
                                    -webkit-backdrop-filter: blur(12px);
                                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                                }

                                .icon { 
                                    font-size: 48px; 
                                    margin-bottom: 20px; 
                                    animation: fadeIn 1s ease-in-out;
                                }

                                h1 { 
                                    font-size: 24px; 
                                    margin-bottom: 10px; 
                                    font-weight: 600;
                                    animation: fadeIn 1.5s ease-in-out;
                                }

                                p { 
                                    font-size: 16px; 
                                    color: #b0b0b0;
                                    animation: fadeIn 2s ease-in-out;
                                }

                                @keyframes fadeIn {
                                    from { opacity: 0; transform: translateY(10px); }
                                    to { opacity: 1; transform: translateY(0); }
                                }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="icon">✅</div>
                                <h1>${t('auth_successful')}</h1>
                                <p>${t('auth_successful_desc')}</p>
                            </div>
                        </body>
                    </html>`);
        } else {
            return res.status(403).send(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>${t('auth_failed')}</title>
                    <style>
                        body {
                            background-color: #121212;
                            background-image: 
                                radial-gradient(at 80% 20%, hsla(260, 55%, 25%, 0.4) 0px, transparent 50%),
                                radial-gradient(at 20% 90%, hsla(220, 60%, 20%, 0.3) 0px, transparent 50%),
                                radial-gradient(at 50% 50%, hsla(300, 50%, 15%, 0.2) 0px, transparent 50%);
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            color: #ffffff;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            overflow: hidden;
                        }

                        .container {
                            background-color: rgba(30, 30, 30, 0.6);
                            border-radius: 24px;
                            padding: 40px 50px;
                            text-align: center;
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            backdrop-filter: blur(12px);
                            -webkit-backdrop-filter: blur(12px);
                            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                        }

                        .icon { 
                            font-size: 48px; 
                            margin-bottom: 20px; 
                            animation: fadeIn 1s ease-in-out;
                        }

                        h1 { 
                            font-size: 24px; 
                            margin-bottom: 10px; 
                            font-weight: 600;
                            animation: fadeIn 1.5s ease-in-out;
                        }

                        p { 
                            font-size: 16px; 
                            color: #b0b0b0;
                            animation: fadeIn 2s ease-in-out;
                        }

                        @keyframes fadeIn {
                            from { opacity: 0; transform: translateY(10px); }
                            to { opacity: 1; transform: translateY(0); }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="icon">❌</div>
                        <h1>${t('auth_failed')} (ERR_NO_GAME_OWNERSHIP)</h1>
                        <p>${t('auth_failed_desc')}</p>
                    </div>
                </body>
            </html>
        `);
        }

    } catch (error) {
        logger.error('Auth flow error: ' + (error as Error).message);
        return res.status(500).send(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>${t('auth_failed')}</title>
                    <style>
                        body {
                            background-color: #121212;
                            background-image: 
                                radial-gradient(at 80% 20%, hsla(260, 55%, 25%, 0.4) 0px, transparent 50%),
                                radial-gradient(at 20% 90%, hsla(220, 60%, 20%, 0.3) 0px, transparent 50%),
                                radial-gradient(at 50% 50%, hsla(300, 50%, 15%, 0.2) 0px, transparent 50%);
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            color: #ffffff;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            overflow: hidden;
                        }

                        .container {
                            background-color: rgba(30, 30, 30, 0.6);
                            border-radius: 24px;
                            padding: 40px 50px;
                            text-align: center;
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            backdrop-filter: blur(12px);
                            -webkit-backdrop-filter: blur(12px);
                            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                        }

                        .icon { 
                            font-size: 48px; 
                            margin-bottom: 20px; 
                            animation: fadeIn 1s ease-in-out;
                        }

                        h1 { 
                            font-size: 24px; 
                            margin-bottom: 10px; 
                            font-weight: 600;
                            animation: fadeIn 1.5s ease-in-out;
                        }

                        p { 
                            font-size: 16px; 
                            color: #b0b0b0;
                            animation: fadeIn 2s ease-in-out;
                        }

                        @keyframes fadeIn {
                            from { opacity: 0; transform: translateY(10px); }
                            to { opacity: 1; transform: translateY(0); }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="icon">❌</div>
                        <h1>${t('auth_failed')}</h1>
                        <p>${t('auth_failed_desc')}</p>
                    </div>
                </body>
            </html>
        `);
    }
});


export const startServer = (clientID: string, webContents: WebContents, state: string) => {
    appClientID = clientID;
    authWebContents = webContents;
    expectedState = state;
    if (!app.get('server-started')) {
        app.listen(port, () => {
            logger.info(`Spinning up a temporary HTTP server for callbacks at http://localhost:${port}`);
            app.set('server-started', true);
        });
    }
};
