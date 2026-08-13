/**
 * @file api.js
 * @description Backend da aplicação de Previsão do Tempo — JavaScript puro
 * (sem frameworks/bibliotecas externas). Usa apenas módulos nativos do
 * Node.js (`http`, `fs`, `path`, `url`) e a `fetch` API nativa do Node
 * (disponível a partir do Node 18+) para consultar a API pública da
 * Open-Meteo (geocodificação + previsão do tempo).
 *
 * Também serve os arquivos estáticos do frontend (index.html, /assets).
 *
 * @module api
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

/** @constant {number} PORT Porta em que o servidor HTTP escuta. Configurável via variável de ambiente PORT. */
const PORT = process.env.PORT || 3000;

/**
 * @constant {string} ROOT_DIR
 * Diretório raiz a partir do qual os arquivos estáticos são servidos
 * (onde este api.js está): index.html na raiz, e CSS/JS dentro de /assets.
 */
const ROOT_DIR = __dirname;

/** @constant {string} GEOCODING_URL Endpoint da API de geocodificação da Open-Meteo (nome de cidade → latitude/longitude). */
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/** @constant {string} FORECAST_URL Endpoint da API de previsão do tempo da Open-Meteo (latitude/longitude → clima). */
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * @constant {number} TIMEOUT_MS
 * Tempo máximo (em milissegundos) de espera por uma resposta das APIs
 * externas antes de abortar a requisição e considerar "erro de rede"
 * (evita que a requisição fique travada para sempre).
 */
const TIMEOUT_MS = 8000;

/** @constant {Object<string,string>} MIME_TYPES Mapeamento de extensão de arquivo para Content-Type, usado ao servir arquivos estáticos. */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ico': 'image/x-icon',
};

/**
 * Erro customizado usado em toda a aplicação para diferenciar os 3 tipos
 * de falha possíveis ao buscar o clima, já carregando o status HTTP e a
 * mensagem amigável correspondentes a cada caso.
 *
 * @class WeatherError
 * @extends Error
 *
 * @param {'cidade_invalida'|'falha_api'|'erro_rede'} tipo
 *   Categoria do erro:
 *   - `'cidade_invalida'`: nome de cidade vazio, inválido, ou não encontrado pela geocodificação.
 *   - `'falha_api'`: a Open-Meteo respondeu, mas com erro HTTP ou em formato inesperado.
 *   - `'erro_rede'`: falha de conexão (sem internet, DNS, timeout).
 * @param {number} statusCode - Código de status HTTP a ser devolvido ao cliente (ex: 400, 404, 502, 503, 504).
 * @param {string} mensagem - Mensagem de erro amigável, em português, pronta para ser exibida ao usuário final.
 *
 * @example
 * throw new WeatherError('cidade_invalida', 404, 'Cidade não encontrada.');
 */
class WeatherError extends Error {
  constructor(tipo, statusCode, mensagem) {
    super(mensagem);
    this.tipo = tipo;
    this.statusCode = statusCode;
  }
}

/**
 * Envia uma resposta HTTP no formato JSON, já configurando os cabeçalhos
 * de Content-Type e CORS (Access-Control-Allow-Origin: *).
 *
 * @function sendJSON
 * @param {http.ServerResponse} res - Objeto de resposta HTTP do Node.
 * @param {number} statusCode - Código de status HTTP a ser enviado (ex: 200, 404, 500).
 * @param {Object} data - Dado a ser serializado como JSON e enviado no corpo da resposta.
 * @returns {void} Não retorna valor — escreve diretamente na resposta HTTP (efeito colateral).
 * @throws {TypeError} Se `data` contiver referências circulares, `JSON.stringify` lança um TypeError.
 *
 * @example
 * sendJSON(res, 200, { mensagem: 'ok' });
 * // Resposta HTTP: 200, Content-Type: application/json, corpo: {"mensagem":"ok"}
 */
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

/**
 * Serve um arquivo estático (HTML, CSS, JS) a partir de {@link ROOT_DIR},
 * respondendo à requisição HTTP recebida. Usado para servir o frontend
 * (index.html, /assets/style.css, /assets/script.js).
 *
 * Proteções aplicadas:
 * - Bloqueia tentativas de "path traversal" (acessar arquivos fora de ROOT_DIR).
 * - Envia `Cache-Control: no-store` para evitar que o navegador sirva
 *   versões antigas em cache durante o desenvolvimento.
 *
 * @function serveStaticFile
 * @param {http.IncomingMessage} req - Objeto de requisição HTTP do Node (usa `req.url`).
 * @param {http.ServerResponse} res - Objeto de resposta HTTP do Node.
 * @returns {void} Não retorna valor — escreve diretamente na resposta HTTP (efeito colateral, assíncrono via `fs.readFile`).
 * @throws {void} Não lança exceções — qualquer erro de leitura de arquivo é tratado internamente e convertido em uma resposta HTTP 404 ou 403.
 *
 * @example
 * // req.url === '/assets/style.css'
 * serveStaticFile(req, res);
 * // Resposta HTTP: 200, Content-Type: text/css, corpo: conteúdo do arquivo style.css
 */
function serveStaticFile(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(ROOT_DIR, decodeURIComponent(filePath.split('?')[0]));

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Acesso negado');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo não encontrado');
      return;
    }
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(content);
  });
}

/**
 * Executa um `fetch` com um limite de tempo ({@link TIMEOUT_MS}). Se a API
 * externa não responder a tempo, ou se não houver conexão de rede, a
 * requisição é abortada e um {@link WeatherError} do tipo `'erro_rede'` é
 * lançado (em vez de deixar a requisição travada indefinidamente).
 *
 * @async
 * @function fetchComTimeout
 * @param {string} url - URL completa a ser requisitada (já com query params).
 * @returns {Promise<Response>} A resposta HTTP (objeto `Response` do `fetch`), caso a requisição seja concluída dentro do tempo limite.
 * @throws {WeatherError} `tipo: 'erro_rede'`, `statusCode: 504` — quando o tempo limite ({@link TIMEOUT_MS}) é atingido e a requisição é abortada.
 * @throws {WeatherError} `tipo: 'erro_rede'`, `statusCode: 503` — quando o `fetch` falha por qualquer outro motivo de rede (sem internet, falha de DNS, etc.).
 *
 * @example
 * try {
 *   const resposta = await fetchComTimeout('https://api.open-meteo.com/v1/forecast?...');
 *   const dados = await resposta.json();
 * } catch (erro) {
 *   if (erro instanceof WeatherError) console.error(erro.tipo, erro.message);
 * }
 */
async function fetchComTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (erro) {
    if (erro.name === 'AbortError') {
      throw new WeatherError('erro_rede', 504, 'A API demorou demais para responder. Verifique sua conexão e tente novamente.');
    }
    throw new WeatherError('erro_rede', 503, 'Não foi possível conectar aos serviços de clima. Verifique sua conexão com a internet.');
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Busca as coordenadas geográficas (latitude/longitude) de uma cidade,
 * usando a API de geocodificação da Open-Meteo. Sempre pega o primeiro
 * resultado retornado pela API (o mais relevante).
 *
 * @async
 * @function buscarCoordenadas
 * @param {string} nomeCidade - Nome da cidade a ser buscada (ex: `"São Paulo"`, `"Guarulhos"`).
 * @returns {Promise<{nome: string, pais: string, estado: string, latitude: number, longitude: number}>}
 *   Objeto com os dados do local encontrado:
 *   - `nome` — nome oficial da cidade retornado pela API.
 *   - `pais` — país da cidade.
 *   - `estado` — estado/região administrativa (pode ser string vazia se a API não retornar esse dado).
 *   - `latitude`, `longitude` — coordenadas geográficas, usadas depois em {@link buscarPrevisao}.
 * @throws {WeatherError} `tipo: 'cidade_invalida'`, `statusCode: 404` — quando nenhuma cidade é encontrada com esse nome.
 * @throws {WeatherError} `tipo: 'falha_api'`, `statusCode: 502` — quando a API responde com erro HTTP, JSON inválido, ou em um formato inesperado (ex: campo `results` ausente).
 * @throws {WeatherError} `tipo: 'erro_rede'` — propagado de {@link fetchComTimeout} em caso de falha de conexão ou timeout.
 *
 * @example
 * const local = await buscarCoordenadas('Guarulhos');
 * // { nome: 'Guarulhos', pais: 'Brasil', estado: 'São Paulo', latitude: -23.46, longitude: -46.53 }
 */
async function buscarCoordenadas(nomeCidade) {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set('name', nomeCidade);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'pt');
  url.searchParams.set('format', 'json');

  const resposta = await fetchComTimeout(url.toString());

  if (!resposta.ok) {
    throw new WeatherError('falha_api', 502, 'O serviço de geocodificação da Open-Meteo está indisponível no momento. Tente novamente em instantes.');
  }

  let dados;
  try {
    dados = await resposta.json();
  } catch {
    throw new WeatherError('falha_api', 502, 'O serviço de geocodificação retornou uma resposta inválida.');
  }

  if (!Array.isArray(dados.results)) {
    throw new WeatherError('falha_api', 502, 'A resposta da API de geocodificação veio em um formato inesperado.');
  }

  if (dados.results.length === 0) {
    throw new WeatherError('cidade_invalida', 404, `Não encontramos nenhuma cidade chamada "${nomeCidade}". Verifique a grafia e tente novamente.`);
  }

  const local = dados.results[0];
  return {
    nome: local.name,
    pais: local.country,
    estado: local.admin1 || '',
    latitude: local.latitude,
    longitude: local.longitude,
  };
}

/**
 * Busca os dados de previsão do tempo (clima atual + previsão diária) para
 * uma coordenada geográfica, usando o parâmetro `current_weather=true` da
 * Open-Meteo.
 *
 * @async
 * @function buscarPrevisao
 * @param {number} latitude - Latitude da localização (graus decimais). Normalmente obtida via {@link buscarCoordenadas}.
 * @param {number} longitude - Longitude da localização (graus decimais). Normalmente obtida via {@link buscarCoordenadas}.
 * @returns {Promise<Object>} O JSON bruto retornado pela Open-Meteo, contendo (entre outros campos):
 *   - `current_weather` — `{temperature, windspeed, winddirection, weathercode, is_day, time}`.
 *   - `daily` — `{time[], weathercode[], temperature_2m_max[], temperature_2m_min[], precipitation_probability_max[], wind_speed_10m_max[], wind_direction_10m_dominant[]}`.
 *   - `timezone`, `timezone_abbreviation`, `utc_offset_seconds`, `elevation`.
 * @throws {WeatherError} `tipo: 'falha_api'`, `statusCode: 502` — quando a API responde com erro HTTP, JSON inválido, ou sem o campo `current_weather` (formato inesperado).
 * @throws {WeatherError} `tipo: 'erro_rede'` — propagado de {@link fetchComTimeout} em caso de falha de conexão ou timeout.
 *
 * @example
 * const previsao = await buscarPrevisao(-23.46, -46.53);
 * console.log(previsao.current_weather.temperature); // ex: 24.5
 */
async function buscarPrevisao(latitude, longitude) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', latitude);
  url.searchParams.set('longitude', longitude);
  url.searchParams.set('current_weather', 'true');
  url.searchParams.set('daily', 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant');
  url.searchParams.set('timezone', 'auto');

  const resposta = await fetchComTimeout(url.toString());

  if (!resposta.ok) {
    throw new WeatherError('falha_api', 502, 'O serviço de previsão do tempo da Open-Meteo está indisponível no momento. Tente novamente em instantes.');
  }

  let dados;
  try {
    dados = await resposta.json();
  } catch {
    throw new WeatherError('falha_api', 502, 'O serviço de previsão retornou uma resposta inválida.');
  }

  if (!dados.current_weather) {
    throw new WeatherError('falha_api', 502, 'A resposta da API de previsão veio incompleta.');
  }

  return dados;
}

/**
 * Valida o nome de cidade informado pelo usuário, ANTES de fazer qualquer
 * chamada às APIs externas (evita gastar uma requisição com uma entrada
 * já sabidamente inválida).
 *
 * Regras aplicadas:
 * 1. Não pode ser vazio ou conter só espaços.
 * 2. Precisa ter pelo menos 2 caracteres (depois do `trim()`).
 * 3. Precisa conter pelo menos uma letra (bloqueia entradas só numéricas/símbolos).
 *
 * @function validarNomeCidade
 * @param {string|null|undefined} cidade - Nome de cidade bruto, vindo do query param `city` da requisição.
 * @returns {string} O nome da cidade "limpo" (com `trim()` aplicado), pronto para ser usado em {@link buscarCoordenadas}.
 * @throws {WeatherError} `tipo: 'cidade_invalida'`, `statusCode: 400` — em qualquer uma das 3 regras violadas, com uma mensagem específica para cada caso.
 *
 * @example
 * validarNomeCidade('  São Paulo  '); // → 'São Paulo'
 * validarNomeCidade('');              // → lança WeatherError('cidade_invalida', 400, 'Informe o nome de uma cidade.')
 * validarNomeCidade('12345');         // → lança WeatherError('cidade_invalida', 400, 'Digite um nome de cidade válido.')
 */
function validarNomeCidade(cidade) {
  if (!cidade || cidade.trim() === '') {
    throw new WeatherError('cidade_invalida', 400, 'Informe o nome de uma cidade.');
  }
  const nomeLimpo = cidade.trim();
  if (nomeLimpo.length < 2) {
    throw new WeatherError('cidade_invalida', 400, 'O nome da cidade deve ter pelo menos 2 caracteres.');
  }
  if (!/[a-zA-ZÀ-ÿ]/.test(nomeLimpo)) {
    throw new WeatherError('cidade_invalida', 400, 'Digite um nome de cidade válido.');
  }
  return nomeLimpo;
}

/**
 * Handler principal do endpoint `GET /api/weather?city=<nome>`. Orquestra
 * todo o fluxo: valida a entrada, busca as coordenadas da cidade, busca a
 * previsão do tempo, e envia a resposta JSON combinada — ou, em caso de
 * falha em qualquer etapa, envia uma resposta de erro JSON com o status
 * HTTP e o `tipo` apropriados (nunca deixa uma exceção "vazar" sem tratamento).
 *
 * @async
 * @function handleWeatherRequest
 * @param {http.IncomingMessage} req - Objeto de requisição HTTP do Node (não utilizado diretamente, recebido por padronização do roteador).
 * @param {http.ServerResponse} res - Objeto de resposta HTTP do Node, para onde a resposta (sucesso ou erro) é escrita via {@link sendJSON}.
 * @param {URLSearchParams} query - Parâmetros de busca da URL da requisição (deve conter `city`).
 * @returns {Promise<void>} Não retorna valor — sempre encerra escrevendo uma resposta JSON em `res` (200 em caso de sucesso, ou 400/404/500/502/503/504 em caso de erro).
 * @throws {void} Não lança exceções para fora da função — qualquer {@link WeatherError} (ou erro inesperado) é capturado e convertido em resposta HTTP.
 *
 * @example
 * // GET /api/weather?city=Guarulhos
 * const query = new URLSearchParams({ city: 'Guarulhos' });
 * await handleWeatherRequest(req, res, query);
 * // Resposta HTTP 200: { local: {...}, atual: {...}, diario: {...}, ... }
 *
 * @example
 * // GET /api/weather?city= (vazio)
 * const query = new URLSearchParams({ city: '' });
 * await handleWeatherRequest(req, res, query);
 * // Resposta HTTP 400: { erro: 'Informe o nome de uma cidade.', tipo: 'cidade_invalida' }
 */
async function handleWeatherRequest(req, res, query) {
  try {
    const cidade = validarNomeCidade(query.get('city'));
    const local = await buscarCoordenadas(cidade);
    const previsao = await buscarPrevisao(local.latitude, local.longitude);

    sendJSON(res, 200, {
      local,
      elevacao: previsao.elevation,
      fusoHorario: previsao.timezone,
      fusoHorarioSigla: previsao.timezone_abbreviation,
      utcOffsetSegundos: previsao.utc_offset_seconds,
      atual: previsao.current_weather,
      diario: previsao.daily,
    });
  } catch (erro) {
    if (erro instanceof WeatherError) {
      console.error(`[${erro.tipo}]`, erro.message);
      sendJSON(res, erro.statusCode, { erro: erro.message, tipo: erro.tipo });
      return;
    }
    console.error('[erro_inesperado]', erro);
    sendJSON(res, 500, { erro: 'Erro interno ao buscar dados meteorológicos.', tipo: 'erro_interno' });
  }
}

/**
 * Cria e inicia o servidor HTTP, registrando o roteamento:
 * - `GET /api/weather` → {@link handleWeatherRequest}
 * - Qualquer outra rota → {@link serveStaticFile} (serve o frontend)
 *
 * Fica isolada em função própria (em vez de rodar automaticamente no
 * carregamento do módulo) para que os testes (Jest) possam importar as
 * funções deste arquivo com `require('./api')` **sem** que isso já suba
 * um servidor de verdade ocupando a porta {@link PORT}.
 *
 * @function iniciarServidor
 * @returns {http.Server} A instância do servidor HTTP criada (já escutando na porta configurada).
 *
 * @example
 * const servidor = iniciarServidor();
 * // Console: "Servidor rodando em http://localhost:3000"
 */
function iniciarServidor() {
  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (requestUrl.pathname === '/api/weather' && req.method === 'GET') {
      await handleWeatherRequest(req, res, requestUrl.searchParams);
      return;
    }

    serveStaticFile(req, res);
  });

  server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });

  return server;
}

// Só inicia o servidor de verdade quando este arquivo é executado
// diretamente (ex: "node api.js"), e não quando é importado por outro
// arquivo via require() — como fazem os testes do Jest.
if (require.main === module) {
  iniciarServidor();
}

module.exports = {
  WeatherError,
  validarNomeCidade,
  buscarCoordenadas,
  buscarPrevisao,
  fetchComTimeout,
  handleWeatherRequest,
  sendJSON,
  iniciarServidor,
};