/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Overrides the default chatmail relay for new instant accounts.
   *  Unset in production builds (falls back to `qxp.chat`); set by the
   *  E2E suite to register on a shared test relay instead. */
  readonly VITE_DEFAULT_RELAY?: string;
}
