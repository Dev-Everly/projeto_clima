/**
 * Testes unitários do backend (api.js) usando Jest.
 *
 * Estratégia: como o backend é JavaScript puro (sem framework), testamos
 * as funções exportadas diretamente, "mockando" a função global `fetch`
 * para simular as respostas da API Open-Meteo — sem depender de rede de
 * verdade, o que torna os testes rápidos, determinísticos e reproduzíveis.
 */

const {
  WeatherError,
  validarNomeCidade,
  buscarCoordenadas,
  buscarPrevisao,
  handleWeatherRequest,
} = require('../api');

/**
 * Cria um objeto `res` (resposta HTTP) falso, compatível com o que
 * `handleWeatherRequest` espera (writeHead + end), guardando o que
 * foi enviado para podermos fazer as asserções depois.
 */
function criarResMock() {
  return {
    statusCode: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(data) {
      this.body = data;
    },
  };
}

/** Atalho para ler o corpo JSON enviado pelo res mock */
function corpoJSON(res) {
  return JSON.parse(res.body);
}

// Garante que cada teste comece com um "fetch" limpo, sem lixo do teste anterior
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  delete global.fetch;
});

// ============================================================
// 3.6 — TESTES BÁSICOS
// ============================================================

describe('3.6.1 — Nome de cidade válido retorna dados meteorológicos', () => {
  test('buscarCoordenadas retorna latitude/longitude corretas para cidade válida', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { name: 'Santos', country: 'Brasil', admin1: 'São Paulo', latitude: -23.96, longitude: -46.33 },
        ],
      }),
    });

    const local = await buscarCoordenadas('santos');

    expect(local).toMatchObject({
      nome: 'Santos',
      pais: 'Brasil',
      estado: 'São Paulo',
      latitude: -23.96,
      longitude: -46.33,
    });
  });

  test('handleWeatherRequest responde 200 com o clima completo para uma cidade válida', async () => {
    global.fetch = jest
      .fn()
      // 1ª chamada: geocodificação
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ name: 'Santos', country: 'Brasil', admin1: 'SP', latitude: -23.96, longitude: -46.33 }],
        }),
      })
      // 2ª chamada: previsão do tempo
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          elevation: 2,
          timezone: 'America/Sao_Paulo',
          timezone_abbreviation: '-03',
          utc_offset_seconds: -10800,
          current_weather: { temperature: 21, windspeed: 5, winddirection: 100, weathercode: 0, is_day: 1, time: '2026-08-13T10:00' },
          daily: { time: ['2026-08-13'], weathercode: [0], temperature_2m_max: [24], temperature_2m_min: [17] },
        }),
      });

    const res = criarResMock();
    const query = new URLSearchParams({ city: 'santos' });

    await handleWeatherRequest({}, res, query);

    expect(res.statusCode).toBe(200);
    const corpo = corpoJSON(res);
    expect(corpo.local.nome).toBe('Santos');
    expect(corpo.atual.temperature).toBe(21);
    expect(corpo.diario.time).toEqual(['2026-08-13']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('3.6.2 — Nome de cidade inexistente lança exceção tratada', () => {
  test('buscarCoordenadas lança WeatherError do tipo cidade_invalida quando results vem vazio', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await expect(buscarCoordenadas('cidadequenaoexiste123')).rejects.toBeInstanceOf(WeatherError);
    await expect(buscarCoordenadas('cidadequenaoexiste123')).rejects.toMatchObject({
      tipo: 'cidade_invalida',
      statusCode: 404,
    });
  });

  test('handleWeatherRequest responde 404 com tipo cidade_invalida', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const res = criarResMock();
    const query = new URLSearchParams({ city: 'cidadequenaoexiste123' });

    await handleWeatherRequest({}, res, query);

    expect(res.statusCode).toBe(404);
    expect(corpoJSON(res).tipo).toBe('cidade_invalida');
  });
});

describe('3.6.3 — Entrada vazia retorna erro de validação', () => {
  test('validarNomeCidade lança erro para string vazia', () => {
    expect(() => validarNomeCidade('')).toThrow(WeatherError);
    expect(() => validarNomeCidade('')).toThrow('Informe o nome de uma cidade.');
  });

  test('validarNomeCidade lança erro para string só com espaços', () => {
    expect(() => validarNomeCidade('   ')).toThrow(WeatherError);
  });

  test('validarNomeCidade lança erro para nome com só 1 caractere', () => {
    expect(() => validarNomeCidade('a')).toThrow(WeatherError);
  });

  test('validarNomeCidade lança erro para nome só com números', () => {
    expect(() => validarNomeCidade('12345')).toThrow(WeatherError);
  });

  test('handleWeatherRequest responde 400 para cidade vazia, sem sequer chamar a API', async () => {
    global.fetch = jest.fn();
    const res = criarResMock();
    const query = new URLSearchParams({ city: '' });

    await handleWeatherRequest({}, res, query);

    expect(res.statusCode).toBe(400);
    expect(corpoJSON(res).tipo).toBe('cidade_invalida');
    expect(global.fetch).not.toHaveBeenCalled(); // validação acontece ANTES de chamar a API
  });
});

describe('3.6.4 — Falha da API gera resposta adequada (timeout ou erro)', () => {
  test('resposta HTTP de erro (500) da Open-Meteo gera WeatherError do tipo falha_api', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(buscarCoordenadas('santos')).rejects.toMatchObject({
      tipo: 'falha_api',
      statusCode: 502,
    });
  });

  test('timeout (AbortError) gera WeatherError do tipo erro_rede com status 504', async () => {
    const erroAbort = new Error('Aborted');
    erroAbort.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(erroAbort);

    await expect(buscarCoordenadas('santos')).rejects.toMatchObject({
      tipo: 'erro_rede',
      statusCode: 504,
    });
  });

  test('handleWeatherRequest responde 502 quando a Open-Meteo falha', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const res = criarResMock();
    const query = new URLSearchParams({ city: 'santos' });

    await handleWeatherRequest({}, res, query);

    expect(res.statusCode).toBe(502);
    expect(corpoJSON(res).tipo).toBe('falha_api');
  });
});

// ============================================================
// 3.7 — CASOS EXTREMOS
// ============================================================

describe('3.7.1 — Limite de requisições da API excedido (HTTP 429)', () => {
  test('buscarCoordenadas trata HTTP 429 como falha_api', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });

    await expect(buscarCoordenadas('santos')).rejects.toMatchObject({
      tipo: 'falha_api',
      statusCode: 502,
    });
  });

  test('buscarPrevisao também trata HTTP 429 como falha_api', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });

    await expect(buscarPrevisao(-23.96, -46.33)).rejects.toMatchObject({
      tipo: 'falha_api',
    });
  });

  test('handleWeatherRequest responde 502 (não trava e não vaza o erro cru) quando a API limita as requisições', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    const res = criarResMock();
    const query = new URLSearchParams({ city: 'santos' });

    await handleWeatherRequest({}, res, query);

    expect(res.statusCode).toBe(502);
    expect(corpoJSON(res).erro).toEqual(expect.any(String));
  });
});

describe('3.7.2 — Conexão de rede lenta/instável', () => {
  test('fetch rejeitando com TypeError (sem internet/DNS) gera erro_rede', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(buscarCoordenadas('santos')).rejects.toMatchObject({ tipo: 'erro_rede' });
  });

  test('requisição que demora mais que o TIMEOUT_MS é abortada automaticamente (timeout real, com fake timers)', async () => {
    jest.useFakeTimers();

    // Simula um fetch "pendurado": só rejeita quando o AbortController mandar abortar
    global.fetch = jest.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const erro = new Error('The operation was aborted');
            erro.name = 'AbortError';
            reject(erro);
          });
        })
    );

    // IMPORTANTE: anexamos o .rejects já aqui, ANTES de avançar o relógio.
    // Se esperássemos pra fazer isso só depois do advanceTimersByTimeAsync,
    // a promise já teria rejeitado "sem ninguém ouvindo", e o Jest reportaria
    // isso como uma rejeição não tratada (unhandled rejection) — mesmo o
    // comportamento estando correto.
    const expectativa = expect(buscarCoordenadas('santos')).rejects.toMatchObject({
      tipo: 'erro_rede',
      statusCode: 504,
    });

    // Avança o relógio além dos 8000ms configurados como TIMEOUT_MS
    await jest.advanceTimersByTimeAsync(8000);

    await expectativa;
  });

  test('instabilidade intermitente: primeira chamada falha, aplicação não trava, apenas propaga o erro tratado', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new TypeError('network changed'));

    const res = criarResMock();
    const query = new URLSearchParams({ city: 'santos' });

    await expect(handleWeatherRequest({}, res, query)).resolves.toBeUndefined();
    expect(res.statusCode).toBe(503); // erro_rede "comum" (não-timeout) usa 503
    expect(corpoJSON(res).tipo).toBe('erro_rede');
  });
});

describe('3.7.3 — Mudança inesperada no formato da resposta JSON', () => {
  test('geocodificação sem o campo "results" (formato totalmente diferente) gera falha_api, não cidade_invalida', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mensagemInesperada: 'a API mudou de formato' }),
    });

    await expect(buscarCoordenadas('santos')).rejects.toMatchObject({
      tipo: 'falha_api',
      statusCode: 502,
    });
  });

  test('previsão sem o campo "current_weather" gera falha_api', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ daily: { time: ['2026-08-13'] } }), // sem current_weather
    });

    await expect(buscarPrevisao(-23.96, -46.33)).rejects.toMatchObject({
      tipo: 'falha_api',
    });
  });

  test('resposta que não é JSON válido (ex: API devolveu HTML/texto) gera falha_api', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });

    await expect(buscarCoordenadas('santos')).rejects.toMatchObject({
      tipo: 'falha_api',
      statusCode: 502,
    });
  });
});