import AceptarInvitacion from "@/components/AceptarInvitacion";
import "../../login/login.css";

/**
 * Pantalla a la que llega el link del mail.
 *
 * No resuelve nada en el servidor a proposito: si la persona todavia no inicio
 * sesion hay que mandarla a /login y volver, asi que la logica vive del lado
 * del cliente, que es el que sabe si hay sesion.
 */
export default async function InvitacionPage({ params }) {
  const { token } = await params;
  return (
    <main className="login">
      <AceptarInvitacion token={token} />
    </main>
  );
}
