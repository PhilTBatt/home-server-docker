import type { ProjectorLog, ProjectorSettings } from "./projector.js";
import { createProjector, type Projector } from "./projector.js";
import { workerLink } from "./link.js";
import { createPairingStore } from "./store.js";
import type { EventSink } from "../events/feed.js";

export function projectorFor(settings: ProjectorSettings, log: ProjectorLog, events?: EventSink): Projector {
  return createProjector({ settings, store: createPairingStore(), open: workerLink, log, events });
}
