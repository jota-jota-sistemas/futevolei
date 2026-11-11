import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  acessoGerenciar,
  caminhoSeguro,
  normalizarEmail,
  podeGerenciar,
  validarEmail,
} from "../src/domain/auth/validation";
import { ehViolacaoUnicidade, mapearErroAuth, mensagemAuth } from "../src/domain/auth/mensagens";

const sessao = { userId: "u1", email: "a@b.com" };

describe("e-mail", () => {
  it("normaliza para minúsculas e sem espaços nas pontas", () => {
    expect(normalizarEmail("  Ana@Exemplo.COM ")).toBe("ana@exemplo.com");
  });

  it("aceita formas válidas e rejeita inválidas", () => {
    expect(validarEmail("ana@exemplo.com")).toBe("ana@exemplo.com");
    for (const ruim of ["", "   ", "ana", "ana@", "@x.com", "a b@x.com", "ana@x", "a@@x.com", "a@x..com"]) {
      expect(validarEmail(ruim), ruim).toBeNull();
    }
  });

  it("rejeita e-mail acima de 254 caracteres", () => {
    expect(validarEmail("a".repeat(250) + "@x.com")).toBeNull();
  });

  it("a normalização é idempotente", () => {
    fc.assert(
      fc.property(fc.string(), (s) => normalizarEmail(normalizarEmail(s)) === normalizarEmail(s))
    );
  });
});

describe("acesso ao gerenciamento", () => {
  it("visitante nunca gerencia, mesmo com admin=true", () => {
    expect(acessoGerenciar(null, true)).toBe("visitante");
    expect(podeGerenciar(null, true)).toBe(false);
  });
  it("logado sem permissão e admin", () => {
    expect(acessoGerenciar(sessao, false)).toBe("sem_permissao");
    expect(acessoGerenciar(sessao, true)).toBe("admin");
    expect(podeGerenciar(sessao, true)).toBe(true);
  });
});

describe("caminhoSeguro (open redirect)", () => {
  it("aceita caminhos internos", () => {
    expect(caminhoSeguro("/gerenciar_jogadores")).toBe("/gerenciar_jogadores");
    expect(caminhoSeguro("/jogadores/perfil?id=1#x")).toBe("/jogadores/perfil?id=1#x");
  });

  it("rejeita destinos externos e truques", () => {
    for (const ruim of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "evil.com",
      "/%2Fevil.com",
      "/%5Cevil.com",
      "/\nx",
      "",
      "/%E0%A4%A",
    ]) {
      expect(caminhoSeguro(ruim), ruim).toBe("/");
    }
    expect(caminhoSeguro(null)).toBe("/");
    expect(caminhoSeguro(undefined, "/conta")).toBe("/conta");
  });

  it("propriedade: o resultado é sempre um caminho interno", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = caminhoSeguro(s);
        return r.startsWith("/") && !r.startsWith("//") && !r.includes("\\");
      })
    );
  });
});

describe("mapeamento de erros", () => {
  it("limite de envios, e-mail inválido, rede e genérico", () => {
    expect(mapearErroAuth({ status: 429 }).code).toBe("LIMITE_ENVIOS");
    expect(mapearErroAuth({ code: "over_email_send_rate_limit" }).code).toBe("LIMITE_ENVIOS");
    expect(mapearErroAuth({ code: "email_address_invalid" }).code).toBe("EMAIL_INVALIDO");
    expect(mapearErroAuth({ name: "AuthRetryableFetchError" }).code).toBe("FALHA_REDE");
    expect(mapearErroAuth({ message: "boom" }).code).toBe("FALHA_AUTENTICACAO");
    expect(mapearErroAuth(null).code).toBe("FALHA_AUTENTICACAO");
  });

  it("a mensagem nunca vaza o texto bruto", () => {
    const m = mensagemAuth(mapearErroAuth({ message: "segredo interno xyz" }));
    expect(m).not.toContain("xyz");
  });

  it("detecta violação de unicidade do Postgres", () => {
    expect(ehViolacaoUnicidade({ code: "23505" })).toBe(true);
    expect(ehViolacaoUnicidade({ code: "23503" })).toBe(false);
    expect(ehViolacaoUnicidade(null)).toBe(false);
  });
});
