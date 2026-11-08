# Preferências de execução

Projeto de **baixo risco**: vitrine estática de campeonatos de futevôlei (Fase 1), sem backend, sem dados sensíveis, sem ambiente de produção crítico. O repositório é versionado no GitHub e o deploy é automático via GitHub Pages.

## Fluxo de contribuição (obrigatório)

A branch `main` é **protegida**: push direto é rejeitado pelo servidor. Toda alteração precisa ir por **branch + Pull Request**.

Fluxo padrão para qualquer mudança:

1. Partir da `main` atualizada: `git checkout main && git pull`.
2. Criar uma branch com nome descritivo: `git checkout -b <tipo>/<descricao>` (ex.: `feat/novo-campeonato`, `docs/ajuste-readme`, `fix/corrige-base`).
3. Commitar na branch e empurrar: `git push -u origin <branch>`.
4. Abrir um **Pull Request** para a `main` (via `gh pr create` se o GitHub CLI estiver disponível; senão, informar o link para abrir na interface).
5. O merge na `main` acontece pelo PR (após revisão/aprovação), não por push direto.

**Nunca** fazer `git push origin main` nem commitar direto na `main` — o servidor vai recusar e o fluxo correto é sempre via PR.

## Pode executar sem pedir confirmação

Comandos de rotina de desenvolvimento são seguros neste projeto e devem ser executados direto, sem parar para pedir aprovação:

- **npm:** `npm install`, `npm run dev`, `npm run build`, `npm run preview`, `npm run astro ...`
- **git (não destrutivo):** `git status`, `git add <arquivos>`, `git commit`, `git checkout -b <branch>`, `git push -u origin <branch>` (branch de trabalho, nunca a `main`), `git pull`, `git log`, `git diff`, `git branch`, `git tag`
- **PR:** `gh pr create`, `gh pr view` (se o GitHub CLI estiver instalado)
- **leitura/inspeção:** listar arquivos, ler conteúdo, buscar, checar versões

Editar, criar e mover arquivos dentro do projeto também é livre.

## Continue pedindo confirmação

Mesmo sendo um projeto pequeno, confirme antes de ações com risco real ou difícil de reverter:

- Remoções em massa (`rm -rf` de pastas, apagar vários arquivos de uma vez)
- Operações git destrutivas: `git push --force`, `git reset --hard`, `git clean -fd`, `git branch -D`, reescrever histórico
- Mudar configuração global do git (`git config --global`)
- Instalar dependências com nome incomum/suspeito ou de fontes não oficiais
- Qualquer coisa que envie código ou dados do projeto para serviços externos não solicitados

## Observações

- Preferir commits novos a `--amend`.
- Ao preparar commits, adicionar arquivos por nome em vez de `git add .`.
- Não pular hooks de git (`--no-verify`) sem pedir.
