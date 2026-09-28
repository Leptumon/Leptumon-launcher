/** RAM range this machine can give the game, in MB (main/settings.ts getRamInfo). */
export type RamInfo = {
  min: number;
  max: number;
  /** The launcher's suggestion for this machine, within min..max. */
  recommended: number;
};
