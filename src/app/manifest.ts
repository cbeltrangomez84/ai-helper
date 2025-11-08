import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Print Task Creator",
    short_name: "PrintTasks",
    description: "Capture spoken requirements and create formatted ClickUp tasks on the go.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#312e81",
    icons: [
      {
        src: "/icons/task-creator.png",
        type: "image/png",
        sizes: "72x72",
      },
      {
        src: "/icons/task-creator-192.png",
        type: "image/png",
        sizes: "192x192",
      },
      {
        src: "/icons/task-creator-512.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],
    scope: "/",
    id: "/",
    lang: "en-US",
    orientation: "portrait",
    categories: ["productivity"],
  }
}

