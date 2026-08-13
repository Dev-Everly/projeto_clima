/**
 * Script do Frontend - JavaScript puro, sem bibliotecas de UI
 * (usa apenas a fonte de ícones "Weather Icons", carregada via CSS no HTML)
 */

// Mapeamento dos códigos de clima (WMO - "weathercode") da Open-Meteo
// para classes da biblioteca Weather Icons (https://erikflowers.github.io/weather-icons/)
// e descrição em pt-BR. Cada código tem uma variação para dia e para noite.
const WEATHER_CODES = {
  0: { dia: 'wi-day-sunny', noite: 'wi-night-clear', descricao: 'Céu limpo' },
  1: { dia: 'wi-day-sunny-overcast', noite: 'wi-night-alt-partly-cloudy', descricao: 'Principalmente limpo' },
  2: { dia: 'wi-day-cloudy', noite: 'wi-night-alt-cloudy', descricao: 'Parcialmente nublado' },
  3: { dia: 'wi-cloudy', noite: 'wi-cloudy', descricao: 'Nublado' },
  45: { dia: 'wi-day-fog', noite: 'wi-night-fog', descricao: 'Neblina' },
  48: { dia: 'wi-day-fog', noite: 'wi-night-fog', descricao: 'Neblina com geada' },
  51: { dia: 'wi-day-sprinkle', noite: 'wi-night-alt-sprinkle', descricao: 'Garoa fraca' },
  53: { dia: 'wi-day-sprinkle', noite: 'wi-night-alt-sprinkle', descricao: 'Garoa moderada' },
  55: { dia: 'wi-day-rain', noite: 'wi-night-alt-rain', descricao: 'Garoa intensa' },
  61: { dia: 'wi-day-rain', noite: 'wi-night-alt-rain', descricao: 'Chuva fraca' },
  63: { dia: 'wi-day-rain', noite: 'wi-night-alt-rain', descricao: 'Chuva moderada' },
  65: { dia: 'wi-rain', noite: 'wi-rain', descricao: 'Chuva forte' },
  71: { dia: 'wi-day-snow', noite: 'wi-night-alt-snow', descricao: 'Neve fraca' },
  73: { dia: 'wi-day-snow', noite: 'wi-night-alt-snow', descricao: 'Neve moderada' },
  75: { dia: 'wi-snow', noite: 'wi-snow', descricao: 'Neve forte' },
  80: { dia: 'wi-day-showers', noite: 'wi-night-alt-showers', descricao: 'Pancadas de chuva fracas' },
  81: { dia: 'wi-day-showers', noite: 'wi-night-alt-showers', descricao: 'Pancadas de chuva moderadas' },
  82: { dia: 'wi-showers', noite: 'wi-showers', descricao: 'Pancadas de chuva fortes' },
  95: { dia: 'wi-day-thunderstorm', noite: 'wi-night-alt-thunderstorm', descricao: 'Trovoada' },
  96: { dia: 'wi-day-storm-showers', noite: 'wi-night-alt-storm-showers', descricao: 'Trovoada com granizo' },
  99: { dia: 'wi-thunderstorm', noite: 'wi-thunderstorm', descricao: 'Trovoada forte com granizo' },
};

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const form = document.getElementById('form-busca');
const inputCidade = document.getElementById('input-cidade');
const btnBuscar = document.getElementById('btn-buscar');
const elMensagem = document.getElementById('mensagem');
const elResultado = document.getElementById('resultado');

// Guarda os dados da última consulta bem-sucedida, para que o clique
// num dia da previsão possa atualizar o painel de cima sem precisar
// buscar tudo de novo na API.
let ultimaConsulta = null;

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const cidade = inputCidade.value.trim();

  if (!cidade) {
    mostrarErro('Digite o nome de uma cidade antes de buscar.');
    return;
  }

  buscarClima(cidade);
});

async function buscarClima(cidade) {
  mostrarCarregando();

  let resposta;
  try {
    resposta = await fetch(`/api/weather?city=${encodeURIComponent(cidade)}`);
  } catch (erro) {
    // fetch lança exceção quando não há rede, DNS falha, ou o servidor caiu
    console.error('Erro de rede:', erro);
    mostrarErro('Não foi possível conectar ao servidor. Verifique sua conexão com a internet e se o servidor está rodando.');
    return;
  }

  let dados;
  try {
    dados = await resposta.json();
  } catch (erro) {
    // A resposta não era JSON válido (ex: servidor caiu no meio, proxy devolveu HTML)
    console.error('Resposta inválida do servidor:', erro);
    mostrarErro('O servidor respondeu de forma inesperada. Tente novamente em instantes.');
    return;
  }

  if (!resposta.ok) {
    // Erro conhecido devolvido pelo backend (cidade inválida, falha da API, etc.)
    mostrarErro(dados.erro || 'Não foi possível obter os dados do clima.');
    return;
  }

  exibirResultado(dados);
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

  ultimaConsulta = dados;

  aplicarTemaPorHorario(dados.atual.is_day);

  // Informações do local (não mudam ao selecionar um dia da previsão)
  document.getElementById('nome-local').textContent = dados.local.nome;
  document.getElementById('pais-local').textContent = [dados.local.estado, dados.local.pais]
    .filter(Boolean)
    .join(' - ');

  // Painel de clima começa mostrando o momento atual ("agora")
  exibirPainelAgora();

  // Previsão diária (cards clicáveis)
  renderizarPrevisaoDiaria(dados.diario);

  elResultado.hidden = false;
}

/**
 * Preenche o painel de clima de cima com os dados do momento ATUAL
 * (objeto current_weather: temperature, windspeed, winddirection, weathercode, is_day, time)
 */
function exibirPainelAgora() {
  if (!ultimaConsulta) return;
  const { atual, fusoHorarioSigla } = ultimaConsulta;

  const infoClima = WEATHER_CODES[atual.weathercode] || { dia: 'wi-na', noite: 'wi-na', descricao: 'Desconhecido' };
  const classeIcone = atual.is_day === 1 ? infoClima.dia : infoClima.noite;

  document.getElementById('data-consulta').textContent = formatarDataCompleta(atual.time);

  const elIcone = document.getElementById('icone-atual');
  elIcone.className = `icone-clima wi ${classeIcone}`;

  document.getElementById('temp-atual').textContent = `${Math.round(atual.temperature)}°C`;
  document.getElementById('descricao-atual').textContent = infoClima.descricao;

  document.getElementById('label-vento').textContent = 'Velocidade do vento';
  document.getElementById('vento').textContent = `${Math.round(atual.windspeed)} km/h`;

  document.getElementById('label-direcao-vento').textContent = 'Direção do vento';
  document.getElementById('direcao-vento').textContent = `${grausParaDirecao(atual.winddirection)} (${Math.round(atual.winddirection)}°)`;

  document.getElementById('fuso-horario').textContent = fusoHorarioSigla || '-';

  document.getElementById('label-detalhe4').textContent = 'Medição em';
  document.getElementById('detalhe4-valor').textContent = `${formatarHorario(atual.time)} (${atual.is_day === 1 ? 'dia' : 'noite'})`;
}

/**
 * Preenche o painel de clima de cima com os dados de PREVISÃO de um dia
 * específico (a partir do índice desse dia dentro de dados.diario)
 */
function exibirPainelParaDia(index) {
  if (!ultimaConsulta) return;
  const { diario } = ultimaConsulta;

  const codigo = diario.weathercode?.[index];
  const infoClima = WEATHER_CODES[codigo] || { dia: 'wi-na', descricao: 'Desconhecido' };
  const tempMax = Math.round(diario.temperature_2m_max?.[index]);
  const tempMin = Math.round(diario.temperature_2m_min?.[index]);
  const ventoMaxBruto = diario.wind_speed_10m_max?.[index];
  const direcaoVentoBruta = diario.wind_direction_10m_dominant?.[index];
  const chanceChuva = diario.precipitation_probability_max?.[index];

  document.getElementById('data-consulta').textContent = formatarDataCompleta(diario.time[index]);

  // Previsão de um dia inteiro não tem "noite" específica — usamos sempre o ícone diurno
  const elIcone = document.getElementById('icone-atual');
  elIcone.className = `icone-clima wi ${infoClima.dia}`;

  document.getElementById('temp-atual').textContent = `${tempMax}° / ${tempMin}°`;
  document.getElementById('descricao-atual').textContent = infoClima.descricao;

  document.getElementById('label-vento').textContent = 'Vento máximo previsto';
  document.getElementById('vento').textContent = ventoMaxBruto != null ? `${Math.round(ventoMaxBruto)} km/h` : '—';

  document.getElementById('label-direcao-vento').textContent = 'Direção predominante';
  document.getElementById('direcao-vento').textContent = direcaoVentoBruta != null
    ? `${grausParaDirecao(direcaoVentoBruta)} (${Math.round(direcaoVentoBruta)}°)`
    : '—';

  // fuso-horario permanece o mesmo (não depende do dia)

  document.getElementById('label-detalhe4').textContent = 'Chance de chuva';
  document.getElementById('detalhe4-valor').textContent = chanceChuva != null ? `${chanceChuva}%` : '—';
}

/**
 * Troca o tema visual da página (fundo escuro à noite, claro de dia),
 * de acordo com o campo is_day retornado pela Open-Meteo para a cidade consultada.
 */
function aplicarTemaPorHorario(isDay) {
  document.body.classList.toggle('tema-noite', isDay === 0);
  document.body.classList.toggle('tema-dia', isDay === 1);
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
 * O horário já vem no fuso LOCAL da cidade consultada (timezone=auto), sem "Z"/offset,
 * então extraímos o texto diretamente em vez de usar `new Date()`, que aplicaria
 * o fuso horário do navegador do usuário e mostraria a hora errada.
 */
function formatarHorario(dataISO) {
  const partes = dataISO.split('T');
  return partes.length === 2 ? partes[1] : dataISO;
}

/**
 * Formata uma data (com ou sem horário, ex: "2025-10-13T15:00" ou "2025-10-13")
 * por extenso, ex: "segunda-feira, 13 de outubro de 2025".
 *
 * Os componentes (ano/mês/dia) são extraídos manualmente da string e usados
 * para montar um Date com hora local do NAVEGADOR apenas para fins de
 * formatação de texto (nome do dia da semana e do mês) — não usamos esse
 * Date para exibir horário, então o fuso do navegador não afeta o resultado.
 */
function formatarDataCompleta(dataISO) {
  const [dataParte] = dataISO.split('T');
  const [ano, mes, dia] = dataParte.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia);

  let textoFormatado = data.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Capitaliza a primeira letra (toLocaleDateString devolve tudo minúsculo em pt-BR)
  return textoFormatado.charAt(0).toUpperCase() + textoFormatado.slice(1);
}

function renderizarPrevisaoDiaria(diario) {
  const container = document.getElementById('lista-previsao');
  container.innerHTML = '';

  diario.time.forEach((dataISO, index) => {
    const data = new Date(dataISO + 'T00:00:00');
    const nomeDia = index === 0 ? 'Hoje' : DIAS_SEMANA[data.getDay()];
    const codigo = diario.weathercode[index];
    const info = WEATHER_CODES[codigo] || { dia: 'wi-na', descricao: '' };
    const tempMax = Math.round(diario.temperature_2m_max[index]);
    const tempMin = Math.round(diario.temperature_2m_min[index]);

    const card = document.createElement('div');
    card.className = 'dia-card';
    card.dataset.indice = String(index);
    card.tabIndex = 0; // permite focar o card com Tab
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute('aria-label', `Selecionar previsão de ${nomeDia}, ${tempMax}° máxima e ${tempMin}° mínima`);
    card.innerHTML = `
      <span class="dia-nome">${nomeDia}</span>
      <i class="dia-icone wi ${info.dia}"></i>
      <span class="dia-temps">${tempMax}° <span class="min">${tempMin}°</span></span>
    `;

    card.addEventListener('click', () => selecionarDiaCard(card, container, index));
    card.addEventListener('keydown', (evento) => {
      // Enter ou Espaço também selecionam, para quem navega só com teclado
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        selecionarDiaCard(card, container, index);
      }
    });

    container.appendChild(card);
  });
}

/**
 * Marca um único dia-card como selecionado por vez (destaque visual) e
 * atualiza o painel de clima de cima para mostrar os dados daquele dia.
 * Clicar de novo no card já selecionado desmarca ele e volta a mostrar
 * o clima atual ("agora").
 */
function selecionarDiaCard(cardClicado, container, index) {
  const jaEstavaSelecionado = cardClicado.classList.contains('dia-card--selecionado');

  container.querySelectorAll('.dia-card--selecionado').forEach((card) => {
    card.classList.remove('dia-card--selecionado');
    card.setAttribute('aria-pressed', 'false');
  });

  if (jaEstavaSelecionado) {
    exibirPainelAgora();
    return;
  }

  cardClicado.classList.add('dia-card--selecionado');
  cardClicado.setAttribute('aria-pressed', 'true');
  exibirPainelParaDia(index);
}