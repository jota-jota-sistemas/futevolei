# Preferências de execução

Projeto de **baixo risco**: vitrine estática de campeonatos de futevôlei (Fase 1), sem backend, sem dados sensíveis, sem ambiente de produção crítico. O repositório é versionado no GitHub e o deploy é automático via GitHub Pages.

## Pode executar sem pedir confirmação

Comandos de rotina de desenvolvimento são seguros neste projeto e devem ser executados direto, sem parar para pedir aprovação:

- **npm:** `npm install`, `npm run dev`, `npm run build`, `npm run preview`, `npm run astro ...`
- **git (não destrutivo):** `git status`, `git add <arquivos>`, `git commit`, `git push origin main`, `git pull`, `git log`, `git diff`, `git branch`, `git tag`
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
