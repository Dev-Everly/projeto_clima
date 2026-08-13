# 🌤️ App de Previsão do Tempo

Aplicação simples de previsão do tempo, com **backend em JavaScript puro** (sem frameworks) e **frontend em HTML/CSS/JS puro**, consumindo dados em tempo real da [API pública Open-Meteo](https://open-meteo.com/).

## 📋 Índice

- [Funcionalidades](#-funcionalidades)
- [Tecnologias](#-tecnologias)
- [Estrutura do projeto](#-estrutura-do-projeto)
- [Pré-requisitos](#-pré-requisitos)
- [Instalação](#-instalação)
- [Como rodar](#-como-rodar)
- [Como rodar os testes](#-como-rodar-os-testes)
- [Documentação da API interna](#-documentação-da-api-interna)
- [Tratamento de erros](#-tratamento-de-erros)
- [Licença](#-licença)

## ✨ Funcionalidades

- 🔍 Busca de clima por nome de cidade (ex: "São Paulo", "Guarulhos")
- 🌡️ Exibição do clima atual: temperatura, sensação, vento (velocidade e direção), condição do céu
- 📅 Previsão para os próximos dias, com data completa por extenso (ex: *"Segunda-feira, 13 de outubro de 2025"*)
- 🖱️ Clique em qualquer dia da previsão para ver os detalhes daquele dia específico no painel principal (vento máximo, direção predominante, chance de chuva)
- 🌙 Tema claro/escuro automático, de acordo com o horário (dia/noite) da cidade consultada
- 🎨 Ícones meteorológicos da biblioteca [Weather Icons](https://erikflowers.github.io/weather-icons/)
- 📱 Layout responsivo (funciona em desktop e mobile)
- ⚠️ Tratamento de erros dedicado para: cidade inválida, falha da API externa, e erro de rede/timeout
- ✅ Suíte de testes automatizados com Jest

## 🛠️ Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend | Node.js puro (módulos nativos `http`, `fs`, `path`, `url` + `fetch` nativa) |
| Frontend | HTML5 + CSS3 + JavaScript puro (sem frameworks) |
| Ícones | [Weather Icons](https://erikflowers.github.io/weather-icons/) (via CDN) |
| Dados meteorológicos | [Open-Meteo API](https://open-meteo.com/) (geocodificação + previsão do tempo) |
| Testes | [Jest](https://jestjs.io/) |

> **Por que sem frameworks?** Este projeto foi construído como exercício de fundamentos: nenhuma dependência de runtime é usada no backend nem no frontend — apenas os módulos nativos do Node.js e APIs padrão do navegador. O Jest é usado **apenas** como ferramenta de desenvolvimento (dependência de teste), nunca é enviado ao navegador nem roda em produção.

## 📁 Estrutura do projeto

```
projeto_clima/
├── assets/
│   ├── script.js        # Lógica do frontend (fetch, renderização, temas)
│   └── style.css         # Estilos (responsivo, tema claro/escuro)
├── tests/
│   └── api.test.js        # Testes automatizados (Jest)
├── .gitignore
├── api.js                 # Backend: servidor HTTP + integração com Open-Meteo
├── index.html              # Página principal do frontend
├── package.json
├── package-lock.json
└── README.md
```

## ✅ Pré-requisitos

- **Node.js 18 ou superior** (necessário pela `fetch` API nativa do Node)
- Conexão com a internet (para consultar a Open-Meteo)

Verifique sua versão do Node:

```bash
node --version
```

## 📦 Instalação

Na pasta raiz do projeto, instale as dependências de desenvolvimento (usadas apenas para rodar os testes):

```bash
npm install
```

## ▶️ Como rodar

```bash
node api.js
```

ou, equivalentemente:

```bash
npm start
```

Você deve ver a mensagem:

```
Servidor rodando em http://localhost:3000
```

Abra **http://localhost:3000** no navegador.

> Para parar o servidor, pressione `Ctrl + C` no terminal.

## 🧪 Como rodar os testes

Os testes usam [Jest](https://jestjs.io/) e cobrem os principais cenários de sucesso e de erro do backend, "mockando" a `fetch` para não depender de uma conexão real com a Open-Meteo durante os testes.

```bash
npm test
```

Outros comandos úteis:

```bash
npm run test:watch      # roda os testes em modo "observador" (re-executa a cada alteração)
npm run test:coverage   # gera um relatório de cobertura de código
```

### Cenários cobertos

**Casos básicos:**
- Nome de cidade válido retorna dados meteorológicos completos
- Nome de cidade inexistente lança uma exceção tratada (`cidade_invalida`)
- Entrada vazia retorna erro de validação, sem sequer chamar a API externa
- Falha da API (erro HTTP ou timeout) gera uma resposta tratada adequadamente

**Casos extremos:**
- Limite de requisições da API excedido (HTTP 429)
- Conexão de rede lenta/instável (timeout real simulado com fake timers, e falhas intermitentes)
- Mudança inesperada no formato da resposta JSON da Open-Meteo

## 📖 Documentação da API interna

### `GET /api/weather?city=<nome>`

Busca o clima atual e a previsão dos próximos dias para a cidade informada.

**Parâmetros de query:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `city` | string | Sim | Nome da cidade a ser consultada (ex: `Guarulhos`) |

**Resposta de sucesso (`200 OK`):**

```json
{
  "local": {
    "nome": "Guarulhos",
    "pais": "Brasil",
    "estado": "São Paulo",
    "latitude": -23.46,
    "longitude": -46.53
  },
  "elevacao": 749,
  "fusoHorario": "America/Sao_Paulo",
  "fusoHorarioSigla": "-03",
  "utcOffsetSegundos": -10800,
  "atual": {
    "temperature": 22.3,
    "windspeed": 8.5,
    "winddirection": 200,
    "weathercode": 2,
    "is_day": 1,
    "time": "2026-08-13T14:00"
  },
  "diario": {
    "time": ["2026-08-13", "2026-08-14"],
    "weathercode": [2, 61],
    "temperature_2m_max": [24.1, 19.8],
    "temperature_2m_min": [14.2, 13.5],
    "precipitation_probability_max": [10, 80],
    "wind_speed_10m_max": [15.2, 22.8],
    "wind_direction_10m_dominant": [180, 90]
  }
}
```

**Respostas de erro:**

| Status | `tipo` | Quando acontece |
|---|---|---|
| `400` | `cidade_invalida` | Nome de cidade vazio, muito curto, ou sem letras |
| `404` | `cidade_invalida` | Nenhuma cidade encontrada com esse nome |
| `502` | `falha_api` | A Open-Meteo respondeu com erro ou em formato inesperado |
| `503` | `erro_rede` | Falha de conexão (sem internet, DNS, etc.) |
| `504` | `erro_rede` | A Open-Meteo demorou demais para responder (timeout de 8s) |
| `500` | `erro_interno` | Erro inesperado não previsto |

Exemplo de resposta de erro:

```json
{
  "erro": "Não encontramos nenhuma cidade chamada \"xyzabc\". Verifique a grafia e tente novamente.",
  "tipo": "cidade_invalida"
}
```

### Demais rotas

Qualquer outra rota `GET` é tratada como pedido de arquivo estático, servido a partir da raiz do projeto (`index.html`, `/assets/style.css`, `/assets/script.js`).

### Documentação interna das funções (JSDoc)

Todas as funções do `api.js` estão documentadas em formato [JSDoc](https://jsdoc.app/) diretamente no código-fonte, incluindo parâmetros, valores de retorno, exceções lançadas e exemplos de uso. Para gerar a documentação em HTML a partir dessas anotações:

```bash
npx jsdoc api.js -d docs
```

Isso cria uma pasta `docs/` com a documentação navegável em HTML.

## ⚠️ Tratamento de erros

O backend usa uma classe de erro customizada (`WeatherError`) para diferenciar 3 categorias de falha, cada uma com seu próprio status HTTP e mensagem amigável:

1. **`cidade_invalida`** — problema com a entrada do usuário (nome vazio, inválido, ou cidade não encontrada).
2. **`falha_api`** — a Open-Meteo respondeu, mas com erro ou em formato inesperado.
3. **`erro_rede`** — problema de conectividade (sem internet ou tempo de resposta excedido).

Isso permite que o frontend mostre mensagens específicas e úteis para cada situação, em vez de um erro genérico.

## 📄 Licença

Projeto de estudo/uso pessoal. Dados meteorológicos fornecidos gratuitamente pela [Open-Meteo](https://open-meteo.com/), sob a licença [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

<div align="center">

### **Desenvolvedora Everly R ❤️**

 

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/everly-rosendo-1066101b9/)
 
</div>