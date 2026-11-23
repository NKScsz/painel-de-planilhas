# Painel de Planilhas

Transforma planilhas, extratos e faturas em PDF em gráficos explicados, metas e relatórios prontos para enviar.

**No ar:** https://projeto-planilhas-df717.web.app

## O que faz

- **Lê vários formatos:** Excel, CSV, ODS, Google Sheets, extratos e faturas em PDF e fotos de tabelas.
- **Arruma os dados:** remove linhas de total, cabeçalhos repetidos e linhas vazias, corrige tipos e padroniza nomes escritos de jeitos diferentes.
- **Monta os gráficos sozinho,** de acordo com o tipo de dado: linha, barras, empilhadas, rosca, funil, mapa do Brasil e tabela resumo. Cada gráfico vem com uma explicação curta.
- **Acompanha metas e limites** no ritmo do mês e avisa quando algo foge do padrão.
- **Gera relatórios:** PDF explicado, PowerPoint editável e envio pelo WhatsApp, com logo e cor da empresa.
- **Compartilha:** modo TV em tela cheia e link somente leitura para clientes.
- **Ferramentas avançadas:** consulta SQL entre planilhas, colunas com fórmula, histórico de versões e dados públicos de CNPJ e CEP.
- **Instalável** no celular e no computador (PWA).

## Tecnologia

- [Vite](https://vite.dev) para desenvolvimento e build, com JavaScript em módulos ES e **TypeScript** (migração gradual: `allowJs`, os módulos novos e os de base já são `.ts`).
- Chart.js (gráficos), SheetJS (planilhas), jsPDF e PptxGenJS (PDF e PowerPoint), carregados por CDN no `index.html`.
- Firebase Authentication (login com Google) e Cloud Firestore. Cada pessoa vê só as próprias planilhas (ver `firestore.rules`).
- Service worker (`public/sw.js`) e `manifest.webmanifest` para instalar como app e abrir sem internet.
- **Testes:** Vitest (unidade) e Playwright (ponta a ponta, no computador e no celular).
- **GitHub Actions:** a cada envio, roda tipos, lint e testes; na `main`, publica no Firebase Hosting.

## Estrutura

```
index.html              marcação da página (o app é montado pelo JavaScript)
src/
  main.js               ponto de entrada: estilos, módulos e o que roda ao abrir
  config/               configuração do Firebase
  core/                 estado, utilidades (TS), conversão de valores (TS), armazenamento
  app/                  inicialização, login, renderização, janelas
  import/               leitura de planilhas, PDFs, imagens e upload
  charts/               escolha automática, desenho dos gráficos, PDF e tipos extras
  views/                telas: início, dados, gráficos, relatórios, apresentação, perfil…
  features/             metas, comparação, tendência, compartilhamento, SQL, modo TV…
  easy/                 recursos para iniciantes: modo simples, ajuda, resumo, perguntas prontas
  styles/               CSS em camadas, na ordem de index.css
public/                 ícones, manifest, service worker, robots e sitemap (copiados como estão)
tests/unit/             testes de unidade (Vitest)
tests/e2e/              testes de ponta a ponta (Playwright)
```

## Comandos

```bash
npm install            # uma vez
npm run dev            # servidor local com recarga automática
npm run check          # tipos + lint + testes de unidade + build
npm run e2e            # testes de ponta a ponta (instale o navegador: npx playwright install chromium)
npm run deploy         # check + publica no Firebase Hosting
```

Sem login, o botão "Ver demonstração sem conta" abre o app com dados fictícios. Os testes de ponta a ponta usam esse caminho.

## Publicação automática

O workflow `.github/workflows/ci.yml` roda os testes em todo push e pull request. Para ele também publicar o site, adicione o segredo `FIREBASE_SERVICE_ACCOUNT` no repositório, com a chave JSON de uma conta de serviço do Firebase (Console do Firebase > Configurações do projeto > Contas de serviço > Gerar nova chave privada). Pull requests ganham uma prévia temporária com link.

## Usar com o seu próprio Firebase

1. Crie um projeto em https://console.firebase.google.com, ative o login com Google e crie um banco no Cloud Firestore.
2. Troque o objeto `FIREBASE_CONFIG` em `src/config/firebase-config.js` pelos dados do seu app web.
3. Publique as regras e o site: `firebase deploy --only firestore:rules,hosting --project SEU_PROJETO`.

A chave `apiKey` do `FIREBASE_CONFIG` não é secreta: ela identifica o projeto no navegador. Quem protege os dados são as regras do Firestore.
