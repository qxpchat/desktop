/// <reference types="svelte" />
/// <reference types="vite/client" />

/** Build-time constant: the app version from package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Overrides the default chatmail relay for new instant accounts.
   *  Unset in production builds (falls back to `qxp.chat`); set by the
   *  E2E suite to register on a shared test relay instead. */
  readonly VITE_DEFAULT_RELAY?: string;
  /** Giphy API key used by the GIF picker. Falls back to Giphy's public
   *  beta key when unset — fine for development, heavily rate-limited in
   *  production. */
  readonly VITE_GIPHY_API_KEY?: string;
}
