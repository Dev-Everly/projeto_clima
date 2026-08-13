/**
 * Servidor Backend - JavaScript puro (sem frameworks/bibliotecas externas)
 * Usa apenas módulos nativos do Node.js: http, fs, path, url
 * Usa a fetch API nativa do Node (disponível a partir do Node 18+)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
// Serve os arquivos a partir da raiz do projeto (onde este server.js está):
// index.html na raiz, e CSS/JS dentro de /assets
const ROOT_DIR = __dirname;

// URLs base da API Open-Meteo
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

// Tempo máximo de espera por uma resposta das APIs externas antes de
// considerar "erro de rede" (evita a requisição travar para sempre)
const TIMEOUT_MS = 8000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ico': 'image/x-icon',
};

/**
 * Classe de erro customizada, para diferenciar os tipos de falha
 * (cidade inválida / falha da API / erro de rede) e já carregar
 * o status HTTP e a mensagem amigável correspondentes.
 */
class WeatherError extends Error {
  constructor(tipo, statusCode, mensagem) {
    super(mensagem);
    this.tipo = tipo; // 'cidade_invalida' | 'falha_api' | 'erro_rede'
    this.statusCode = statusCode;
  }
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

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
      // Evita que o navegador guarde uma versão em cache do HTML/CSS/JS
      // durante o desenvolvimento — importante para não "sumir" com edições.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(content);
  });
}

/**
 * Faz um fetch com timeout. Se a API externa não responder a tempo,
 * ou se não houver conexão de rede, lança um WeatherError do tipo 'erro_rede'.
 */
async function fetchComTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (erro) {
    // fetch lança TypeError em falhas de rede (sem internet, DNS, etc.)
    // e um erro de abort quando o timeout dispara.
    if (erro.name === 'AbortError') {
      throw new WeatherError('erro_rede', 504, 'A API demorou demais para responder. Verifique sua conexão e tente novamente.');
    }
    throw new WeatherError('erro_rede', 503, 'Não foi possível conectar aos serviços de clima. Verifique sua conexão com a internet.');
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Busca as coordenadas (latitude/longitude) de uma cidade
 * usando a API de geocodificação da Open-Meteo
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
    // A API respondeu OK, mas em um formato totalmente diferente do esperado
    throw new WeatherError('falha_api', 502, 'A resposta da API de geocodificação veio em um formato inesperado.');
  }
 
  if (dados.results.length === 0) {
    // Cidade não encontrada = nome inválido/inexistente
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
 * Busca os dados de previsão do tempo para uma coordenada,
 * usando o parâmetro current_weather=true da Open-Meteo.
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
 * Valida o nome da cidade informado antes de qualquer chamada externa
 */
function validarNomeCidade(cidade) {
  if (!cidade || cidade.trim() === '') {
    throw new WeatherError('cidade_invalida', 400, 'Informe o nome de uma cidade.');
  }
  const nomeLimpo = cidade.trim();
  if (nomeLimpo.length < 2) {
    throw new WeatherError('cidade_invalida', 400, 'O nome da cidade deve ter pelo menos 2 caracteres.');
  }
  // Bloqueia nomes compostos só por números/símbolos (não é nome de cidade válido)
  if (!/[a-zA-ZÀ-ÿ]/.test(nomeLimpo)) {
    throw new WeatherError('cidade_invalida', 400, 'Digite um nome de cidade válido.');
  }
  return nomeLimpo;
}

/**
 * Handler do endpoint /api/weather
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
    // Qualquer erro inesperado que não seja um WeatherError conhecido
    console.error('[erro_inesperado]', erro);
    sendJSON(res, 500, { erro: 'Erro interno ao buscar dados meteorológicos.', tipo: 'erro_interno' });
  }
}

/**
 * Cria e inicia o servidor HTTP. Fica separado em função própria para que
 * os testes (Jest) possam importar as funções deste arquivo com `require()`
 * SEM que isso já suba um servidor de verdade ocupando a porta 3000.
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
// diretamente (ex: "node server.js"), e não quando é importado
// por outro arquivo via require() — como fazem os testes do Jest.
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