import "./globals.css";
import Providers from "@/components/Providers";
import RegistrarSW from "@/components/RegistrarSW";

export const metadata = {
  title: "FORGE — Tracking de entrenamiento",
  description: "Registro de entrenamiento de fuerza: programas, series, e1RM y progreso.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192" }],
    // iOS ignora el manifest para el icono de la pantalla de inicio.
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "FORGE", statusBarStyle: "default" },
};

// La app se usa desde el celular en el gimnasio: sin zoom accidental al tocar
// un input, y respetando el notch.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#F2F2F7",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
        <RegistrarSW />
      </body>
    </html>
  );
}
