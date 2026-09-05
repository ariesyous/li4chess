import { PlayerColor } from "@li4chess/engine";

export const PLAYER_COLOR_HEX: Readonly<Record<PlayerColor, string>> = {
  [PlayerColor.Red]: "#d64545",
  [PlayerColor.Blue]: "#3b6fd6",
  [PlayerColor.Yellow]: "#d6b83b",
  [PlayerColor.Green]: "#3ba85e",
};

export const PLAYER_COLOR_NAME: Readonly<Record<PlayerColor, string>> = {
  [PlayerColor.Red]: "Red",
  [PlayerColor.Blue]: "Blue",
  [PlayerColor.Yellow]: "Yellow",
  [PlayerColor.Green]: "Green",
};
