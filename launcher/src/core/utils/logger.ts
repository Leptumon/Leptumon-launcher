/**
 * File-based launcher log writer (launcher-logs/ under app data).
 * Main process only. The renderer logs via IPC.
 */
import fs from 'fs';
import fsa from 'fs/promises';
import path from 'path';
import { getLauncherDataPath } from '../launch/pathManager';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private logStream: fs.WriteStream | null = null;
  private logDir: string = '';
  private levelOrder: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
  private minLevel: LogLevel = 'info';

  async init(minLevel: LogLevel = 'info') {
    this.minLevel = minLevel;
    const dataPath = getLauncherDataPath();
    this.logDir = path.join(dataPath.base, 'launcher-logs');
    await fsa.mkdir(this.logDir, { recursive: true });
    const fileName = `launcher-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    const fullPath = path.join(this.logDir, fileName);
    this.logStream = fs.createWriteStream(fullPath, { flags: 'a' });
    this.info(`Logger initialized at ${fullPath}`);
  }

  private write(level: LogLevel, message: string) {
    if (this.levelOrder[level] < this.levelOrder[this.minLevel]) return;
    const entry = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}\n`;
    this.logStream?.write(entry);
  }

  debug(msg: string) { this.write('debug', msg); }
  info(msg: string) { this.write('info', msg); }
  warn(msg: string) { this.write('warn', msg); }
  error(msg: string) { this.write('error', msg); }
}

export const logger = new Logger();


