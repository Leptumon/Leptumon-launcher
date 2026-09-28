/**
 * Minecraft Server List Ping (1.7+ protocol): handshake → status request →
 * JSON response, then a ping/pong for latency. Feeds the live player count
 * and MOTD on the home screen.
 */
import dns from 'dns/promises';
import net from 'net';

import type { ServerStatus } from '../../types/api/serverStatus';
import { parseMotd, stripFormatting } from './motd';

const DEFAULT_PORT = 25565;
/** Protocol number sent in the handshake. Servers answer status for any version; 767 = 1.21.1. */
const HANDSHAKE_PROTOCOL = 767;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_FAVICON_CHARS = 64 * 1024;
const MAX_SAMPLE_NAMES = 12;

export interface ServerEndpoint {
  host: string;
  port: number;
}

/** Parses "host", "host:port", or "[ipv6]:port". Returns null for invalid input. */
export const parseServerAddress = (address: string): { host: string; port?: number } | null => {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const bracketed = trimmed.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketed) {
    return { host: bracketed[1], port: bracketed[2] ? Number(bracketed[2]) : undefined };
  }

  const parts = trimmed.split(':');
  if (parts.length > 2) return { host: trimmed }; // bare IPv6 literal

  const [host, portText] = parts;
  if (!host) return null;
  if (portText === undefined) return { host };

  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
};

/** Resolves `_minecraft._tcp` SRV records like the game client does when no port is given. */
export const resolveServerEndpoint = async (address: string): Promise<ServerEndpoint> => {
  const parsed = parseServerAddress(address);
  if (!parsed) throw new Error(`Invalid server address: ${address}`);
  if (parsed.port) return { host: parsed.host, port: parsed.port };

  if (net.isIP(parsed.host) === 0) {
    try {
      const [record] = await dns.resolveSrv(`_minecraft._tcp.${parsed.host}`);
      if (record) return { host: record.name, port: record.port };
    } catch {
      // No SRV record, so fall through to the default port.
    }
  }
  return { host: parsed.host, port: DEFAULT_PORT };
};

const writeVarInt = (value: number): Buffer => {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return Buffer.from(bytes);
};

/** Returns null when the buffer ends mid-VarInt (wait for more data). */
const readVarInt = (buffer: Buffer, offset: number): { value: number; size: number } | null => {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buffer.length) return null;
    const byte = buffer[offset + i];
    value |= (byte & 0x7f) << (7 * i);
    if ((byte & 0x80) === 0) return { value, size: i + 1 };
  }
  throw new Error('VarInt too long');
};

const packet = (id: number, payload: Buffer): Buffer => {
  const body = Buffer.concat([writeVarInt(id), payload]);
  return Buffer.concat([writeVarInt(body.length), body]);
};

const buildStatus = (json: Record<string, unknown>, latencyMs?: number): ServerStatus => {
  const players = (json.players ?? {}) as { online?: unknown; max?: unknown; sample?: unknown };
  const version = (json.version ?? {}) as { name?: unknown };
  const favicon = typeof json.favicon === 'string'
    && json.favicon.startsWith('data:image/png;base64,')
    && json.favicon.length <= MAX_FAVICON_CHARS
    ? json.favicon
    : undefined;

  const sample = Array.isArray(players.sample)
    ? players.sample
      .map((entry: unknown) => {
        const name = (entry as { name?: unknown } | null)?.name;
        return typeof name === 'string' ? stripFormatting(name).trim() : '';
      })
      .filter(Boolean)
      .slice(0, MAX_SAMPLE_NAMES)
    : [];

  return {
    configured: true,
    online: true,
    players: typeof players.online === 'number' && typeof players.max === 'number'
      ? { online: players.online, max: players.max, sample }
      : undefined,
    motd: parseMotd(json.description),
    version: typeof version.name === 'string' ? stripFormatting(version.name).slice(0, 64) : undefined,
    latencyMs,
    favicon,
  };
};

const pingEndpoint = (virtualHost: string, endpoint: ServerEndpoint, timeoutMs: number): Promise<ServerStatus> =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: endpoint.host, port: endpoint.port });
    let buffer = Buffer.alloc(0);
    let response: Record<string, unknown> | null = null;
    let pingSentAt = 0;
    let settled = false;

    const finish = (error: Error | null, status?: ServerStatus) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (status) resolve(status);
      else reject(error ?? new Error('Server ping failed'));
    };

    // Some servers never answer the latency ping; the status alone is enough.
    const finishWithWhatWeHave = (error: Error) => {
      if (response) finish(null, buildStatus(response));
      else finish(error);
    };

    socket.setTimeout(timeoutMs, () => finishWithWhatWeHave(new Error('Server ping timed out')));
    socket.once('error', finishWithWhatWeHave);
    socket.once('connect', () => {
      // The handshake carries the hostname the player typed (not the SRV
      // target) so proxies with per-domain routing answer correctly.
      const host = Buffer.from(virtualHost, 'utf8');
      const port = Buffer.alloc(2);
      port.writeUInt16BE(endpoint.port);
      socket.write(packet(0x00, Buffer.concat([writeVarInt(HANDSHAKE_PROTOCOL), writeVarInt(host.length), host, port, writeVarInt(1)])));
      socket.write(packet(0x00, Buffer.alloc(0)));
    });

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_RESPONSE_BYTES) {
        finish(new Error('Server status response too large'));
        return;
      }

      try {
        for (;;) {
          const length = readVarInt(buffer, 0);
          if (!length || buffer.length < length.size + length.value) return;

          const body = buffer.subarray(length.size, length.size + length.value);
          buffer = buffer.subarray(length.size + length.value);

          const id = readVarInt(body, 0);
          if (!id) throw new Error('Malformed packet');

          if (id.value === 0x00 && !response) {
            const jsonLength = readVarInt(body, id.size);
            if (!jsonLength) throw new Error('Malformed status response');
            const start = id.size + jsonLength.size;
            response = JSON.parse(body.subarray(start, start + jsonLength.value).toString('utf8')) as Record<string, unknown>;

            pingSentAt = Date.now();
            const payload = Buffer.alloc(8);
            payload.writeBigInt64BE(BigInt(pingSentAt));
            socket.write(packet(0x01, payload));
          } else if (id.value === 0x01 && response) {
            finish(null, buildStatus(response, Date.now() - pingSentAt));
            return;
          }
        }
      } catch (error) {
        finish(error as Error);
      }
    });
  });

/** Pings the server; any failure (DNS, refused, timeout, bad data) reports offline. */
export const queryServerStatus = async (address: string, timeoutMs = 5000): Promise<ServerStatus> => {
  const parsed = parseServerAddress(address);
  if (!parsed) return { configured: true, online: false };

  try {
    const endpoint = await resolveServerEndpoint(address);
    return await pingEndpoint(parsed.host, endpoint, timeoutMs);
  } catch {
    return { configured: true, online: false };
  }
};
