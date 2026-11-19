// src/scripts/organizar/formato.ts
//
// Seção "Formato": mostra o formato já salvo, sugere um formato para o número de
// duplas e SALVA SOZINHO ao mudar (sem botão "Salvar"; o aviso "Formato salvo"
// confirma). Validações aparecem junto dos campos.
//
// Contrato de DOM (dentro de `secao`):
//   [data-form-formato], radios input[name=formato][data-formato], [data-grupos-params],
//   #formato-grupos, #formato-classificados (name numeroDeGrupos/classificadosPorGrupo),
//   [data-sugestao] > [data-sugestao-texto] + [data-usar-sugestao],
//   [data-formato-dica], [data-erro-formato]

import type { BracketStore, CategoryRef } from "../../store/bracketStore";
import type { Bracket, BracketConfig, Pair } from "../../domain/bracket/types";
import type { Result } from "../../domain/result";
import {
  exigirFormato,
  validarClassificadosPorGrupo,
  validarNumeroDeGrupos,
} from "../../domain/bracket/config";
import { sugerirFormato } from "../../domain/bracket/sugestao";
import { mensagemErro } from "./mensagens";
import { ligarRascunho, type Rascunho } from "./rascunho";
import type { OpcoesToast } from "./toast";

export interface EstadoFormato {
  duplas: Pair[];
  bracket: Bracket | null;
  /** Formato salvo na categoria (colunas de `categorias`), se houver. */
  configSalva: BracketConfig | null;
}

export interface DepsFormato {
  secao: HTMLElement;
  store: BracketStore;
  ref: CategoryRef;
  estado: EstadoFormato;
  rascunho: Rascunho;
  avisar: (opcoes: OpcoesToast) => void;
  /** Depois de mudar o formato (a página atualiza o resumo antes de gerar). */
  aoMudar: () => void;
  /** Espera antes de salvar (ms); padrão 600. */
  atrasoMs?: number;
}

export interface ControleFormato {
  /** Redesenha sugestão e dica (chamar quando o número de duplas muda). */
  render(): void;
  /** Formato lido da tela, já validado contra o número de duplas. */
  lerConfig(): Result<BracketConfig>;
}

const q = <T extends HTMLElement>(raiz: ParentNode, s: string): T | null => raiz.querySelector<T>(s);

function formatoMarcado(secao: ParentNode): string | null {
  return q<HTMLInputElement>(secao, "input[name='formato']:checked")?.value ?? null;
}

/** Lê o formato e os parâmetros da tela e valida contra `nDuplas`. */
export function lerConfigDaTela(secao: ParentNode, nDuplas: number): Result<BracketConfig> {
  const formatoRes = exigirFormato(formatoMarcado(secao));
  if (!formatoRes.ok) return { ok: false, erro: formatoRes.erro };
  const config: BracketConfig = { formato: formatoRes.valor };
  if (formatoRes.valor === "fase de grupos") {
    const g = Number(q<HTMLInputElement>(secao, "#formato-grupos")?.value);
    const c = Number(q<HTMLInputElement>(secao, "#formato-classificados")?.value);
    const gRes = validarNumeroDeGrupos(g, nDuplas);
    if (!gRes.ok) return { ok: false, erro: gRes.erro };
    const cRes = validarClassificadosPorGrupo(c, nDuplas, gRes.valor);
    if (!cRes.ok) return { ok: false, erro: cRes.erro };
    config.numeroDeGrupos = gRes.valor;
    config.classificadosPorGrupo = cRes.valor;
  }
  return { ok: true, valor: config };
}

/** "8 duplas em 2 grupos de 4. 2 avançam de cada grupo." */
export function descreverGrupos(n: number, g: number, c: number): string {
  const menor = Math.floor(n / g);
  const maior = Math.ceil(n / g);
  const tamanho = menor === maior ? `de ${menor}` : `(de ${menor} a ${maior} duplas)`;
  return `${n} duplas em ${g} ${g === 1 ? "grupo" : "grupos"} ${tamanho}. ${c} ${c === 1 ? "avança" : "avançam"} de cada grupo.`;
}

export function ligarFormato(deps: DepsFormato): ControleFormato {
  const { secao, store, ref, estado, avisar } = deps;
  const form = q<HTMLFormElement>(secao, "[data-form-formato]");
  const params = q<HTMLElement>(secao, "[data-grupos-params]");
  const inputG = q<HTMLInputElement>(secao, "#formato-grupos");
  const inputC = q<HTMLInputElement>(secao, "#formato-classificados");
  const caixaSugestao = q<HTMLElement>(secao, "[data-sugestao]");
  const textoSugestao = q<HTMLElement>(secao, "[data-sugestao-texto]");
  const botaoSugestao = q<HTMLButtonElement>(secao, "[data-usar-sugestao]");
  const dica = q<HTMLElement>(secao, "[data-formato-dica]");
  const erro = q<HTMLElement>(secao, "[data-erro-formato]");
  const atraso = deps.atrasoMs ?? 600;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let ultimoSalvo = "";
  let versao = 0; // descarta resposta de um salvamento já superado

  const chave = (c: BracketConfig): string => JSON.stringify(c);
  const radios = Array.from(secao.querySelectorAll<HTMLInputElement>("input[name='formato']"));

  function aplicar(config: BracketConfig): void {
    for (const r of radios) r.checked = r.value === config.formato;
    if (inputG) inputG.value = config.numeroDeGrupos ? String(config.numeroDeGrupos) : "";
    if (inputC) inputC.value = config.classificadosPorGrupo ? String(config.classificadosPorGrupo) : "";
    visibilidade();
  }

  function visibilidade(): void {
    if (params) params.hidden = formatoMarcado(secao) !== "fase de grupos";
  }

  const mostrarErro = (t: string): void => {
    if (erro) erro.textContent = t;
  };

  /** Valida o que está na tela; mostra o problema junto dos campos. */
  function conferir(silencioso: boolean): Result<BracketConfig> {
    const n = estado.duplas.length;
    const res = lerConfigDaTela(secao, n);
    if (dica) dica.textContent = "";
    if (!res.ok) {
      // Sem escolha ainda, ou campo vazio no meio da digitação: não é um erro.
      const incompleto =
        formatoMarcado(secao) === null ||
        (formatoMarcado(secao) === "fase de grupos" && (!inputG?.value || !inputC?.value));
      mostrarErro(silencioso || incompleto ? "" : mensagemErro(res.erro));
      return res;
    }
    mostrarErro("");
    const c = res.valor;
    if (dica && c.formato === "fase de grupos" && c.numeroDeGrupos && c.classificadosPorGrupo) {
      dica.textContent = descreverGrupos(n, c.numeroDeGrupos, c.classificadosPorGrupo);
    }
    return res;
  }

  function atualizarSugestao(): void {
    if (!caixaSugestao) return;
    const s = sugerirFormato(estado.duplas.length);
    const atual = lerConfigDaTela(secao, estado.duplas.length);
    const igual =
      s !== null &&
      atual.ok &&
      atual.valor.formato === s.formato &&
      (s.formato !== "fase de grupos" ||
        (atual.valor.numeroDeGrupos === s.numeroDeGrupos &&
          atual.valor.classificadosPorGrupo === s.classificadosPorGrupo));
    caixaSugestao.hidden = s === null || igual;
    if (s && textoSugestao) {
      const detalhe =
        s.formato === "fase de grupos" && s.numeroDeGrupos && s.classificadosPorGrupo
          ? `Fase de grupos: ${descreverGrupos(estado.duplas.length, s.numeroDeGrupos, s.classificadosPorGrupo)}`
          : `Dupla eliminação. ${s.motivo}`;
      textoSugestao.textContent = `Sugestão: ${detalhe}`;
    }
  }

  async function salvar(): Promise<void> {
    const res = conferir(false);
    if (!res.ok) return;
    const k = chave(res.valor);
    if (k === ultimoSalvo) return;
    const minha = ++versao;
    const salvo = await store.salvarConfig(ref, res.valor);
    if (minha !== versao) return;
    if (!salvo.ok) {
      const m = mensagemErro(salvo.erro);
      mostrarErro(m);
      avisar({ texto: m, tipo: "erro" });
      return;
    }
    ultimoSalvo = k;
    estado.configSalva = res.valor;
    avisar({ texto: "Formato salvo." });
  }

  function agendar(): void {
    clearTimeout(timer);
    timer = setTimeout(() => void salvar(), atraso);
  }

  function aoEditar(): void {
    visibilidade();
    const res = conferir(false);
    atualizarSugestao();
    deps.aoMudar();
    if (res.ok) agendar();
    else clearTimeout(timer);
  }

  for (const r of radios) r.addEventListener("change", aoEditar);
  inputG?.addEventListener("input", aoEditar);
  inputC?.addEventListener("input", aoEditar);
  form?.addEventListener("submit", (e) => e.preventDefault());

  botaoSugestao?.addEventListener("click", () => {
    const s = sugerirFormato(estado.duplas.length);
    if (!s) return;
    aplicar({
      formato: s.formato,
      ...(s.numeroDeGrupos ? { numeroDeGrupos: s.numeroDeGrupos } : {}),
      ...(s.classificadosPorGrupo ? { classificadosPorGrupo: s.classificadosPorGrupo } : {}),
    });
    aoEditar();
    clearTimeout(timer);
    void salvar();
  });

  // Estado inicial: o formato já definido vem marcado (do chaveamento ou da categoria).
  const inicial = estado.bracket?.config ?? estado.configSalva;
  if (inicial) {
    aplicar(inicial);
    ultimoSalvo = chave(inicial);
  }
  if (form) ligarRascunho(form, ["numeroDeGrupos", "classificadosPorGrupo"], deps.rascunho);
  visibilidade();

  return {
    render() {
      conferir(true);
      atualizarSugestao();
    },
    lerConfig: () => lerConfigDaTela(secao, estado.duplas.length),
  };
}
