# Implementation Plan: PINGO Rebrand

## Overview

This plan rebuilds the presentation layer of the static Astro futevôlei site into the PINGO brand. It proceeds bottom-up: first the global PINGO design tokens and the shared `BrandLogo` mark, then the dark header and footer that reuse those tokens, then the hero/search-bar and the events grid, and finally wiring everything together in `index.astro` and removing the superseded components. The data contract (`types.ts`, `campeonatos.json`) stays frozen throughout. Property tests validate the input-varying invariants (no green, inert placeholders, ordering, field rendering, date derivation); example/edge/smoke tests cover fixed rendering, breakpoints, and build invariants.

## Tasks

- [ ] 1. Establish PINGO design tokens and fixed palette in Layout.astro
  - Replace the green token palette on `:root` with the PINGO orange/cream/dark tokens (`--cor-destaque`, `--cor-destaque-forte`, `--cor-destaque-suave`, `--cor-fundo`, `--cor-superficie`, `--cor-borda`, `--cor-escuro`, `--cor-escuro-2`, `--cor-borda-escura`, `--cor-texto`, `--cor-texto-suave`, `--cor-texto-claro`, `--cor-texto-claro-suave`) in the global `<style is:global>` block
  - Add `--largura-conteudo: 1200px` and `--raio-card: 16px`; pin `color-scheme: light`
  - Remove the `@media (prefers-color-scheme: dark)` override entirely and switch the `:focus-visible` outline to `--cor-destaque`
  - Remove the 480px single-column max-width assumption from the page layout; update `<title>`/`<meta description>` to PINGO
  - Add a shared `.btn-destaque` and `.placeholder` (`cursor: not-allowed; opacity: .6; pointer-events: none`) utility in the global stylesheet
  - _Requirements: 1.1, 1.3, 1.4, 7.4_

- [ ] 2. Build the reusable BrandLogo component
  - [ ] 2.1 Create src/components/BrandLogo.astro
    - Implement `Props { variante?: "claro" | "escuro"; comLink?: boolean }` with defaults `"claro"` / `false`
    - Render an inline orange ball SVG filled with `--cor-destaque` (`aria-hidden`) next to a `<span>Pingo Futevôlei</span>` textual fallback
    - Switch text color to `--cor-texto-claro` when `variante="escuro"`, else `--cor-texto`; wrap in `<a href={comBase("/")}>` when `comLink` is true (import `comBase` from `../utils/url`)
    - _Requirements: 1.2_

- [ ] 3. Rebrand the Header component
  - [ ] 3.1 Modify src/components/Header.astro to the dark PINGO header
    - Dark sticky header using `--cor-escuro`; mount `BrandLogo variante="escuro" comLink={true}` as the only working link
    - Add nav with placeholder anchors "Eventos", "Como funciona", "Para organizadores" as `<a class="placeholder" aria-disabled="true" title="… (disponível em breve)">` with no `href`
    - Add orange "Criar evento" `<button class="btn-destaque placeholder" type="button" disabled>` and an account-icon `<button class="placeholder" type="button" disabled aria-label="Minha conta (disponível em breve)">`
    - Add scoped responsive styles: hide nav below 768px, keep brand + "Criar evento"
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 3.2 Write property test for header placeholder controls
    - **Property 2: All placeholder controls are inert and marked unavailable**
    - **Validates: Requirements 2.6**
    - Assert each header placeholder is `disabled` (buttons) or `aria-disabled` + no `href` + `pointer-events: none` (anchors) and carries "disponível em breve"

- [ ] 4. Build the Footer component
  - [ ] 4.1 Create src/components/Footer.astro
    - Dark band using `--cor-escuro`; mount `BrandLogo variante="escuro"`
    - Render tagline "Conectando a comunidade do futevôlei"
    - Render placeholder link anchors "Sobre o Pingo", "Termos de uso", "Privacidade" (`aria-disabled`, no `href`, "disponível em breve" title)
    - Render placeholder social icon buttons (Instagram, YouTube) as `disabled` with `aria-label` ending in "(disponível em breve)"
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 4.2 Write property test for footer placeholder controls
    - **Property 2: All placeholder controls are inert and marked unavailable**
    - **Validates: Requirements 6.6**
    - Assert footer links and social icons are inert (disabled / `aria-disabled` + no `href` + `pointer-events: none`) and expose "disponível em breve"

- [ ] 5. Mount Footer in Layout and verify global palette
  - [ ] 5.1 Wire Footer into Layout.astro
    - Import and render `Footer` after the `<slot />`/`<main>` so every page gets the footer
    - _Requirements: 6.1_

  - [ ]* 5.2 Write property test for green accent removal
    - **Property 1: Green accent is fully removed**
    - **Validates: Requirements 1.1, 1.3, 1.4**
    - Scan source (and, where available, built output) files asserting `#0b8a4f` never appears, no `prefers-color-scheme` dark override remains, and the accent resolves to the PINGO orange token

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Build the SearchBar component
  - [ ] 7.1 Create src/components/SearchBar.astro
    - White card-like `<form aria-label="Buscar eventos" onsubmit="return false">` with three labeled, `disabled` filter fields "Onde?", "Quando?", "Categoria" (each `title` ending "(disponível em breve)")
    - Orange "Buscar eventos" `<button class="btn-destaque placeholder" type="button" disabled>`
    - Scoped styles that lay fields out in a row on desktop and stack them vertically below 768px
    - _Requirements: 3.4, 3.5, 3.6_

  - [ ]* 7.2 Write property test for SearchBar placeholder controls
    - **Property 2: All placeholder controls are inert and marked unavailable**
    - **Validates: Requirements 3.6**
    - Assert the three filter fields and "Buscar eventos" are `disabled` and expose "disponível em breve", and the form cannot submit

- [ ] 8. Build the Hero component
  - [ ] 8.1 Create src/components/Hero.astro
    - Full-width band with a beach-sunset `background-image` (via `comBase` from `public/`), `cover`/`center`, and a dark gradient overlay for contrast with a solid dark fallback
    - Headline "Encontre seu próximo <span class="hero__realce">jogo</span>." with `.hero__realce` colored `--cor-destaque`; subtitle below
    - Embed `SearchBar`; add scoped responsive styles (headline scales down below 768px)
    - _Requirements: 3.1, 3.2, 3.3, 7.1_

  - [ ]* 8.2 Write render test for Hero structure
    - Assert the headline text, orange-emphasized "jogo", presence of subtitle and embedded SearchBar
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 9. Build the EventCard component (replaces CampeonatoCard)
  - [ ] 9.1 Create src/components/EventCard.astro
    - Keep `Props { campeonato: Campeonato }`; import `comBase` from `../utils/url` and `Campeonato` from `../types`
    - Implement timezone-safe `parcelas(iso)`, `badge(iso)` (e.g. "13 NOV" via `MESES_CURTOS`), and `dataPtBr(iso)` (via local `Date` + `toLocaleDateString("pt-BR", …)`), each falling back to the raw string on malformed input
    - Render image via `comBase(campeonato.foto)` with a neutral placeholder when `foto` is empty, the date badge overlaid on the image, `nome`, pt-BR `data`, `local` (placeholder when empty), `descricao` (placeholder when empty)
    - Add orange "Ver evento" `<button class="btn-destaque placeholder" type="button" disabled>`; read only existing fields (no category/price)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [ ]* 9.2 Write property test for EventCard field rendering
    - **Property 4: Event_Card renders every Campeonato field**
    - **Validates: Requirements 5.1, 5.3, 5.5, 5.6**
    - For arbitrary Campeonato records, assert `nome`, `local`, `descricao`, and the base-aware `foto` URL are all derivable from the rendered card

  - [ ]* 9.3 Write property test for date badge derivation
    - **Property 5: Date badge matches the event date**
    - **Validates: Requirements 5.2**
    - For arbitrary valid ISO dates, assert the badge day/month match the parsed components regardless of runtime timezone

  - [ ]* 9.4 Write property test for pt-BR date formatting
    - **Property 6: pt-BR date formatting matches the event date**
    - **Validates: Requirements 5.4**
    - For arbitrary valid ISO dates, assert the pt-BR formatted date matches the parsed components with no off-by-one day

  - [ ]* 9.5 Write unit test for EventCard placeholder CTA and empty-field fallbacks
    - **Property 2: All placeholder controls are inert and marked unavailable** (Validates: Requirements 5.7)
    - Also test neutral image/local/descricao placeholders for empty inputs
    - _Requirements: 5.7, 5.8_

- [ ] 10. Build the EventsSection component (replaces Feed)
  - [ ] 10.1 Create src/components/EventsSection.astro
    - Own the data import of `campeonatos.json` typed as `Campeonato[]`
    - Render heading "Próximos eventos"; sort ascending by `data` with id tiebreak (`a.data.localeCompare(b.data) || a.id.localeCompare(b.id)`) over a copy
    - Render a responsive CSS Grid of `EventCard`s (1 col mobile default, 2 cols `>=768px`, 4 cols `>=1024px`) centered within `--largura-conteudo`
    - Render an empty-state message when there are no records
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 7.1, 7.2, 7.3_

  - [ ]* 10.2 Write property test for complete ascending-order rendering
    - **Property 3: Events are completely rendered in ascending date order**
    - **Validates: Requirements 4.2, 4.3**
    - For arbitrary record lists, assert the rendered cards are a permutation of the input ordered non-decreasingly by `data` with ascending `id` tiebreak

  - [ ]* 10.3 Write edge test for the empty-state and responsive grid rules
    - Assert the empty dataset renders the empty-state message and no grid
    - Assert the grid CSS declares 1 / 2 / 4 columns at the mobile / `>=768px` / `>=1024px` breakpoints
    - _Requirements: 4.5, 7.2, 7.3_

- [ ] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Compose the home page and remove superseded components
  - [ ] 12.1 Rewrite src/pages/index.astro to compose Hero + EventsSection inside Layout
    - Import `Layout`, `Hero`, `EventsSection`; render `Hero` then `EventsSection` as the page body, keeping the page purely compositional
    - _Requirements: 7.1_

  - [ ] 12.2 Remove Feed.astro and CampeonatoCard.astro
    - Delete `src/components/Feed.astro` and `src/components/CampeonatoCard.astro`; confirm no remaining imports reference them
    - _Requirements: 8.3_

  - [ ]* 12.3 Write smoke test for frozen data contract and static build
    - Assert `src/types.ts` and `src/data/campeonatos.json` are unchanged, and `astro build` succeeds in `output: "static"` with a single route
    - _Requirements: 8.1, 8.2, 8.3_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP, but they validate the design's correctness properties and should be implemented for full coverage.
- Each task references specific requirements/properties for traceability.
- Property tests run a minimum of 100 iterations and are tagged **Feature: pingo-rebrand, Property {number}: {property_text}** per the design testing strategy.
- The data contract (`types.ts`, `campeonatos.json`) and `astro.config.mjs` output mode remain frozen.
- All interactive controls stay as inert "disponível em breve" placeholders.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1"] },
    { "id": 1, "tasks": ["3.1", "4.1", "7.1", "9.1"] },
    { "id": 2, "tasks": ["3.2", "4.2", "5.1", "7.2", "8.1", "9.2", "9.3", "9.4", "9.5", "10.1"] },
    { "id": 3, "tasks": ["5.2", "8.2", "10.2", "10.3", "12.1", "12.2"] },
    { "id": 4, "tasks": ["12.3"] }
  ]
}
```
