/**
 * Servidor Backend - JavaScript puro (sem frameworks/bibliotecas externas)
 * VERSÃO COM LOGS DE DEPURAÇÃO — use temporariamente para descobrir o problema
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname; // ajuste aqui se seu index.html estiver em /public

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ico': 'image/x-icon',
};

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

  console.log('[STATIC] Tentando servir arquivo:', filePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Acesso negado');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      console.log('[STATIC] ERRO - arquivo não existe:', filePath, '-', err.code);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo não encontrado');
      return;
    }
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

async function buscarCoordenadas(nomeCidade) {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set('name', nomeCidade);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'pt');
  url.searchParams.set('format', 'json');

  console.log('[GEOCODING] Chamando:', url.toString());
  const resposta = await fetch(url.toString());
  console.log('[GEOCODING] Status da resposta:', resposta.status);

  if (!resposta.ok) {
    throw new Error('Erro ao consultar serviço de geocodificação');
  }

  const dados = await resposta.json();

  if (!dados.results || dados.results.length === 0) {
    return null;
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

async function buscarPrevisao(latitude, longitude) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', latitude);
  url.searchParams.set('longitude', longitude);
  url.searchParams.set('current_weather', 'true');
  url.searchParams.set('daily', 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  url.searchParams.set('timezone', 'auto');

  console.log('[FORECAST] Chamando:', url.toString());
  const resposta = await fetch(url.toString());
  console.log('[FORECAST] Status da resposta:', resposta.status);

  if (!resposta.ok) {
    throw new Error('Erro ao consultar serviço de previsão do tempo');
  }

  return resposta.json();
}

async function handleWeatherRequest(req, res, query) {
  console.log('[API] >>> Rota /api/weather foi acionada corretamente <<<');
  const cidade = query.get('city');
  console.log('[API] Cidade recebida:', cidade);

  if (!cidade || cidade.trim() === '') {
    sendJSON(res, 400, { erro: 'Informe o parâmetro "city" com o nome da cidade.' });
    return;
  }

  try {
    const local = await buscarCoordenadas(cidade.trim());

    if (!local) {
      sendJSON(res, 404, { erro: `Cidade "${cidade}" não encontrada.` });
      return;
    }

    console.log('[API] Local encontrado:', local);

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
    console.log('[API] Resposta enviada com sucesso!');
  } catch (erro) {
    console.error('[API] ERRO ao processar requisição:', erro.message);
    sendJSON(res, 500, { erro: 'Erro interno ao buscar dados meteorológicos.' });
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  console.log('---');
  console.log('[REQUEST] Método:', req.method, '| Pathname:', requestUrl.pathname);

  if (requestUrl.pathname === '/api/weather' && req.method === 'GET') {
    await handleWeatherRequest(req, res, requestUrl.searchParams);
    return;
  }

  serveStaticFile(req, res);
});

server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Servindo arquivos estáticos a partir de: ${ROOT_DIR}`);
});