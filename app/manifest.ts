import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Finance",
    short_name: "Finance",
    description: "Track accounts, manage 50/20/30 envelope budgets, and monitor savings goals.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#243075",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
