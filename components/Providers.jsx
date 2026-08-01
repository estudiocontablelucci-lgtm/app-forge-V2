"use client";

import { SessionProvider } from "next-auth/react";

/**
 * SessionProvider tiene que ser client, y el layout es server. Este wrapper
 * existe solo para cruzar ese limite.
 *
 * `refetchOnWindowFocus` apagado a proposito: la app vive abierta en el celular
 * durante toda la sesion de entrenamiento y no tiene sentido pegarle a la red
 * cada vez que se vuelve a la pantalla entre serie y serie.
 */
export default function Providers({ children }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      {children}
    </SessionProvider>
  );
}
