import type { MetadataRoute } from "next";

import { LOGISTICS_PWA_MANIFEST } from "@/features/pwa/pwa-model";

export default function manifest(): MetadataRoute.Manifest {
  return {
    ...LOGISTICS_PWA_MANIFEST,
    icons: LOGISTICS_PWA_MANIFEST.icons.map((icon) => ({ ...icon })),
  };
}
