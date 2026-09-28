/** Live server-list ping result shared by main (core/server) and the renderer. */

/** One run of MOTD text with a single style. Colours are #RRGGBB. */
export interface MotdSegment {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
}

export type MotdLine = MotdSegment[];

export interface ServerStatus {
  /** False until a server address is set in client-config.json. */
  configured: boolean;
  online: boolean;
  players?: {
    online: number;
    max: number;
    /** Names from the server's player sample (not always the full list). */
    sample: string[];
  };
  motd?: MotdLine[];
  /** Version name the server reports, e.g. "NeoForge 1.21.1". */
  version?: string;
  latencyMs?: number;
  /** Server icon as a data:image/png URI. */
  favicon?: string;
}
