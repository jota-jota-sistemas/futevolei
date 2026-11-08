# futevôlei

Site que lista campeonatos de futevôlei em um feed vertical de fotos, estilo Instagram.

🔗 **Site publicado:** https://jota-jota-sistemas.github.io/futevolei/

> Este README é a **documentação viva** do projeto: toda decisão de produto, arquitetura e design fica registrada aqui conforme a gente discute.

---

## Visão do produto

Uma vitrine de campeonatos de futevôlei. O usuário rola um feed vertical de fotos (como no Instagram), onde cada campeonato é um card com foto em destaque, nome, data e local.

### Escopo por fase

| Fase | O que entrega |
|------|---------------|
| **Fase 1 (atual)** | Vitrine estática. Feed vertical de campeonatos. Só o dono cadastra (editando dados no projeto). Sem login. |
| **Fase 2** | Painel de administração (perfis de admin cadastram campeonatos sem mexer em código). Login de usuários. Salvar/favoritar campeonato. |
| **Fase 3 (futuro)** | Inscrição direta no campeonato pelo site. |

---

## Decisões tomadas

Registro das decisões discutidas, com a data e o porquê.

### 2026-11-07 — Definições iniciais

- **Público / dispositivo:** mobile-first. A maior parte do acesso será pelo celular.
- **Quem cadastra campeonatos:** na Fase 1, apenas o dono (dados versionados no projeto). Na Fase 2, perfis de administrador por um painel.
- **Frequência de atualização:** baixa — cerca de uma atualização por semana.
- **Autenticação:** não há login na Fase 1. Entra na Fase 2 (para admin e para o usuário salvar campeonatos).
- **Layout:** feed **vertical** estilo Instagram — um card de campeonato por vez, foto em destaque, rolagem vertical.
- **Modelo de arquitetura:** começar com a **Opção A (site estático)** para colocar no ar rápido e barato; migrar para a **Opção B (frontend + backend-as-a-service)** na Fase 2.

### Arquitetura — decisão

- **Stack escolhida: [Astro](https://astro.build/).**
  - **Por quê:** Astro gera um site estático muito rápido (ótimo para mobile e para uma vitrine de imagens) e, quando chegar a Fase 2, suporta rotas de servidor e integração com backend **sem reescrever o front**. Isso evita retrabalho na migração Opção A → Opção B.
  - **Alternativa descartada por ora:** HTML/CSS/JS puro — simples hoje, mas a migração para a Fase 2 (login, admin, salvar) seria praticamente um recomeço.
  - **Backend da Fase 2 (planejado):** Supabase (banco Postgres + autenticação + storage de imagens).

---

## Stack e custos

**Astro é um framework web open source (licença MIT), gratuito — não é um serviço de cloud nem tem mensalidade.** Ele fica na mesma categoria de Next.js ou SvelteKit: instala-se via `npm` e roda na própria máquina durante o desenvolvimento. Foi feito para sites focados em conteúdo e imagem: por padrão gera HTML estático leve e só adiciona JavaScript onde é necessário, o que o deixa rápido no celular (nossa prioridade).

> Observação: existe a empresa que mantém o Astro e também vende produtos de hospedagem. O **framework**, porém, pode ser usado com qualquer hospedagem (ou nenhuma, rodando local) sem custo. Não há obrigação de contratar nada para usar o Astro.

| Item | O que é | Custo |
|------|---------|-------|
| **Astro** | Framework usado para construir o site | Grátis (open source) |
| **Hospedagem** (Netlify / Vercel / GitHub Pages) | Onde o site fica no ar para o público | Plano gratuito atende a Fase 1 |
| **Supabase** (só na Fase 2) | Banco Postgres + autenticação + storage de fotos | Plano gratuito para começar |

**Conclusão:** a Fase 1 pode ir ao ar com custo zero (Astro grátis + hospedagem no plano gratuito). Custo só tende a aparecer se o site crescer muito em acessos ou volume de dados.

---

## Arquitetura

### Fase 1 (atual) — site estático

```
┌──────────────────────────────────────────┐
│                 Navegador                  │
│         (feed vertical de campeonatos)     │
└──────────────────────────────────────────┘
                     ▲
                     │  HTML/CSS/JS estático
                     │
┌──────────────────────────────────────────┐
│                   Astro                    │
│  - páginas (.astro)                        │
│  - componentes (CampeonatoCard, Feed...)   │
│  - dados: src/data/campeonatos.json        │  ← fonte da verdade na Fase 1
│  - imagens: public/ ou src/assets          │
└──────────────────────────────────────────┘
                     │
                     ▼
            Deploy estático (Netlify / Vercel / GitHub Pages)
```

**Fonte dos dados:** um arquivo `campeonatos.json` no projeto. Atualizar um campeonato = editar o arquivo e publicar.

**Modelo de dados de um campeonato (rascunho):**

```json
{
  "id": "aberto-de-verao-2026",
  "nome": "Aberto de Verão 2026",
  "data": "2026-12-15",
  "local": "Praia de Copacabana, Rio de Janeiro",
  "foto": "/campeonatos/aberto-de-verao-2026.jpg",
  "descricao": "Campeonato aberto, categorias masculina e feminina.",
  "instagram": "@perfil_do_evento"
}
```

> O campo `instagram` é **opcional**. Aceita `@usuario`, `usuario` ou a URL completa. Quando presente, o card exibe um botão "Ver no Instagram"; quando ausente, o botão não aparece.

### Fase 2 e 3 (planejadas) — backend, autenticação e tempo real

**Decisão de arquitetura:** front estático + Supabase como backend. A hospedagem do site migra do GitHub Pages para a **Vercel** quando forem necessárias funções de servidor. O Supabase **não** hospeda o site — cuida apenas do backend.

**Quem faz o quê**

| Camada | Serviço |
|---|---|
| Site / frontend (páginas, imagens) | Vercel (hoje: GitHub Pages) |
| Funções de servidor (segredos, validações sensíveis) | Vercel (serverless) |
| Banco de dados (usuários, inscrições, resultados) | Supabase (Postgres) |
| Login (Google / e-mail) | Supabase Auth |
| Perfis e permissões (ex.: só organizador altera placar) | Supabase + Row Level Security (RLS) |
| Placar ao vivo (tempo real) | Supabase Realtime |

**Custos (faixas típicas — confirmar nos sites oficiais)**

- Início: **US$ 0/mês** (planos free de Vercel + Supabase).
- Produção com eventos: **~US$ 25–45/mês** (Supabase Pro; Vercel Pro se necessário).
- Entre campeonatos: **~zero** (escala por uso).

**Capacidade alvo: ~200 usuários simultâneos no pico**

- Hospedagem/CDN: aguenta milhares de leitores — nunca é o gargalo.
- Supabase Free: ~até 200 conexões realtime simultâneas (cobre piloto, fica no limite).
- Supabase Pro (~US$ 25): ~500 conexões realtime — folga confortável para os 200.
- Números de ordem de grandeza; confirmar com teste de carga antes de um evento grande.

**Login:** "login com Instagram" foi **descartado** — a API foi descontinuada pela Meta, exige App Review demorado e entrega poucos dados úteis. Caminho adotado: **Google + e-mail** via Supabase Auth.

**Placar ao vivo — por que precisa de backend:** o frontend exibe o placar, mas um navegador não consegue avisar os outros quando o placar muda. O **Supabase Realtime** é o intermediário que empurra a mudança para todos os clientes conectados. A permissão de "só o organizador altera o placar" é garantida por **RLS no banco** (regra no servidor, à prova de burla pelo frontend).

**Sequência de implementação**

1. **Fase 2a — Fundação:** migrar para Supabase, login Google, banco de usuários/perfis.
2. **Fase 2b — Inscrição** em campeonato (pessoa logada se inscreve).
3. **Fase 3 — Chaveamento e placar ao vivo** (realtime), feito por último por ser o mais complexo.

---

## Layout

Mobile-first, feed vertical estilo Instagram.

```
┌─────────────────────┐
│ LOGO futevôlei   ⌕  │  ← header fixo
├─────────────────────┤
│  ┌───────────────┐  │
│  │               │  │
│  │   FOTO grande │  │  ← um card por campeonato
│  │               │  │
│  └───────────────┘  │
│  Nome do campeonato │
│  📅 data  📍 local  │
│  ♡  (salvar - fase2)│
├─────────────────────┤
│  ┌───────────────┐  │
│  │   FOTO grande │  │  ← próximo card
│  └───────────────┘  │
│  Nome do campeonato │
│   ...feed vertical  │
└─────────────────────┘
```

- **Header fixo** com logo e (futuramente) busca.
- **Feed vertical** rolável: um card de campeonato por "tela", foto em destaque.
- **Card:** foto + nome + data + local. Ícone de salvar (♡) aparece já no layout, mas fica **inativo até a Fase 2**.

---

## Como rodar

Pré-requisitos: Node.js 22.23.4+ e npm (exigência do Astro 7).

```bash
npm install     # instala dependências (primeira vez)
npm run dev     # sobe o servidor local em http://localhost:4321
npm run build   # gera o site estático em dist/
npm run preview # visualiza o build de produção localmente
```

## Estrutura do projeto

```
futevolei/
├─ public/
│  ├─ favicon.svg
│  └─ campeonatos/              # imagens dos campeonatos (trocar pelos arquivos reais)
├─ src/
│  ├─ components/
│  │  ├─ Header.astro           # cabeçalho fixo (logo + busca futura)
│  │  ├─ Feed.astro             # lê os dados, ordena por data e monta o feed
│  │  └─ CampeonatoCard.astro   # card clicável (foto, nome, data, local) → leva ao detalhe
│  ├─ data/
│  │  └─ campeonatos.json       # FONTE DA VERDADE na Fase 1
│  ├─ layouts/
│  │  └─ Layout.astro           # HTML base, estilos globais, tema claro/escuro
│  ├─ pages/
│  │  ├─ index.astro            # página inicial (monta o Feed)
│  │  └─ campeonatos/
│  │     └─ [id].astro          # página de detalhe (uma por campeonato, via id)
│  ├─ utils/
│  │  └─ url.ts                 # helpers: comBase, instagramUrl, formatarData
│  └─ types.ts                  # tipo Campeonato
├─ astro.config.mjs
├─ package.json
└─ tsconfig.json
```

## Arquitetura de código / onde mexer

O projeto segue o princípio de **separação de responsabilidades**: dados, apresentação e lógica ficam em lugares distintos, cada um com uma única função. Uma mudança num lugar não causa efeito colateral inesperado em outro.

### Fluxo dos dados

```
campeonatos.json  →  Feed.astro  →  CampeonatoCard.astro  →  HTML na tela
   (dados)           (lógica)        (apresentação)
```

### Camadas e padrões

1. **Dados separados do código** (`src/data/campeonatos.json`) — a *fonte da verdade única* (single source of truth). Os campeonatos não estão escritos dentro do HTML; ficam isolados neste arquivo. Para adicionar um campeonato, mexe-se só aqui.

2. **Componente reutilizável** (`CampeonatoCard.astro`) — *padrão de componentes*. A aparência de "um campeonato" é escrita uma vez e reaproveitada para cada item. Mudar o visual de todos os cards = editar só este arquivo. O card recebe os dados de fora via **props** (`Astro.props`) e não sabe quantos campeonatos existem nem de onde vêm — só sabe desenhar o que recebe.

3. **Composição / orquestração** (`Feed.astro`) — pega os dados, aplica a lógica (ordenar por data) e gera um card por campeonato com `.map()`. Regras de "como a lista se comporta" (ordem, filtros, agrupamento) ficam aqui.

4. **Layout como molde** (`Layout.astro`) — *padrão de template*. Define a estrutura HTML comum (cabeçalho, estilos globais, tema claro/escuro) e deixa um `<slot />` onde cada página encaixa seu conteúdo.

### Onde mexer para cada tipo de mudança

| Você quer... | Mexe em... |
|--------------|-----------|
| Adicionar/editar/remover um campeonato | `src/data/campeonatos.json` |
| Mudar a aparência dos cards | `src/components/CampeonatoCard.astro` |
| Mudar a página de detalhe do campeonato | `src/pages/campeonatos/[id].astro` |
| Mudar a ordem ou filtrar a lista | `src/components/Feed.astro` |
| Mudar cabeçalho, logo, cores globais, tema | `src/components/Header.astro` e `src/layouts/Layout.astro` |
| Criar uma nova página (ex.: "Sobre") | novo arquivo em `src/pages/` |

> Esses padrões (componente, props, template, fonte da verdade única) são reconhecidos no mercado e aparecem em praticamente todo framework moderno (React, Vue, Svelte).

## Como adicionar/editar um campeonato (Fase 1)

1. Coloque a foto em `public/campeonatos/` (ex.: `public/campeonatos/meu-torneio.jpg`). Proporção recomendada: retrato (4:5), estilo Instagram.
2. Adicione um objeto em `src/data/campeonatos.json`:
   ```json
   {
     "id": "meu-torneio-2026",
     "nome": "Meu Torneio 2026",
     "data": "2026-12-20",
     "local": "Praia X, Cidade Y",
     "foto": "/campeonatos/meu-torneio.jpg",
     "descricao": "Descrição curta do campeonato.",
     "instagram": "@perfil_do_evento"
   }
   ```
   O campo `instagram` é opcional — pode omitir se o evento não tiver perfil.
3. Pronto — o feed ordena automaticamente por data (os próximos aparecem primeiro).

> As imagens atuais em `public/campeonatos/*.svg` são placeholders. Basta substituir pelos arquivos reais e ajustar o campo `foto` no JSON.

## Deploy (GitHub Pages)

O site é publicado em **GitHub Pages** como site de projeto, custo zero. URL final:

```
https://jota-jota-sistemas.github.io/futevolei/
```

**Como funciona:**
- O workflow `.github/workflows/deploy.yml` roda a cada push na `main`: faz o build com Astro e publica o conteúdo de `dist/`.
- `astro.config.mjs` define `site` e `base: "/futevolei"` — necessários porque o site é servido numa subpasta do domínio, não na raiz.
- Caminhos de assets e links internos passam pela função `src/utils/url.ts` (`comBase`), que prefixa o `base` automaticamente. Por isso o `campeonatos.json` continua usando caminhos simples (`/campeonatos/...`).

**Ativação (uma vez só, no site do GitHub):**
1. Repositório → **Settings** → **Pages**.
2. Em **Build and deployment** → **Source**, selecione **GitHub Actions**.
3. Pronto. A partir daí, todo push na `main` publica automaticamente. Acompanhe o progresso na aba **Actions**.

## Status

- [x] Definir escopo e fases
- [x] Definir arquitetura (Astro, estático na Fase 1 → Supabase na Fase 2)
- [x] Definir layout (feed vertical mobile-first)
- [x] Inicializar projeto Astro
- [x] Criar modelo de dados e dados de exemplo
- [x] Implementar o feed vertical de campeonatos
- [x] Configurar deploy no GitHub Pages (workflow + base)
- [ ] Ativar GitHub Pages no repositório (Settings → Pages → Source: GitHub Actions)
- [ ] Trocar placeholders pelas fotos reais dos campeonatos
