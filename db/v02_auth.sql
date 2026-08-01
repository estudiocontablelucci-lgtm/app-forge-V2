-- ============================================================
-- FORGE v2 — Migracion v02: soporte de NextAuth
--
-- La identidad sigue viviendo en `users` (v01). Esta migracion NO crea una
-- tabla de usuarios paralela: agrega lo que NextAuth necesita alrededor.
--
--   auth_accounts             -> vinculo con proveedores OAuth (Google)
--   auth_verification_tokens  -> tokens de un solo uso del magic link
--
-- No hay tabla de sesiones: la estrategia es JWT, la sesion vive en la cookie
-- firmada y no se persiste. Si algun dia hace falta revocar sesiones del lado
-- del servidor, eso es una v03 con su tabla.
-- ============================================================

-- NextAuth marca cuando el email quedo verificado (magic link o el email
-- verificado que devuelve Google) y guarda el avatar del proveedor.
ALTER TABLE users ADD COLUMN email_verified TEXT;

ALTER TABLE users ADD COLUMN image TEXT;

CREATE TABLE auth_accounts (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                TEXT NOT NULL,          -- 'oauth' | 'email'
  provider            TEXT NOT NULL,          -- 'google'
  provider_account_id TEXT NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          INTEGER,
  token_type          TEXT,
  scope               TEXT,
  id_token            TEXT,
  session_state       TEXT,
  -- La misma cuenta de Google no puede quedar vinculada a dos usuarios.
  UNIQUE (provider, provider_account_id)
);

CREATE INDEX idx_auth_accounts_user ON auth_accounts (user_id);

-- Token de un solo uso del magic link. La PK compuesta permite que el mismo
-- email pida varios links sin que el ultimo invalide a los anteriores.
CREATE TABLE auth_verification_tokens (
  identifier TEXT NOT NULL,
  token      TEXT NOT NULL,
  expires    TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);
