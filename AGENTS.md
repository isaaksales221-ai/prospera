# AGENTS.md — Prospera

Aplicativo web de finanças pessoais multiusuário (PT-BR): lançamentos manuais, dívidas, metas, insights personalizados e relatórios mensais de fechamento.

## Stack
- HTML + CSS + JavaScript vanilla. **Sem build, sem dependências, sem npm.**
- Persistência 100% local via `localStorage`; senhas com hash PBKDF2 (Web Crypto).
- Fontes externas (Google Fonts: Fraunces, Newsreader) com fallback serif; funciona offline.

## Como rodar
Servir a pasta por HTTP (necessário para `crypto.subtle` e carregamento dos scripts):

```bash
python3 -m http.server 4321 --directory .
```

Acesse `http://localhost:4321/index.html`. Não há passo de build, teste ou lint.

## Navegação
- `index.html` — shell (telas de auth + app) e ordem de carregamento dos scripts.
- `styles.css` — design system "almanaque editorial" (tokens em `:root`).
- `js/store.js` — camada de dados, criptografia de senha, categorias e helpers (BRL/datas).
- `js/auth.js` — telas de login/registro.
- `js/charts.js` — gráficos SVG (rosca, barras, sparkline), sem libs.
- `js/insights.js` — motor que avalia a situação financeira e gera o score + recomendações.
- `js/reports.js` — relatórios mensais (geração automática no fim do mês).
- `js/app.js` — orquestra views, navegação, modais e interações.

## Convenções
- Os scripts são `<script>` clássicos (não ES modules) carregados em ordem em `index.html`; cada arquivo expõe um objeto global (`Store`, `Auth`, `Charts`, `Insights`, `Reports`, `App`). Mantenha esse padrão para funcionar via `file://`.
- Nomes de classe CSS são contrato com o JS — ao redesenhar o visual, preserve os nomes e altere só `:root`/regras.
- Toda string visível ao usuário é PT-BR; valores monetários via `fmtBRL`.
