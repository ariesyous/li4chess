import { PlayerColor } from "@li4chess/engine";

export const PLAYER_COLOR_HEX: Readonly<Record<PlayerColor, string>> = {
  [PlayerColor.Red]: "#e66b64",
  [PlayerColor.Blue]: "#6da8e3",
  [PlayerColor.Yellow]: "#f4cf52",
  [PlayerColor.Green]: "#72bb83",
};

export const PLAYER_COLOR_NAME: Readonly<Record<PlayerColor, string>> = {
  [PlayerColor.Red]: "Red",
  [PlayerColor.Blue]: "Blue",
  [PlayerColor.Yellow]: "Yellow",
  [PlayerColor.Green]: "Green",
};
