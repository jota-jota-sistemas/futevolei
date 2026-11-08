# Requirements Document

## Introduction

This feature is a complete visual rebrand of the existing static Astro futevôlei site to the PINGO brand ("Pingo Futevôlei"). The current site is an Instagram-style single-column feed (max-width 480px) with a green accent (#0b8a4f), a header showing a 🏐 logo with the text "futevôlei" and a disabled search button, and championship cards with photo, name, date, location, description and a disabled "save" button. The site currently supports automatic dark mode via `prefers-color-scheme`.

The rebrand reconstructs the page to mirror the PINGO reference design: a dark header with navigation and an orange "Criar evento" button, a hero section with a background image and a search bar, a multi-column "Próximos eventos" section, and a dark footer. The PINGO palette (vibrant orange accent, cream body background, dark header/footer, white cards) replaces the current green theme, and dark mode is removed in favor of a single fixed palette.

This is a presentation-layer change only. The data model (`src/types.ts`) and data (`src/data/campeonatos.json`) are not modified, no new structured fields are introduced, and all interactive controls (search, filters, navigation links, "Ver evento", "Criar evento") are visual placeholders without real functionality, following the existing "disponível em breve" (available soon) pattern. The site remains a static Astro build with no backend and no new routes.

## Glossary

- **Site**: The static Astro futevôlei website being rebranded to the PINGO brand.
- **PINGO_Palette**: The fixed color palette consisting of vibrant orange as the primary/accent color, a cream/off-white body background, dark (black/dark gray) header and footer, and white cards.
- **Header**: The sticky top navigation bar of the Site, rebranded to the dark PINGO style with brand logo, navigation links, a "Criar evento" button, and an account icon.
- **Hero**: The top section of the home page containing a background image, a large headline, a subtitle, and a search bar.
- **Search_Bar**: The visual search control within the Hero containing the "Onde?", "Quando?", and "Categoria" filter fields and the "Buscar eventos" button.
- **Events_Section**: The "Próximos eventos" section of the home page that renders the list of championships as a multi-column grid of cards.
- **Event_Card**: An individual card within the Events_Section displaying a championship's photo with a date badge, name, date, location, and a "Ver evento" button.
- **Footer**: The dark bottom section of the Site containing the brand logo, the tagline, informational links, and social icons.
- **Brand_Logo**: The PINGO brand mark, consisting of a stylized futevôlei ball rendered in orange alongside dark "Pingo Futevôlei" text.
- **Disabled_Control**: Any interactive-looking control that presents the reference visual style but performs no action and is marked as unavailable, following the existing "disponível em breve" pattern.
- **Campeonato**: An existing championship data record with the fields `id`, `nome`, `data`, `local`, `foto`, and `descricao`.

## Requirements

### Requirement 1: PINGO Visual Identity

**User Story:** As a visitor, I want the Site to use the PINGO visual identity, so that the brand is consistent across the whole experience.

#### Acceptance Criteria

1. THE Site SHALL apply the PINGO_Palette on every page, using vibrant orange as the primary and accent color, a cream/off-white body background, dark header and footer, and white cards.
2. THE Site SHALL display the Brand_Logo as a stylized futevôlei ball rendered in orange together with the text "Pingo Futevôlei".
3. THE Site SHALL remove the automatic dark mode behavior and render the PINGO_Palette regardless of the operating system `prefers-color-scheme` setting.
4. THE Site SHALL remove the previous green accent color (#0b8a4f) from all rendered elements.

### Requirement 2: Rebranded Header

**User Story:** As a visitor, I want a rebranded header with navigation, so that I can see the PINGO navigation structure and primary action.

#### Acceptance Criteria

1. THE Header SHALL render with a dark background consistent with the PINGO_Palette.
2. THE Header SHALL display the Brand_Logo linking to the home page.
3. THE Header SHALL display navigation entries labeled "Eventos", "Como funciona", and "Para organizadores".
4. THE Header SHALL display an orange button labeled "Criar evento".
5. THE Header SHALL display an account icon.
6. THE Header SHALL render the navigation entries, the "Criar evento" button, and the account icon as Disabled_Controls.

### Requirement 3: Hero Section with Search Bar

**User Story:** As a visitor, I want a hero section with a search bar, so that the landing experience matches the PINGO reference.

#### Acceptance Criteria

1. THE Hero SHALL display a background image of futevôlei on the beach at sunset.
2. THE Hero SHALL display the headline "Encontre seu próximo jogo." with the word "jogo" visually emphasized in orange.
3. THE Hero SHALL display a subtitle below the headline.
4. THE Hero SHALL display the Search_Bar containing filter fields labeled "Onde?", "Quando?", and "Categoria".
5. THE Hero SHALL display an orange button labeled "Buscar eventos" within the Search_Bar.
6. THE Hero SHALL render the Search_Bar filter fields and the "Buscar eventos" button as Disabled_Controls.

### Requirement 4: Upcoming Events Section

**User Story:** As a visitor, I want to see upcoming events as styled cards, so that I can browse championships in the new PINGO look.

#### Acceptance Criteria

1. THE Events_Section SHALL display the heading "Próximos eventos".
2. THE Events_Section SHALL render each Campeonato as an Event_Card.
3. THE Events_Section SHALL order the Event_Cards by the `data` field in ascending order so that the earliest championship appears first.
4. WHERE the viewport width allows multiple columns, THE Events_Section SHALL arrange the Event_Cards in a multi-column grid.
5. IF no Campeonato records exist, THEN THE Events_Section SHALL display an empty-state message.

### Requirement 5: Event Card Details

**User Story:** As a visitor, I want each event card to show the championship details in the PINGO style, so that I can read the relevant information at a glance.

#### Acceptance Criteria

1. THE Event_Card SHALL display the Campeonato `foto` as the card image.
2. THE Event_Card SHALL display a date badge overlaid on the card image, derived from the Campeonato `data` field.
3. THE Event_Card SHALL display the Campeonato `nome`.
4. THE Event_Card SHALL display the Campeonato `data` formatted for pt-BR.
5. THE Event_Card SHALL display the Campeonato `local`.
6. THE Event_Card SHALL display the Campeonato `descricao`.
7. THE Event_Card SHALL display an orange button labeled "Ver evento" rendered as a Disabled_Control.
8. THE Event_Card SHALL render using only the existing Campeonato fields (`nome`, `data`, `local`, `descricao`, `foto`) and SHALL NOT introduce category tags or price blocks backed by new structured data.

### Requirement 6: Branded Footer

**User Story:** As a visitor, I want a branded footer, so that I can find brand information and secondary links.

#### Acceptance Criteria

1. THE Footer SHALL render with a dark background consistent with the PINGO_Palette.
2. THE Footer SHALL display the Brand_Logo.
3. THE Footer SHALL display the tagline "Conectando a comunidade do futevôlei".
4. THE Footer SHALL display links labeled "Sobre o Pingo", "Termos de uso", and "Privacidade".
5. THE Footer SHALL display social media icons.
6. THE Footer SHALL render the links and social media icons as Disabled_Controls.

### Requirement 7: Responsive Layout

**User Story:** As a visitor on any device, I want the layout to adapt to my screen size, so that the Site is usable on mobile and desktop.

#### Acceptance Criteria

1. THE Site SHALL render a responsive layout that adapts the Hero and the Events_Section to the viewport width.
2. WHILE the viewport is at desktop width, THE Events_Section SHALL display the Event_Cards across multiple columns.
3. WHILE the viewport is at mobile width, THE Events_Section SHALL display the Event_Cards in a single column.
4. THE Site SHALL remove the previous 480px single-column maximum-width constraint from the overall page layout.

### Requirement 8: Preserved Data Contract

**User Story:** As a developer, I want the rebrand to preserve the existing data contract, so that content and types remain unchanged.

#### Acceptance Criteria

1. THE Site SHALL leave the `src/types.ts` Campeonato interface unchanged.
2. THE Site SHALL leave the `src/data/campeonatos.json` content unchanged.
3. THE Site SHALL remain a static Astro build with no backend and no new routes.
