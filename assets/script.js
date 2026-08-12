/**
 * Script do Frontend - JavaScript puro, sem bibliotecas
 * Consome o endpoint /api/weather do próprio backend,
 * que por sua vez faz a requisição GET à API Open-Meteo.
 */

// Mapeamento dos códigos de clima (WMO - "weathercode") da Open-Meteo
// para ícone e descrição em pt-BR
const WEATHER_CODES = {
  0: { icone: '☀️', descricao: 'Céu limpo' },
  1: { icone: '🌤️', descricao: 'Principalmente limpo' },
  2: { icone: '⛅', descricao: 'Parcialmente nublado' },
  3: { icone: '☁️', descricao: 'Nublado' },
  45: { icone: '🌫️', descricao: 'Neblina' },
  48: { icone: '🌫️', descricao: 'Neblina com geada' },
  51: { icone: '🌦️', descricao: 'Garoa fraca' },
  53: { icone: '🌦️', descricao: 'Garoa moderada' },
  55: { icone: '🌦️', descricao: 'Garoa intensa' },
  61: { icone: '🌧️', descricao: 'Chuva fraca' },
  63: { icone: '🌧️', descricao: 'Chuva moderada' },
  65: { icone: '🌧️', descricao: 'Chuva forte' },
  71: { icone: '🌨️', descricao: 'Neve fraca' },
  73: { icone: '🌨️', descricao: 'Neve moderada' },
  75: { icone: '🌨️', descricao: 'Neve forte' },
  80: { icone: '🌦️', descricao: 'Pancadas de chuva fracas' },
  81: { icone: '🌧️', descricao: 'Pancadas de chuva moderadas' },
  82: { icone: '⛈️', descricao: 'Pancadas de chuva fortes' },
  95: { icone: '⛈️', descricao: 'Trovoada' },
  96: { icone: '⛈️', descricao: 'Trovoada com granizo' },
  99: { icone: '⛈️', descricao: 'Trovoada forte com granizo' },
};

// Variação noturna dos ícones para códigos de céu limpo/parcialmente nublado
// (usada quando current_weather.is_day === 0)
const WEATHER_CODES_NOITE = {
  0: '🌙',
  1: '🌙',
  2: '☁️',
};

/**
 * Retorna o ícone e a descrição corretos para um weathercode,
 * levando em conta se é dia (is_day = 1) ou noite (is_day = 0)
 */
function obterInfoClima(codigo, isDay) {
  const info = WEATHER_CODES[codigo] || { icone: '❓', descricao: 'Desconhecido' };
  if (isDay === 0 && WEATHER_CODES_NOITE[codigo]) {
    return { ...info, icone: WEATHER_CODES_NOITE[codigo] };
  }
  return info;
}

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const form = document.getElementById('form-busca');
const inputCidade = document.getElementById('input-cidade');
const btnBuscar = document.getElementById('btn-buscar');
const elMensagem = document.getElementById('mensagem');
const elResultado = document.getElementById('resultado');

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const cidade = inputCidade.value.trim();

  if (!cidade) return;

  buscarClima(cidade);
});

async function buscarClima(cidade) {
  mostrarCarregando();

  try {
    const resposta = await fetch(`/api/weather?city=${encodeURIComponent(cidade)}`);
    const dados = await resposta.json();

    if (!resposta.ok) {
      mostrarErro(dados.erro || 'Não foi possível obter os dados do clima.');
      return;
    }

    exibirResultado(dados);
  } catch (erro) {
    console.error(erro);
    mostrarErro('Falha na conexão com o servidor. Tente novamente.');
  }
}

function mostrarCarregando() {
  esconderResultado();
  btnBuscar.disabled = true;
  btnBuscar.textContent = 'Buscando...';
  elMensagem.hidden = false;
  elMensagem.className = 'mensagem carregando';
  elMensagem.textContent = 'Carregando dados do clima...';
}

function mostrarErro(texto) {
  esconderResultado();
  restaurarBotao();
  elMensagem.hidden = false;
  elMensagem.className = 'mensagem erro';
  elMensagem.textContent = texto;
}

function esconderMensagem() {
  elMensagem.hidden = true;
}

function esconderResultado() {
  elResultado.hidden = true;
}

function restaurarBotao() {
  btnBuscar.disabled = false;
  btnBuscar.textContent = 'Buscar';
}

function exibirResultado(dados) {
  restaurarBotao();
  esconderMensagem();

  const { local, atual, diario, fusoHorarioSigla } = dados;

  // Informações do local
  document.getElementById('nome-local').textContent = local.nome;
  document.getElementById('pais-local').textContent = [local.estado, local.pais]
    .filter(Boolean)
    .join(' - ');

  // Clima atual (objeto current_weather: temperature, windspeed, winddirection, weathercode, is_day, time)
  const infoClima = obterInfoClima(atual.weathercode, atual.is_day);
  document.getElementById('icone-atual').textContent = infoClima.icone;
  document.getElementById('temp-atual').textContent = `${Math.round(atual.temperature)}°C`;
  document.getElementById('descricao-atual').textContent = infoClima.descricao;
  document.getElementById('vento').textContent = `${Math.round(atual.windspeed)} km/h`;
  document.getElementById('direcao-vento').textContent = `${grausParaDirecao(atual.winddirection)} (${Math.round(atual.winddirection)}°)`;
  document.getElementById('fuso-horario').textContent = fusoHorarioSigla || '-';
  document.getElementById('horario-medicao').textContent = `${formatarHorario(atual.time)} (${atual.is_day === 1 ? 'dia' : 'noite'})`;

  // Previsão diária
  renderizarPrevisaoDiaria(diario);

  elResultado.hidden = false;
}

/**
 * Converte graus (0 a 360) na direção cardinal correspondente (N, NE, L, SE...)
 */
function grausParaDirecao(graus) {
  const direcoes = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const indice = Math.round(graus / 45) % 8;
  return direcoes[indice];
}

/**
 * Formata o campo "time" do current_weather (ex: "2025-10-08T15:00") para "15:00".
 *
 * Importante: esse horário já vem no fuso horário LOCAL da cidade consultada
 * (por causa do parâmetro timezone=auto), sem indicação de offset (não tem "Z"
 * nem "+00:00"). Por isso extraímos o texto diretamente, em vez de usar
 * `new Date(...)`, que faria o navegador reinterpretar a string com o SEU
 * próprio fuso horário local, mostrando um horário errado.
 */
function formatarHorario(dataISO) {
  const partes = dataISO.split('T');
  return partes.length === 2 ? partes[1] : dataISO;
}

function renderizarPrevisaoDiaria(diario) {
  const container = document.getElementById('lista-previsao');
  container.innerHTML = '';

  diario.time.forEach((dataISO, index) => {
    const data = new Date(dataISO + 'T00:00:00');
    const nomeDia = index === 0 ? 'Hoje' : DIAS_SEMANA[data.getDay()];
    const codigo = diario.weathercode[index];
    const info = WEATHER_CODES[codigo] || { icone: '❓', descricao: '' };
    const tempMax = Math.round(diario.temperature_2m_max[index]);
    const tempMin = Math.round(diario.temperature_2m_min[index]);

    const card = document.createElement('div');
    card.className = 'dia-card';
    card.innerHTML = `
      <span class="dia-nome">${nomeDia}</span>
      <span class="dia-icone">${info.icone}</span>
      <span class="dia-temps">${tempMax}° <span class="min">${tempMin}°</span></span>
    `;
    container.appendChild(card);
  });
}