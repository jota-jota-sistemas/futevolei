import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para uso no navegador (frontend).
 *
 * Usa a chave *publishable* (antiga "anon"), que é segura para expor no cliente
 * desde que as políticas de Row Level Security (RLS) estejam configuradas no banco.
 *
 * As variáveis vêm de .env (local) e das Environment Variables da Vercel (produção).
 * O prefixo PUBLIC_ é o que o Astro expõe ao bundle do cliente.
 */
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Variáveis do Supabase ausentes. Defina PUBLIC_SUPABASE_URL e " +
      "PUBLIC_SUPABASE_ANON_KEY no .env (veja .env.example).",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
