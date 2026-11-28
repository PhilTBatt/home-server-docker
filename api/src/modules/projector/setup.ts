import type { ProjectorLog, ProjectorSettings } from "./projector.js";
import { createProjector, type Projector } from "./projector.js";
import { workerLink } from "./link.js";
import { createPairingStore } from "./store.js";

export function projectorFor(settings: ProjectorSettings, log: ProjectorLog): Projector {
  return createProjector({ settings, store: createPairingStore(), open: workerLink, log });
}
