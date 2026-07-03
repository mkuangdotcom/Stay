import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const archivo = localFont({
  variable: "--font-ui",
  src: [{ path: "./fonts/archivo-latin.woff2", weight: "400 700" }],
});

const plexMono = localFont({
  variable: "--font-mono",
  src: [
    { path: "./fonts/plex-mono-400.woff2", weight: "400" },
    { path: "./fonts/plex-mono-500.woff2", weight: "500" },
    { path: "./fonts/plex-mono-600.woff2", weight: "600" },
  ],
});

export const metadata: Metadata = {
  title: "Stay — KL rent radar",
  description: "Personal map for hunting rentals along the KL rail network",
};

export const viewport: Viewport = {
  themeColor: "#15171c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
