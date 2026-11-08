/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** URL base do projeto Supabase (ex.: https://xxxx.supabase.co) */
  readonly PUBLIC_SUPABASE_URL: string;
  /** Chave publishable (anon) do Supabase — segura para o navegador */
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  /** Chave secret (service_role) do Supabase — SOMENTE no servidor */
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
