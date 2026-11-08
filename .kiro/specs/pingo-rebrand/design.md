# Design Document

## Overview

This design describes a presentation-only rebrand of the existing static Astro futevôlei site to the **PINGO** brand ("Pingo Futevôlei"). It replaces the current Instagram-style single-column feed (green accent `#0b8a4f`, max-width 480px, automatic dark mode) with the PINGO reference layout: a dark header with navigation and an orange "Criar evento" action, a hero with a beach-sunset background and a search bar, a responsive multi-column "Próximos eventos" grid, and a dark footer.

The change touches only the Astro presentation layer. The data contract is frozen: `src/types.ts` (the `Campeonato` interface) and `src/data/campeonatos.json` are **not** modified, no new structured fields (category tags, price blocks) are introduced, the site remains `output: "static"`, and no new routes are added. Every interactive-looking control (navigation, filters, "Criar evento", "Buscar eventos", "Ver evento", footer links, social icons, account) is a visual placeholder reusing the existing `disabled` + "disponível em breve" (available soon) pattern.

Code examples use the project's existing stack: Astro components with scoped `<style>` blocks and plain CSS driven by CSS custom properties. TypeScript appears only in component frontmatter, matching the current codebase.

### Goals

- Apply a single fixed PINGO palette on every page (no OS-driven dark mode).
- Restructure the home page into Header → Hero → Events_Section → Footer.
- Keep all controls as non-functional placeholders.
- Preserve the `Campeonato` data contract and the static build.

### Non-Goals

- No real search, filtering, authentication, favorites, or event-detail routes.
- No changes to `types.ts`, `campeonatos.json`, or `astro.config.mjs` output mode.
- No new data fields or category/price structures.

## Architecture

### Component Tree

```
Layout.astro            (global PINGO tokens, <head>, fixed palette)
├── Header.astro        (rebranded dark header)
│   └── BrandLogo.astro (orange ball + "Pingo Futevôlei")
└── <main>
    └── index.astro
        ├── Hero.astro          (background image, headline, subtitle, SearchBar)
        │   └── SearchBar.astro (Onde? / Quando? / Categoria + "Buscar eventos")
        ├── EventsSection.astro (heading "Próximos eventos" + responsive grid)
        │   └── EventCard.astro (per Campeonato; renamed from CampeonatoCard)
        └── Footer.astro        (dark footer, BrandLogo, tagline, links, social)
            └── BrandLogo.astro
```

### Affected and New Components

| Component | Status | Role |
|-----------|--------|------|
| `src/layouts/Layout.astro` | Modified | Replace token palette, remove dark-mode media query, remove 480px assumptions, mount `Footer`, update title/description to PINGO. |
| `src/components/Header.astro` | Modified | Dark header: `BrandLogo` link, nav (Eventos / Como funciona / Para organizadores), orange "Criar evento", account icon — all placeholders. |
| `src/components/Hero.astro` | New | Background image + headline (`jogo` orange) + subtitle + `SearchBar`. |
| `src/components/SearchBar.astro` | New | Filter fields Onde?/Quando?/Categoria + orange "Buscar eventos" — all placeholders. |
| `src/components/EventsSection.astro` | New | Replaces `Feed.astro`'s role: heading + responsive grid + ordering + empty state. |
| `src/components/EventCard.astro` | New | Redesigned card (renamed from `CampeonatoCard.astro`): date badge + fields + orange "Ver evento" placeholder. |
| `src/components/Footer.astro` | New | Dark footer: `BrandLogo`, tagline, links, social icons — all placeholders. |
| `src/components/BrandLogo.astro` | New | Reusable PINGO mark (orange ball + "Pingo Futevôlei") with textual fallback. |
| `src/pages/index.astro` | Modified | Compose `Hero` + `EventsSection` inside `Layout`. |
| `src/components/Feed.astro` | Removed | Superseded by `EventsSection.astro`. |
| `src/components/CampeonatoCard.astro` | Removed | Superseded by `EventCard.astro`. |
| `src/types.ts` | Unchanged | Frozen data contract. |
| `src/data/campeonatos.json` | Unchanged | Frozen data. |
| `src/utils/url.ts` | Unchanged | Reused via `comBase` for asset/link URLs. |

`EventsSection.astro` owns the data import (`campeonatos.json`), ordering, and empty-state decision, keeping `index.astro` purely compositional.

## Design Tokens

All colors live as CSS custom properties on `:root` in `Layout.astro`'s global `<style is:global>`. The existing green theme and the `@media (prefers-color-scheme: dark)` override are removed. `color-scheme` is pinned to `light` so the browser never applies a dark UA treatment.

### Token Structure

```css
:root {
  /* Brand / accent — vibrant orange */
  --cor-destaque: #f97316;        /* accent / primary action */
  --cor-destaque-forte: #ea580c;  /* hover/pressed accent */
  --cor-destaque-suave: #fff1e6;  /* light orange tint (badges, soft fills) */

  /* Surfaces */
  --cor-fundo: #fdf8f1;           /* cream / off-white body background */
  --cor-superficie: #ffffff;      /* white cards */
  --cor-borda: #ece3d6;           /* warm hairline border on cream */

  /* Dark zones — header and footer */
  --cor-escuro: #14110f;          /* near-black header/footer background */
  --cor-escuro-2: #241f1b;        /* elevated dark surface (nav hover, inputs) */
  --cor-borda-escura: #342d27;    /* border inside dark zones */

  /* Text */
  --cor-texto: #1a1a1a;           /* primary text on light surfaces */
  --cor-texto-suave: #6b6b6b;     /* secondary text on light surfaces */
  --cor-texto-claro: #f7f3ee;     /* primary text on dark zones */
  --cor-texto-claro-suave: #b9b0a6; /* secondary text on dark zones */

  color-scheme: light; /* fixed palette; no OS dark mode */
}
```

Notes:
- `--cor-destaque` replaces every prior use of `#0b8a4f`. The green literal is removed from all files (see Property P1). The `:focus-visible` outline switches from green to `--cor-destaque`.
- No `prefers-color-scheme` block remains; the palette is identical on light and dark OS settings (Req 1.3).
- Dark zones (header/footer) reference `--cor-escuro*` and `--cor-texto-claro*`; light zones use the surface/text tokens.

### Typography & Spacing

Keep the existing system font stack and `line-height: 1.5`. Introduce a shared content width token used by Hero and Events_Section instead of the removed 480px feed constraint:

```css
:root {
  --largura-conteudo: 1200px; /* page content max-width; replaces the old 480px feed cap */
  --raio-card: 16px;
}
```

## Components and Interfaces

### BrandLogo.astro

Reusable brand mark. A `variante` prop selects light-zone vs dark-zone text color so the same mark reads correctly in the cream body and the dark header/footer. The ball is an inline SVG filled with `--cor-destaque`; if SVG fails to render, the adjacent text "Pingo Futevôlei" remains as the textual fallback (Req 1.2).

```astro
---
interface Props {
  variante?: "claro" | "escuro"; // "escuro" = on dark header/footer
  comLink?: boolean;             // wrap in <a href={comBase("/")}>
}
const { variante = "claro", comLink = false } = Astro.props;
---
<!-- orange ball SVG (aria-hidden) + <span>Pingo Futevôlei</span>;
     text color = var(--cor-texto-claro) when variante="escuro", else var(--cor-texto). -->
```

### Header.astro (modified)

Dark sticky header using `--cor-escuro`. Layout: `BrandLogo` (as home link) on the left; nav links centered/left; orange "Criar evento" button and account icon on the right. The brand link is the only working navigation (to the single existing route). Nav links, "Criar evento", and the account icon are placeholders.

Placeholder encoding (uniform pattern, see Property P2):
- Buttons render as `<button type="button" disabled>` with `aria-label`/`title` ending in "(disponível em breve)".
- Nav/link placeholders that are semantically links render as `<a aria-disabled="true">` **without** an `href`, plus `title="… (disponível em breve)"`, and CSS `pointer-events: none` so they trigger no navigation. A shared `.placeholder` class centralizes the `cursor: not-allowed; opacity: .6` styling.

```astro
<header class="header">
  <div class="header__conteudo">
    <BrandLogo variante="escuro" comLink={true} />
    <nav class="header__nav" aria-label="Navegação principal">
      <a class="placeholder" aria-disabled="true"
         title="Eventos (disponível em breve)">Eventos</a>
      <a class="placeholder" aria-disabled="true"
         title="Como funciona (disponível em breve)">Como funciona</a>
      <a class="placeholder" aria-disabled="true"
         title="Para organizadores (disponível em breve)">Para organizadores</a>
    </nav>
    <div class="header__acoes">
      <button class="btn-destaque placeholder" type="button" disabled
              title="Criar evento (disponível em breve)">Criar evento</button>
      <button class="header__conta placeholder" type="button" disabled
              aria-label="Minha conta (disponível em breve)">
        <!-- account icon SVG, aria-hidden -->
      </button>
    </div>
  </div>
</header>
```

On narrow viewports the nav collapses (hidden) and the header keeps the brand logo + "Criar evento"; no mobile menu interaction is wired because controls are placeholders.

### Hero.astro (new)

Full-width band with a beach-sunset background image (referenced through `comBase` from `public/`), a dark gradient overlay for text contrast, the headline, subtitle, and the embedded `SearchBar`.

```astro
<section class="hero">
  <div class="hero__overlay"></div>
  <div class="hero__conteudo">
    <h1 class="hero__titulo">Encontre seu próximo <span class="hero__realce">jogo</span>.</h1>
    <p class="hero__subtitulo">{subtitulo}</p>
    <SearchBar />
  </div>
</section>
```

- `.hero__realce` is colored with `--cor-destaque` (Req 3.2).
- Background: `background-image` on `.hero`, `background-size: cover`, `background-position: center`; overlay ensures the white headline stays legible. If the background asset is missing, the overlay/solid dark fallback keeps text readable (graceful degradation).

### SearchBar.astro (new)

A card-like bar (white surface, rounded, shadow) overlapping the bottom of the hero. Three labeled filter fields and the orange submit button, all disabled.

```astro
<form class="busca" aria-label="Buscar eventos" onsubmit="return false">
  <div class="busca__campo">
    <label>Onde?</label>
    <input type="text" placeholder="Cidade ou praia" disabled
           title="Busca por local (disponível em breve)" />
  </div>
  <div class="busca__campo">
    <label>Quando?</label>
    <input type="text" placeholder="Qualquer data" disabled
           title="Busca por data (disponível em breve)" />
  </div>
  <div class="busca__campo">
    <label>Categoria</label>
    <input type="text" placeholder="Todas" disabled
           title="Busca por categoria (disponível em breve)" />
  </div>
  <button class="btn-destaque placeholder" type="button" disabled
          title="Buscar eventos (disponível em breve)">Buscar eventos</button>
</form>
```

The `<form>` carries `onsubmit="return false"` as defense-in-depth; the disabled inputs/button already prevent any real submission, and there is no backend endpoint.

### EventsSection.astro (new)

Owns data loading, ordering, and the empty state; renders the heading and the responsive grid of `EventCard`s.

```astro
---
import type { Campeonato } from "../types";
import campeonatosData from "../data/campeonatos.json";
import EventCard from "./EventCard.astro";

const campeonatos = campeonatosData as Campeonato[];

// Ascending by date; ties broken by id for a deterministic, stable order.
const ordenados = [...campeonatos].sort(
  (a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id),
);
---
<section class="eventos" aria-label="Próximos eventos">
  <h2 class="eventos__titulo">Próximos eventos</h2>
  {
    ordenados.length === 0 ? (
      <p class="eventos__vazio">Nenhum evento cadastrado no momento.</p>
    ) : (
      <div class="eventos__grid">
        {ordenados.map((c) => <EventCard campeonato={c} />)}
      </div>
    )
  }
</section>
```

Since `data` is ISO `YYYY-MM-DD`, lexicographic `localeCompare` on the string yields correct chronological order (Req 4.3). The id tiebreak guarantees a total, stable ordering even if two events share a date.

### EventCard.astro (new, replaces CampeonatoCard.astro)

Same `Props { campeonato: Campeonato }` contract. Redesign adds a date badge overlaid on the image and an orange "Ver evento" placeholder button; it reads only existing `Campeonato` fields (Req 5.8). The pt-BR date formatting reuses the current timezone-safe approach (construct a local `Date` from the parsed components so `YYYY-MM-DD` never shifts a day).

```astro
---
import type { Campeonato } from "../types";
import { comBase } from "../utils/url";

interface Props { campeonato: Campeonato; }
const { campeonato } = Astro.props;

function parcelas(iso: string) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return { ano, mes, dia, valido: !!(ano && mes && dia) };
}

const MESES_CURTOS = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];

function badge(iso: string): string {
  const { dia, mes, valido } = parcelas(iso);
  if (!valido) return iso;                   // graceful fallback for malformed data
  return `${String(dia).padStart(2, "0")} ${MESES_CURTOS[mes - 1]}`; // e.g. "13 NOV"
}

function dataPtBr(iso: string): string {
  const { ano, mes, dia, valido } = parcelas(iso);
  if (!valido) return iso;
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

const temFoto = campeonato.foto?.trim();
const temLocal = campeonato.local?.trim();
const temDescricao = campeonato.descricao?.trim();
---
<article class="event-card">
  <div class="event-card__midia">
    {temFoto
      ? <img class="event-card__img" src={comBase(campeonato.foto)}
             alt={`Foto do evento ${campeonato.nome}`} loading="lazy" decoding="async" />
      : <div class="event-card__img event-card__img--vazia" aria-hidden="true"></div>}
    <span class="event-card__badge">{badge(campeonato.data)}</span>
  </div>
  <div class="event-card__corpo">
    <h3 class="event-card__nome">{campeonato.nome}</h3>
    <p class="event-card__meta">📅 {dataPtBr(campeonato.data)}</p>
    <p class="event-card__meta">📍 {temLocal ? campeonato.local : "Local a confirmar"}</p>
    <p class="event-card__descricao">
      {temDescricao ? campeonato.descricao : "Descrição em breve."}
    </p>
    <button class="btn-destaque placeholder event-card__cta" type="button" disabled
            title="Ver evento (disponível em breve)">Ver evento</button>
  </div>
</article>
```

Placeholder handling for empty fields: missing `foto` renders a neutral placeholder block; empty `local`/`descricao` render short placeholder text. The current dataset has all fields populated, so these paths are defensive and introduce no new data fields.

### Footer.astro (new)

Dark band mirroring the header zone. `BrandLogo` (dark variant), tagline, a group of informational links, and social icons (Instagram, YouTube) — all placeholders.

```astro
<footer class="footer">
  <div class="footer__conteudo">
    <div class="footer__marca">
      <BrandLogo variante="escuro" />
      <p class="footer__tagline">Conectando a comunidade do futevôlei</p>
    </div>
    <nav class="footer__links" aria-label="Links do rodapé">
      <a class="placeholder" aria-disabled="true"
         title="Sobre o Pingo (disponível em breve)">Sobre o Pingo</a>
      <a class="placeholder" aria-disabled="true"
         title="Termos de uso (disponível em breve)">Termos de uso</a>
      <a class="placeholder" aria-disabled="true"
         title="Privacidade (disponível em breve)">Privacidade</a>
    </nav>
    <div class="footer__social">
      <button class="placeholder" type="button" disabled
              aria-label="Instagram (disponível em breve)"><!-- IG icon --></button>
      <button class="placeholder" type="button" disabled
              aria-label="YouTube (disponível em breve)"><!-- YT icon --></button>
    </div>
  </div>
</footer>
```

## Responsive Strategy

The 480px feed cap is removed. Content centers within `--largura-conteudo` (1200px) with horizontal padding that shrinks on mobile. Breakpoints match the reference:

| Breakpoint | Events_Section grid | Header | Hero / SearchBar |
|------------|--------------------|--------|------------------|
| `>= 1024px` (desktop) | 4 columns | full nav + actions visible | headline large; SearchBar horizontal (3 fields + button in a row) |
| `768px – 1023px` (tablet) | 2 columns | actions visible, nav may condense | SearchBar horizontal or wrapped |
| `< 768px` (mobile) | 1 column | brand + "Criar evento"; nav hidden | headline scaled down; SearchBar stacks fields vertically |

Implementation uses CSS Grid for the events grid:

```css
.eventos__grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: 1fr;            /* mobile default: single column */
}
@media (min-width: 768px) {
  .eventos__grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 1024px) {
  .eventos__grid { grid-template-columns: repeat(4, 1fr); }
}
```

Hero uses flex/grid that reflows the SearchBar fields from a row to a stacked column below 768px. All breakpoints are driven by `min-width` media queries in scoped component styles, with shared tokens in the global stylesheet.

## Data Models

No changes. The existing contract is reused verbatim:

```ts
interface Campeonato {
  id: string;        // used for tiebreak ordering and future detail URLs
  nome: string;
  data: string;      // ISO YYYY-MM-DD
  local: string;
  foto: string;      // path relative to public/
  descricao: string;
}
```

`src/types.ts` and `src/data/campeonatos.json` are frozen (Req 8.1, 8.2). No category/price fields are added (Req 5.8).

## Error Handling

This is a static, data-driven presentation layer; "errors" are degenerate inputs handled gracefully:

- **Empty dataset**: `EventsSection` renders the empty-state message and no grid (Req 4.5).
- **Malformed `data`**: `badge()` and `dataPtBr()` fall back to returning the raw string rather than throwing or showing `Invalid Date`.
- **Empty `foto` / `local` / `descricao`**: `EventCard` renders neutral placeholders instead of broken images or blank regions.
- **Missing hero background asset**: the dark overlay/solid fallback keeps the headline legible.
- **Placeholder controls**: disabled attributes plus `pointer-events: none` (for anchor placeholders) and `onsubmit="return false"` (SearchBar form) ensure no navigation, submission, or action occurs.

There is no runtime data fetching, so there are no network error paths.

## Testing Strategy

**Dual approach.** Property tests cover input-varying logic (ordering, field rendering, date derivation, the no-green and placeholder invariants); example/edge/smoke tests cover fixed rendering, breakpoints, and repository/build invariants.

- Static assertions over source/rendered output for palette tokens, absence of `#0b8a4f`, absence of a `prefers-color-scheme` dark override, removal of the 480px page cap, and the responsive grid rules (1 / 2 / 4 columns).
- Component render tests for Header/Hero/SearchBar/Footer label and structure checks, and the empty-state edge case.
- Smoke checks that `types.ts` and `campeonatos.json` are unchanged and that `astro build` succeeds in `output: "static"` with a single route.
- Property tests run a minimum of 100 iterations each and are tagged **Feature: pingo-rebrand, Property {number}: {property_text}**.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Green accent is fully removed

*For all* rendered source and built output files of the Site, the literal color `#0b8a4f` (and its former dark-mode variant) SHALL NOT appear, and the accent color resolves to the PINGO orange token.

**Validates: Requirements 1.1, 1.3, 1.4**

### Property 2: All placeholder controls are inert and marked unavailable

*For any* interactive-looking control rendered as a placeholder (navigation entries, "Criar evento", account icon, Search_Bar filter fields, "Buscar eventos", "Ver evento", footer links, social icons), the control SHALL be non-functional — disabled (or `aria-disabled` with no `href` and `pointer-events: none`) — and SHALL expose the "disponível em breve" affordance, producing no navigation or action when activated.

**Validates: Requirements 2.6, 3.6, 5.7, 6.6**

### Property 3: Events are completely rendered in ascending date order

*For any* list of Campeonato records, the Events_Section SHALL render exactly one Event_Card per record (the rendered set is a permutation of the input), ordered non-decreasingly by the `data` field with ties broken by ascending `id`.

**Validates: Requirements 4.2, 4.3**

### Property 4: Event_Card renders every Campeonato field

*For any* Campeonato record, its Event_Card SHALL present the `nome`, the `local`, the `descricao`, and the `foto` (as the card image via a base-aware URL), such that each field value is derivable from the rendered card.

**Validates: Requirements 5.1, 5.3, 5.5, 5.6**

### Property 5: Date badge matches the event date

*For any* Campeonato with a valid ISO `data`, the date badge overlaid on the Event_Card image SHALL show the day and month corresponding exactly to the parsed `data` components, independent of the server/runtime timezone.

**Validates: Requirements 5.2**

### Property 6: pt-BR date formatting matches the event date

*For any* Campeonato with a valid ISO `data`, the formatted pt-BR date shown on the Event_Card SHALL correspond exactly to the parsed `data` components (no off-by-one day caused by timezone handling).

**Validates: Requirements 5.4**
