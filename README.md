# futevôlei

Site que lista campeonatos de futevôlei em um feed vertical de fotos, estilo Instagram.

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
  "descricao": "Campeonato aberto, categorias masculina e feminina."
}
```

### Fase 2 (planejada) — backend-as-a-service

Troca a fonte de dados do JSON local por **Supabase** (banco + auth + storage). O front em Astro continua; só passamos a buscar os campeonatos do Supabase e adicionamos login, painel de admin e a função de salvar.

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

Pré-requisitos: Node.js 18+ e npm.

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
│  │  └─ CampeonatoCard.astro   # card de um campeonato (foto, nome, data, local)
│  ├─ data/
│  │  └─ campeonatos.json       # FONTE DA VERDADE na Fase 1
│  ├─ layouts/
│  │  └─ Layout.astro           # HTML base, estilos globais, tema claro/escuro
│  ├─ pages/
│  │  └─ index.astro            # página inicial (monta o Feed)
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
     "descricao": "Descrição curta do campeonato."
   }
   ```
3. Pronto — o feed ordena automaticamente por data (os próximos aparecem primeiro).

> As imagens atuais em `public/campeonatos/*.svg` são placeholders. Basta substituir pelos arquivos reais e ajustar o campo `foto` no JSON.

## Status

- [x] Definir escopo e fases
- [x] Definir arquitetura (Astro, estático na Fase 1 → Supabase na Fase 2)
- [x] Definir layout (feed vertical mobile-first)
- [x] Inicializar projeto Astro
- [x] Criar modelo de dados e dados de exemplo
- [x] Implementar o feed vertical de campeonatos
- [ ] Trocar placeholders pelas fotos reais dos campeonatos
- [ ] Deploy da Fase 1 (Netlify / Vercel / GitHub Pages)
