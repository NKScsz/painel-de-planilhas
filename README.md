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

## Como é feito

Um único arquivo, `Painel de Planilhas.html`, sem etapa de build:

- Chart.js para os gráficos;
- SheetJS para ler planilhas;
- jsPDF e PptxGenJS para PDF e PowerPoint;
- Firebase Authentication (login com Google) e Cloud Firestore, onde cada pessoa vê só as próprias planilhas (ver `firestore.rules`);
- service worker (`sw.js`) e `manifest.webmanifest` para instalar como app.

## Rodar localmente

Sirva a pasta com qualquer servidor estático e abra o arquivo principal. O login com Google só funciona num endereço `http(s)`, não abrindo o arquivo direto:

```bash
npx serve .
```

Sem login, o botão "Ver demonstração sem conta" abre o app com dados fictícios.

## Usar com o seu próprio Firebase

1. Crie um projeto em https://console.firebase.google.com.
2. Ative o login com Google em Authentication e crie um banco no Cloud Firestore.
3. Troque o objeto `FIREBASE_CONFIG`, no começo do `<script>` do arquivo principal, pelos dados do seu app web.
4. Publique as regras e o site:

```bash
firebase deploy --only firestore:rules,hosting --project SEU_PROJETO
```

A chave `apiKey` do `FIREBASE_CONFIG` não é secreta: ela identifica o projeto no navegador. Quem protege os dados são as regras do Firestore.
