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
  "instagram": "@perfil_do_evento",
  "categorias": ["Open", "Amador", "Feminino"],
  "inscricao": "https://inscricao-do-evento.com/"
}
```

> O campo `instagram` é **opcional**. Aceita `@usuario`, `usuario` ou a URL completa. Quando presente, a página de detalhe exibe um botão "Ver no Instagram"; quando ausente, o botão não aparece.
>
> O campo `categorias` é **opcional** (lista de strings). Quando presente, o card e a página de detalhe exibem chips de categoria; quando ausente, o bloco não aparece — nenhuma categoria é inventada a partir da descrição.
>
> O campo `inscricao` é **opcional**. Deve ser uma URL completa (`http://` ou `https://`) da página de inscrição. Quando presente e válida, a página de detalhe exibe um botão "Inscreva-se"; valores vazios ou sem o esquema http(s) são ignorados e o botão não aparece.
>
> O campo `foto` pode ficar vazio (`""`). Nesse caso o card da home já não exibe imagem e a página de detalhe **omite o bloco de imagem** e mostra só os demais dados — nunca uma imagem quebrada nem um espaço vazio.

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

## Fonte atual dos eventos: `torneios.json`

A **lista da home e a página de detalhe** passaram a ler `src/data/torneios.json`, coletado do calendário público [torneios-ftv.com](https://torneios-ftv.com) (estado SP, de hoje em diante). As seções abaixo que falam de `campeonatos.json` descrevem o formato antigo, que agora só alimenta a área de organização (`/campeonatos/[id]/organizar`) e o script `migrar:campeonatos`.

```bash
npm run coletar:torneios   # reabre o calendário com Playwright e sobrescreve src/data/torneios.json
```

- O coletor só lê páginas públicas, sem login. O link de inscrição **não é coletado** (o site exige conta para liberar o contato do organizador), então o botão "Inscreva-se" não aparece nesses eventos.
- `src/utils/torneios.ts` converte cada torneio no modelo `Campeonato` usado pelo site e padroniza a caixa de cidades e categorias. O JSON coletado fica intacto.
- A origem não traz foto nem descrição: nos eventos coletados o card mostra só data, local e nome, e o detalhe não exibe imagem.
- **Eventos manuais:** um registro com `"fonte": "manual"` pode ter também `foto` (caminho em `public/`) e `descricao`. O coletor **preserva** esses registros ao regravar o arquivo; os demais são substituídos a cada coleta.
- O link do Instagram aponta para o **post** de origem (um carrossel pode listar vários torneios); `?img_index=N` indica o slide do torneio.
- **Filtro de categorias:** as categorias são texto livre (114 grafias distintas), então o filtro usa **Nível** (select) e **Gênero** (chips), derivados do texto por `src/utils/categorias.ts`. Cada variante de nível é uma opção própria (Estreante, Principiante, Aprendiz, Iniciante, "Iniciante + C", Intermediário, Amador, Bronze, Master, Open, Outros). Categoria sem gênero escrito é **Masculino** por padrão, exceto as de "Outros". Nível e gênero casam na **mesma categoria** do evento. O texto original continua no detalhe.
- A seção "Chaveamentos" do detalhe está desligada (`EXIBIR_CHAVEAMENTOS` em `src/pages/campeonatos/[id].astro`), porque esses eventos não têm chaveamento associado.

## Jogadores (perfil e CRUD)

Cadastro de atletas, base para um futuro ranking de jogadores. Há duas áreas:

| Área | Endereço | O que faz |
|---|---|---|
| **Consulta pública** (menu "Jogadores") | `/jogadores` e `/jogadores/perfil?id=…` | Só lista, busca e perfil com o histórico de duplas. **Somente leitura**: não há formulário nem botão de editar. Mostra apenas jogadores ativos na lista. |
| **Gerenciamento** | `/gerenciar_jogadores` e `/gerenciar_jogadores/editar?id=…` | Criar, editar, arquivar/reativar e excluir. **Só administradores logados** (ver "Login e administradores"). O link aparece no menu apenas para administradores. Marcada com `noindex`. |

> **Acesso:** a escrita no banco exige `eh_admin()` (RLS). A guarda da tela é só de interface; veja a seção "Login e administradores".

- **Banco:** tabela `jogadores` (nome, apelido, gênero, categoria, cidade, UF, instagram, ativo) e duas colunas **opcionais** em `duplas`: `jogador_a_id` e `jogador_b_id`. `atleta_a` e `atleta_b` continuam como texto e guardam o nome na hora da inscrição, então renomear um jogador não altera chaveamentos já gerados. O SQL está em `supabase/schema.sql` (idempotente) e **precisa ser aplicado manualmente** no Supabase.
- **Privacidade:** a leitura é pública, então a tabela só guarda dados que podem ser exibidos a qualquer visitante. Não adicione e-mail, telefone, CPF nem data de nascimento nela.
- **Segurança:** só administradores criam e apagam perfis; um usuário vinculado ao jogador edita apenas o próprio registro (policies em `supabase/schema.sql`). Bancos que aplicaram a versão anterior precisam reaplicar o SQL, que remove a escrita anônima.
- **Excluir:** apaga de vez só quem não tem vínculo com nenhuma dupla; quem tem histórico é **arquivado** (`ativo = false`) e some da lista, mas permanece no banco.
- **Nomes repetidos** são permitidos (homônimos existem). O formulário avisa e pede confirmação.
- **Limite:** a lista carrega até 1000 jogadores (teto padrão do PostgREST). Acima disso é preciso paginar.
- **Ranking (futuro):** pode sair de uma view que junta `jogos.vencedor_id` → `duplas` → `jogador_a_id`/`jogador_b_id`, sem tabela de pontos. A regra de pontuação ainda é uma decisão de produto.
- **Código:** domínio puro em `src/domain/jogadores`, acesso a dados em `src/store/jogadorStore.ts` (cliente injetável, como o `bracketStore`). As duas áreas compartilham os componentes `JogadoresLista` e `JogadorPerfil` e os scripts `jogadores-lista.ts` e `jogador-perfil.ts`. A área de gerenciamento é ligada pelo parâmetro `gerenciar: true`, que vale `false` por padrão, então a consulta pública nunca escreve, mesmo que o HTML tenha um formulário. O caminho `/gerenciar_jogadores` só existe em `src/pages/gerenciar_jogadores/` e em `src/scripts/rotas-gerenciar.ts`, e um teste impede que ele apareça como texto em outros arquivos (os demais módulos importam o `hrefGerenciar`).
- **Categoria do jogador:** campo opcional `categoria`, com o mesmo vocabulário de Nível do filtro de eventos (sem "Outros"). Quem já aplicou a versão anterior do SQL precisa rodar o `alter table jogadores add column if not exists categoria …` que está em `supabase/schema.sql`.
- **Duplas do jogador:** o perfil lista as duplas em que ele participou (categoria, evento e parceiro), lidas de `duplas` pelos vínculos `jogador_a_id`/`jogador_b_id`. Esses vínculos são gravados no formulário de dupla da organização: cada atleta tem um seletor opcional **"Jogador cadastrado"**. Escolher um jogador preenche o nome; editar o nome à mão desfaz o vínculo. Sem escolher, a dupla é só texto, como antes, e **não** entra no histórico de ninguém.
- **Ainda não feito:** migrar os nomes antigos de `atleta_a`/`atleta_b` para jogadores (duplas já criadas continuam sem vínculo) e o ranking.

## Login e administradores (Supabase Auth)

O site continua **estático**. O login usa o Supabase Auth direto no navegador, hoje só com **link mágico** por e-mail. O login com **Google** está implementado na store mas **desativado na tela** (falta configurar o provedor); para reativar, devolva o botão `data-google` em `src/pages/entrar.astro`.

| Página | Acesso |
|---|---|
| Home, eventos, detalhe do evento, `acompanhar`, `/jogadores` e `/jogadores/perfil` | Públicas, sem login |
| `/entrar` e `/conta` | Login e "Minha conta" (dados, vínculo com um jogador, sair) |
| `/gerenciar_jogadores` (lista e editar) e `/campeonatos/[id]/organizar` (índice e categoria) | Só **administradores** logados |

- **Quem é administrador:** qualquer pessoa pode criar conta, mas só quem tem o e-mail na tabela `administradores` gerencia. A decisão é do banco: a função `eh_admin()` compara o e-mail do JWT com a tabela, e as policies de escrita (categorias, duplas, chaveamentos, grupos, jogos e jogadores) exigem `eh_admin()`. A escrita anônima foi removida.
- **Menu:** visitante vê "Entrar"; logado vê "Minha conta"; administrador vê também "Gerenciar" (a partir de 640px; em telas menores o link fica em "Minha conta"). Quem nunca entrou no navegador não carrega o SDK de login.
- **Vínculo com jogador:** em `/conta` a pessoa escolhe um jogador cadastrado (`perfis.jogador_id`, único, então dois donos não são possíveis) e passa a poder editar só o próprio registro. O vínculo é escolhido pela própria pessoa, sem confirmação de administrador. Se isso virar problema, passe a exigir aprovação antes de gravar `jogador_id`.
- **Código:** domínio puro em `src/domain/auth`, acesso em `src/store/authStore.ts` (cliente injetável), guarda em `src/scripts/guarda.ts` + `src/components/GuardaAcesso.astro`, páginas `src/pages/entrar.astro` e `src/pages/conta.astro`. O destino pós-login (`?volta=`) só aceita caminhos internos (`caminhoSeguro`).

> **Atenção: a guarda da tela é só de interface.** O conteúdo das telas de gerenciamento nasce oculto e só é revelado para administradores, mas o HTML estático continua baixável por qualquer pessoa. Quem protege os dados é o **RLS** do Supabase. Por isso é obrigatório aplicar o SQL atualizado.

### Configuração (manual, no painel do Supabase)

1. **Aplicar o SQL:** em um banco que já tinha o schema anterior, rode só `supabase/migracao-auth.sql` (é a parte nova, idempotente); em um banco novo, rode `supabase/schema.sql` inteiro. Se mudar o bloco de autenticação do `schema.sql`, atualize a migração (um teste confere). Ele cria `administradores`, `eh_admin()`, `perfis` (com trigger de primeiro login) e troca as policies de escrita anônima pelas de administrador.
2. **Provedores:** em *Authentication → Providers*, ative **Email** (com "Confirm email"/OTP por link) e **Google** (Client ID e Secret criados no Google Cloud Console; a URL de callback é a que o painel mostra).
3. **URLs de redirecionamento:** em *Authentication → URL Configuration*, defina o **Site URL** (`https://futevolei.vercel.app`) e inclua em *Redirect URLs* `https://futevolei.vercel.app/entrar` e `http://localhost:4321/entrar`.
4. **Primeiro administrador:** depois de entrar uma vez, rode no SQL Editor:
   ```sql
   insert into administradores (email) values ('voce@exemplo.com') on conflict do nothing;
   ```
   O e-mail deve estar em minúsculas. Para remover, `delete from administradores where email = '…'`.
5. **Variáveis:** continuam `PUBLIC_SUPABASE_URL` e `PUBLIC_SUPABASE_ANON_KEY` (veja `.env.example`). Nenhuma chave nova é necessária.

## Menu

O menu (cabeçalho e rodapé) vem de `src/utils/menu.ts` e só lista destinos reais e globais: **Eventos** (a lista na home) e **Jogadores**. Os itens de conta (Entrar, Minha conta, Gerenciar) são trocados por `src/scripts/menu-conta.ts` conforme o login. Ele fica na própria barra do topo em qualquer largura, sem hambúrguer. "Acompanhar partidas" e "Organizar" são por evento e continuam sendo alcançados a partir da página do evento. Para adicionar um item, inclua-o em `ITENS_MENU`; se a lista passar de 3 ou 4 itens, vale um menu recolhível.

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
     "instagram": "@perfil_do_evento",
     "categorias": ["Masculino Estreante", "Misto Iniciante"],
     "inscricao": "https://pagina-de-inscricao.com/"
   }
   ```
   Os campos `instagram`, `categorias` e `inscricao` são opcionais — pode omitir quando o evento não tiver. Se não houver foto, deixe `"foto": ""` e o detalhe simplesmente não exibe imagem.
3. Pronto — o feed ordena automaticamente por data (os próximos aparecem primeiro).

> A home exibe **8 eventos** inicialmente (para carregar leve); o botão "Ver todos os eventos" revela o restante na própria página. Ao filtrar, todos os eventos correspondentes aparecem, independentemente desse limite.

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
- [x] Buscar e filtrar eventos (cidade, período, categoria) com busca no botão
- [x] Busca de texto na lista de eventos (nome e local): filtra ao digitar, ignora acento e caixa, todas as palavras precisam aparecer. Os filtros do hero continuam valendo só no clique de "Buscar eventos", e "Limpar filtros" também esvazia a busca
- [x] "Ver todos os eventos": home com 8 cards + botão que revela o restante
- [x] Página de detalhe: sem foto, o bloco de imagem é omitido; categorias e botão "Inscreva-se"
- [ ] Ativar GitHub Pages no repositório (Settings → Pages → Source: GitHub Actions)
- [ ] Preencher `inscricao` e fotos reais dos campeonatos (conteúdo)
