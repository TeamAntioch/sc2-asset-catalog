// `sc2-music-finder login` and `logout`: the kit's, naming this package in what they print.

import { login as kitLogin, type LoginOptions as KitLoginOptions } from "@team-antioch/sc2-finder-kit/login.js";

export { logout, type KeyCheck, type KeyCheckResult, typesafeKeyCheck } from "@team-antioch/sc2-finder-kit/login.js";

export type LoginOptions = Omit<KitLoginOptions, "command">;

/** Asks for the key, checks it and saves it. Returns the exit code: 0 saved, 1 not, 130 cancelled. */
export const login = (options: LoginOptions = {}): Promise<number> => kitLogin({ ...options, command: "@team-antioch/sc2-music-finder" });
