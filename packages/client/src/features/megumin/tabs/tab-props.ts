import type {
  MeguminCustomEngine,
  MeguminEngineMeta,
  MeguminResolvedProfile,
  MeguminSettings,
} from "@marinara-engine/shared";
import type { MeguminEditor } from "../use-megumin-settings";

/** The profile's engine: a stock one from the catalog or a Dev Mode / imported one from the settings. */
export type MeguminActiveEngine = (MeguminEngineMeta & { isV7?: boolean; cot?: string }) | MeguminCustomEngine;

export interface MeguminTabProps {
  editor: MeguminEditor;
  profile: MeguminResolvedProfile;
  settings: MeguminSettings;
  engine: MeguminActiveEngine | null;
}
