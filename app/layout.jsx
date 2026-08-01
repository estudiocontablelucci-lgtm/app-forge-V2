import "./globals.css";

export const metadata = {
  title: "FORGE — Tracking de entrenamiento",
  description: "Registro de entrenamiento de fuerza: programas, series, e1RM y progreso.",
  icons: { icon: "/favicon.svg" },
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
      <body>{children}</body>
    </html>
  );
}
