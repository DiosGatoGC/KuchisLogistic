export const LOGISTICS_PWA_MANIFEST = {
  id: "/home",
  name: "KUCHI'S Logistics",
  short_name: "KUCHI'S",
  description: "Sistema interno de operación de KUCHI'S.",
  lang: "es",
  start_url: "/home",
  scope: "/",
  display: "standalone",
  orientation: "landscape",
  background_color: "#faf7f1",
  theme_color: "#f66b0e",
  icons: [
    {
      src: "/icons/kuchis-logistics-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/kuchis-logistics-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/kuchis-logistics-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
} as const;

export function networkNotice(online: boolean) {
  return online
    ? { visible: false, label: "" }
    : { visible: true, label: "Sin conexión. La sincronización está pendiente." };
}
