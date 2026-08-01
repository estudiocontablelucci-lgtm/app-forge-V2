import LoginForm from "@/components/LoginForm";
import "./login.css";

// Que proveedores estan realmente configurados se decide en el servidor: la UI
// no puede ver las env vars y no tiene sentido ofrecer un boton que va a fallar.
export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  return (
    <main className="login">
      <LoginForm
        hasGoogle={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
        hasEmail={Boolean(process.env.RESEND_API_KEY)}
        checkMail={params?.check === "1"}
      />
    </main>
  );
}
