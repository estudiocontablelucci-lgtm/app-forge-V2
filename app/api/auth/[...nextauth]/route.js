import { NextAuth } from "@/lib/auth/nextauth-interop";
import { authOptions } from "@/lib/auth/options";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
