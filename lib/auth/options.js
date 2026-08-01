/**
 * Configuracion de NextAuth. Se exporta aparte del route handler para que las
 * server actions y los route handlers puedan pedir la sesion con
 * `getServerSession(authOptions)`.
 *
 * Dos formas de entrar, la misma cuenta: el email es la identidad. Alguien que
 * se registro por magic link y despues entra con Google cae en el mismo
 * `users.id` — lo garantiza el UNIQUE de email y `allowDangerousEmailAccountLinking`.
 */
import { GoogleProvider, EmailProvider } from "./nextauth-interop.js";
import { ForgeAdapter } from "./adapter.js";
import { sendMagicLink } from "./email.js";

const providers = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Vincula el login de Google al usuario que ya existe con ese email.
      // Es seguro aca porque el unico otro proveedor es el magic link, que
      // tambien prueba posesion del email: no hay forma de reclamar una cuenta
      // ajena sin controlar la casilla.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.RESEND_API_KEY) {
  providers.push(
    EmailProvider({
      from: process.env.EMAIL_FROM,
      maxAge: 15 * 60, // el link vive 15 minutos
      sendVerificationRequest: sendMagicLink,
    }),
  );
}

export const authOptions = {
  adapter: ForgeAdapter(),
  providers,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", verifyRequest: "/login?check=1", error: "/login" },
  callbacks: {
    // El JWT se arma una vez al entrar; despues viaja en la cookie. Se guarda el
    // id y el rol del dominio para no ir a la base en cada request.
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role || "athlete";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid;
        session.user.role = token.role;
      }
      return session;
    },
  },
};

/** true si hay al menos un proveedor configurado; la UI lo usa para avisar. */
export const authConfigured = providers.length > 0;
