import { choreJobFor, createChores, type ChoreLog, type Chores } from "./chores.js";

export const choresDir = "/chores";

export function choresFor(sessions: boolean, log: ChoreLog = {}, dir = choresDir): Chores {
  return createChores({ dir, jobs: choreJobFor(sessions), log });
}
