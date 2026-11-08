import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para uso EXCLUSIVO no servidor.
 *
 * Usa a chave *secret* (antiga "service_role"), que ignora as políticas de RLS
 * e tem acesso privilegiado ao banco. NUNCA importe este arquivo em código que
 * roda no navegador — a chave secreta não pode ser exposta ao cliente.
 *
 * O nome do arquivo (.server) sinaliza a intenção; na Fase 2a, quando o Astro
 * passar para output "server", este cliente será usado apenas em rotas/endpoints
 * de servidor.
 */
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseSecretKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error(
    "Variáveis do Supabase (servidor) ausentes. Defina PUBLIC_SUPABASE_URL e " +
      "SUPABASE_SERVICE_ROLE_KEY no .env (veja .env.example).",
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
