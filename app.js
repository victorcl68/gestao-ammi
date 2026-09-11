import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ===================== CONFIG =====================

const SUPABASE_URL = 'https://odjryakghivbwyftfjar.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_SHyvOxJ8tz2BMFDJ1nZL0w_hUQbIGUc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CC_TABLE = 'caixa_casa_lancamentos';
const SAL_TABLE = 'salario_lancamentos';
const CP_TABLE = 'contas_pagar';
const CP_EXDATES_TABLE = 'contas_pagar_exdates';
const CP_PARCELAS_TABLE = 'contas_pagar_parcelas';
const CP_PAGAMENTOS_TABLE = 'contas_pagar_pagamentos';
const PERCENTUAL_COMISSAO = 0.25;

// ===================== HELPERS: dinheiro / data =====================

// Converte texto tipo "1.234,56" ou "1234,56" ou "1234.56" em número.
function parseMoney(text) {
  if (typeof text !== 'string') return NaN;
  const cleaned = text.trim().replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned);
}

// Aplica máscara de dinheiro (ex: "123456" -> "1.234,56") enquanto o usuário digita.
function aplicarMascaraMoney(input) {
  input.addEventListener('input', () => {
    let digits = input.value.replace(/\D/g, '');
    if (!digits) {
      input.value = '';
      return;
    }
    digits = digits.replace(/^0+(?=\d)/, '');
    const cents = digits.slice(-2).padStart(2, '0');
    const reais = digits.slice(0, -2) || '0';
    const reaisFormatado = reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    input.value = `${reaisFormatado},${cents}`;
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Data de hoje (YYYY-MM-DD) no fuso America/Sao_Paulo.
function hojeISO() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

function formatDataBR(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

// ===================== NAVEGAÇÃO ENTRE VIEWS =====================

const views = {
  login: document.getElementById('view-login'),
  home: document.getElementById('view-home'),
  'caixa-casa': document.getElementById('view-caixa-casa'),
  salario: document.getElementById('view-salario'),
  'contas-pagar': document.getElementById('view-contas-pagar'),
};

const desktopGridEl = document.getElementById('desktop-grid');

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.hidden = key !== name;
  });

  const logado = name !== 'login';
  desktopGridEl.hidden = !logado;

  if (name === 'caixa-casa' || name === 'home') carregarCaixaCasa();
  if (name === 'salario' || name === 'home') carregarSalario();
  if (name === 'contas-pagar' || name === 'home') carregarContasPagar();
}

document.querySelectorAll('[data-nav]').forEach((el) => {
  el.addEventListener('click', () => showView(el.dataset.nav));
});

document.getElementById('logout-btn-desktop').addEventListener('click', async () => {
  await supabase.auth.signOut();
  showView('login');
});

// ===================== AUTENTICAÇÃO =====================

async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  showView(session ? 'home' : 'login');
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) showView('login');
});

const loginForm = document.getElementById('login-form');
const loginErrorEl = document.getElementById('login-error');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErrorEl.hidden = true;

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    loginErrorEl.textContent = 'E-mail ou senha inválidos.';
    loginErrorEl.hidden = false;
    return;
  }

  loginForm.reset();
  showView('home');
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  showView('login');
});

// ===================== CAIXA CASA =====================

const ccSaldoEl = document.getElementById('cc-saldo');
const ccListEl = document.getElementById('cc-list');
const ccForm = document.getElementById('cc-form');
const ccErrorEl = document.getElementById('cc-form-error');
const ccDescricaoInput = document.getElementById('cc-descricao');
const ccDescricaoReq = document.getElementById('cc-descricao-req');
const ccDataInput = document.getElementById('cc-data');
aplicarMascaraMoney(document.getElementById('cc-valor'));

const CC_DESCRICAO_PADRAO = {
  entrada: 'Suprimento',
  saida: 'Aluguel',
};

function updateCcDescricaoRequirement() {
  const tipo = document.querySelector('input[name="cc-tipo"]:checked').value;
  const obrigatorio = tipo === 'saida';
  ccDescricaoInput.required = obrigatorio;
  ccDescricaoReq.hidden = !obrigatorio;
}

document.querySelectorAll('input[name="cc-tipo"]').forEach((el) => {
  el.addEventListener('change', () => {
    updateCcDescricaoRequirement();
    ccDescricaoInput.value = CC_DESCRICAO_PADRAO[el.value];
  });
});

async function carregarCaixaCasa() {
  ccDataInput.value = ccDataInput.value || hojeISO();
  if (!ccDescricaoInput.value) {
    const tipo = document.querySelector('input[name="cc-tipo"]:checked').value;
    ccDescricaoInput.value = CC_DESCRICAO_PADRAO[tipo];
  }
  updateCcDescricaoRequirement();

  const { data, error } = await supabase
    .from(CC_TABLE)
    .select('*')
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    ccListEl.innerHTML = `<li class="empty-state">Erro ao carregar lançamentos.</li>`;
    return;
  }

  const saldo = data.reduce((acc, l) => {
    return acc + (l.tipo === 'entrada' ? Number(l.valor) : -Number(l.valor));
  }, 0);
  ccSaldoEl.textContent = formatMoney(saldo);
  ccSaldoEl.classList.toggle('negative', saldo < 0);

  if (data.length === 0) {
    ccListEl.innerHTML = `<li class="empty-state">Nenhum lançamento ainda.</li>`;
    return;
  }

  ccListEl.innerHTML = data.map((l) => {
    const positivo = l.tipo === 'entrada';
    const sinal = positivo ? '+' : '-';
    return `
      <li class="lancamento-item">
        <div class="lancamento-info">
          <span class="lancamento-desc">${l.descricao || (positivo ? 'Entrada' : 'Saída')}</span>
          <span class="lancamento-data">${formatDataBR(l.data)}</span>
        </div>
        <span class="lancamento-valor ${positivo ? 'positivo' : 'negativo'}">${sinal} ${formatMoney(l.valor)}</span>
      </li>
    `;
  }).join('');
}

ccForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  ccErrorEl.hidden = true;

  const tipo = document.querySelector('input[name="cc-tipo"]:checked').value;
  const valor = parseMoney(document.getElementById('cc-valor').value);
  const data = ccDataInput.value;
  const descricao = ccDescricaoInput.value.trim();

  if (!valor || valor <= 0) {
    ccErrorEl.textContent = 'Informe um valor válido.';
    ccErrorEl.hidden = false;
    return;
  }

  if (tipo === 'saida' && !descricao) {
    ccErrorEl.textContent = 'Descrição é obrigatória para saídas.';
    ccErrorEl.hidden = false;
    return;
  }

  const { error } = await supabase.from(CC_TABLE).insert({
    tipo,
    valor,
    data,
    descricao: descricao || null,
  });

  if (error) {
    ccErrorEl.textContent = 'Erro ao salvar. Tente novamente.';
    ccErrorEl.hidden = false;
    return;
  }

  ccForm.reset();
  ccDataInput.value = hojeISO();
  ccDescricaoInput.value = CC_DESCRICAO_PADRAO[tipo];
  updateCcDescricaoRequirement();
  await carregarCaixaCasa();
});

// ===================== SALÁRIO =====================

const salSaldoEl = document.getElementById('sal-saldo');
const salListEl = document.getElementById('sal-list');

const salVendaForm = document.getElementById('sal-venda-form');
const salVendaValorInput = document.getElementById('sal-venda-valor');
const salVendaDataInput = document.getElementById('sal-venda-data');
const salVendaDescricaoInput = document.getElementById('sal-venda-descricao');
const salVendaErrorEl = document.getElementById('sal-venda-error');
const salVendaSubmitEl = document.getElementById('sal-venda-submit');
aplicarMascaraMoney(salVendaValorInput);

const salPagamentoForm = document.getElementById('sal-pagamento-form');
const salPagamentoValorInput = document.getElementById('sal-pagamento-valor');
const salPagamentoDataInput = document.getElementById('sal-pagamento-data');
const salPagamentoDescricaoInput = document.getElementById('sal-pagamento-descricao');
const salPagamentoErrorEl = document.getElementById('sal-pagamento-error');
aplicarMascaraMoney(salPagamentoValorInput);

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('tab-panel-active', panel.dataset.panel === tab);
    });
  });
});

function updateSalVendaSubmitLabel() {
  const valor = parseMoney(salVendaValorInput.value);
  if (!valor || valor <= 0) {
    salVendaSubmitEl.textContent = 'Salvar';
    return;
  }
  const comissao = round2(valor * PERCENTUAL_COMISSAO);
  salVendaSubmitEl.textContent = `Salvar — ${formatMoney(comissao)}`;
}

salVendaValorInput.addEventListener('input', updateSalVendaSubmitLabel);

async function carregarSalario() {
  salVendaDataInput.value = salVendaDataInput.value || hojeISO();
  salPagamentoDataInput.value = salPagamentoDataInput.value || hojeISO();

  const { data, error } = await supabase
    .from(SAL_TABLE)
    .select('*')
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    salListEl.innerHTML = `<li class="empty-state">Erro ao carregar lançamentos.</li>`;
    return;
  }

  const saldo = data.reduce((acc, l) => {
    return acc + (l.tipo === 'venda' ? Number(l.valor) : -Number(l.valor));
  }, 0);
  salSaldoEl.textContent = formatMoney(saldo);
  salSaldoEl.classList.toggle('negative', saldo < 0);

  if (data.length === 0) {
    salListEl.innerHTML = `<li class="empty-state">Nenhum lançamento ainda.</li>`;
    return;
  }

  salListEl.innerHTML = data.map((l) => {
    const positivo = l.tipo === 'venda';
    const sinal = positivo ? '+' : '-';
    const desc = positivo
      ? (l.descricao || `Comissão (venda de ${formatMoney(l.venda_base)})`)
      : (l.descricao || 'Pagamento');
    return `
      <li class="lancamento-item">
        <div class="lancamento-info">
          <span class="lancamento-desc">${desc}</span>
          <span class="lancamento-data">${formatDataBR(l.data)}</span>
        </div>
        <span class="lancamento-valor ${positivo ? 'positivo' : 'negativo'}">${sinal} ${formatMoney(l.valor)}</span>
      </li>
    `;
  }).join('');
}

salVendaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  salVendaErrorEl.hidden = true;

  const vendaBase = parseMoney(salVendaValorInput.value);
  const data = salVendaDataInput.value;
  const descricao = salVendaDescricaoInput.value.trim();

  if (!vendaBase || vendaBase <= 0) {
    salVendaErrorEl.textContent = 'Informe um valor de venda válido.';
    salVendaErrorEl.hidden = false;
    return;
  }

  const comissao = round2(vendaBase * PERCENTUAL_COMISSAO);

  const { error } = await supabase.from(SAL_TABLE).insert({
    tipo: 'venda',
    valor: comissao,
    venda_base: vendaBase,
    descricao: descricao || null,
    data,
  });

  if (error) {
    salVendaErrorEl.textContent = 'Erro ao salvar. Tente novamente.';
    salVendaErrorEl.hidden = false;
    return;
  }

  salVendaForm.reset();
  salVendaDataInput.value = hojeISO();
  updateSalVendaSubmitLabel();
  await carregarSalario();
});

salPagamentoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  salPagamentoErrorEl.hidden = true;

  const valor = parseMoney(salPagamentoValorInput.value);
  const data = salPagamentoDataInput.value;
  const descricao = salPagamentoDescricaoInput.value.trim() || 'Saque';

  if (!valor || valor <= 0) {
    salPagamentoErrorEl.textContent = 'Informe um valor válido.';
    salPagamentoErrorEl.hidden = false;
    return;
  }

  const { error } = await supabase.from(SAL_TABLE).insert({
    tipo: 'pagamento',
    valor,
    data,
    descricao,
  });

  if (error) {
    salPagamentoErrorEl.textContent = 'Erro ao salvar. Tente novamente.';
    salPagamentoErrorEl.hidden = false;
    return;
  }

  salPagamentoForm.reset();
  salPagamentoDataInput.value = hojeISO();
  salPagamentoDescricaoInput.value = 'Saque';
  await carregarSalario();
});

// ===================== CONTAS A PAGAR =====================

const cpTotalMesEl = document.getElementById('cp-total-mes');
const cpListEl = document.getElementById('cp-list');
const cpContasListEl = document.getElementById('cp-contas-list');
const cpForm = document.getElementById('cp-form');
const cpErrorEl = document.getElementById('cp-form-error');
const cpDescricaoInput = document.getElementById('cp-descricao');
const cpValorInput = document.getElementById('cp-valor');
const cpDataInicioInput = document.getElementById('cp-data-inicio');
const cpCampoDataUnicaEl = document.getElementById('cp-campo-data-unica');
const cpCampoParcelasEl = document.getElementById('cp-campo-parcelas');
const cpQtdeParcelasInput = document.getElementById('cp-qtde-parcelas');
const cpDatasParcelasEl = document.getElementById('cp-datas-parcelas');
const cpValorModoEl = document.getElementById('cp-valor-modo');
aplicarMascaraMoney(cpValorInput);

document.querySelectorAll('input[name="cp-tipo"]').forEach((el) => {
  el.addEventListener('change', () => {
    const parcelado = el.value === 'parcelado';
    cpCampoDataUnicaEl.hidden = parcelado;
    cpCampoParcelasEl.hidden = !parcelado;
    cpDataInicioInput.required = !parcelado;
    cpValorModoEl.hidden = !parcelado;
  });
});

cpQtdeParcelasInput.addEventListener('input', () => {
  cpQtdeParcelasInput.value = cpQtdeParcelasInput.value.replace(/\D/g, '');
  const qtde = Math.min(Number(cpQtdeParcelasInput.value) || 0, 24);

  const existentes = cpDatasParcelasEl.querySelectorAll('input[type="date"]');
  if (qtde < existentes.length) {
    existentes.forEach((el, i) => { if (i >= qtde) el.closest('.campo-parcela').remove(); });
    return;
  }

  for (let i = existentes.length; i < qtde; i++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'campo-parcela';
    wrapper.innerHTML = `
      <label>Data da parcela ${i + 1}</label>
      <input type="date" class="cp-data-parcela" required>
    `;
    cpDatasParcelasEl.appendChild(wrapper);
  }
});

// "repetir": valor digitado se repete em cada parcela.
// "dividir": valor digitado é o total, dividido em partes iguais — o
// resto de centavos (por arredondamento) vai pra última parcela, pra
// soma bater exatamente com o total.
function calcularValoresParcelas(valor, qtde, modo) {
  if (modo === 'repetir') {
    return new Array(qtde).fill(round2(valor));
  }

  const partes = new Array(qtde).fill(round2(Math.floor((valor / qtde) * 100) / 100));
  const somaParcial = round2(partes.reduce((acc, v) => acc + v, 0));
  partes[qtde - 1] = round2(partes[qtde - 1] + (valor - somaParcial));
  return partes;
}

// Último dia válido do mês/ano para um dia_vencimento que pode não existir
// em todo mês (ex: dia 31 em abril vira 30).
function ultimoDiaDoMes(ano, mesIndex) {
  return new Date(ano, mesIndex + 1, 0).getDate();
}

function montarDataOcorrencia(ano, mesIndex, diaVencimento) {
  const dia = Math.min(diaVencimento, ultimoDiaDoMes(ano, mesIndex));
  const mm = String(mesIndex + 1).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${ano}-${mm}-${dd}`;
}

// Gera todas as datas de vencimento de uma conta recorrente, de
// data_inicio até `ate` (inclusive), pulando datas em exdates.
function gerarOcorrenciasRecorrenteAte(conta, exdates, ate) {
  const [anoIni, mesIni] = conta.data_inicio.split('-').map(Number);

  const ocorrencias = [];
  let ano = anoIni;
  let mesIndex = mesIni - 1;

  while (true) {
    const data = montarDataOcorrencia(ano, mesIndex, conta.dia_vencimento);
    if (data > ate) break;

    if (data >= conta.data_inicio && !exdates.has(data)) {
      ocorrencias.push(data);
    }

    mesIndex += 1;
    if (mesIndex > 11) {
      mesIndex = 0;
      ano += 1;
    }
  }

  return ocorrencias;
}

// Ocorrências vencidas (< hoje) e não pagas de uma conta recorrente, mais
// as próximas `qtdeFuturas` a partir de hoje (inclusive).
function gerarOcorrenciasRecorrenteParaExibir(conta, exdates, pagosSet, qtdeFuturas) {
  const hoje = hojeISO();

  const atrasadas = gerarOcorrenciasRecorrenteAte(conta, exdates, hoje)
    .filter((data) => data < hoje && !pagosSet.has(`${conta.id}|${data}`));

  const futuras = [];
  const [anoIni, mesIni] = hoje.split('-').map(Number);
  let ano = anoIni;
  let mesIndex = mesIni - 1;

  while (futuras.length < qtdeFuturas) {
    const data = montarDataOcorrencia(ano, mesIndex, conta.dia_vencimento);
    if (data >= hoje && data >= conta.data_inicio && !exdates.has(data)) {
      futuras.push(data);
    }
    mesIndex += 1;
    if (mesIndex > 11) {
      mesIndex = 0;
      ano += 1;
    }
  }

  return [...atrasadas, ...futuras];
}

async function carregarContasPagar() {
  cpDataInicioInput.value = cpDataInicioInput.value || hojeISO();

  const [
    { data: contas, error: errContas },
    { data: exdatesRows, error: errEx },
    { data: parcelasRows, error: errParc },
    { data: pagos, error: errPag },
  ] = await Promise.all([
    supabase.from(CP_TABLE).select('*').order('data_inicio', { ascending: true }),
    supabase.from(CP_EXDATES_TABLE).select('*'),
    supabase.from(CP_PARCELAS_TABLE).select('*'),
    supabase.from(CP_PAGAMENTOS_TABLE).select('*'),
  ]);

  if (errContas || errEx || errParc || errPag) {
    cpListEl.innerHTML = `<li class="empty-state">Erro ao carregar contas a pagar.</li>`;
    cpContasListEl.innerHTML = '';
    return;
  }

  const pagosSet = new Set(pagos.map((p) => `${p.conta_id}|${p.data}`));

  if (contas.length === 0) {
    cpListEl.innerHTML = `<li class="empty-state">Nenhuma conta cadastrada.</li>`;
    cpContasListEl.innerHTML = `<li class="empty-state">Nenhuma conta cadastrada.</li>`;
    cpTotalMesEl.textContent = formatMoney(0);
    return;
  }

  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);
  let totalMes = 0;
  const ocorrenciasParaExibir = [];

  contas.forEach((conta) => {
    let ocorrencias;

    if (conta.tipo === 'parcelado') {
      ocorrencias = parcelasRows
        .filter((p) => p.conta_id === conta.id)
        .map((p) => ({ data: p.data, valor: Number(p.valor) }));
    } else {
      const exdatesDaConta = new Set(
        exdatesRows.filter((e) => e.conta_id === conta.id).map((e) => e.data)
      );
      ocorrencias = gerarOcorrenciasRecorrenteParaExibir(conta, exdatesDaConta, pagosSet, 3)
        .map((data) => ({ data, valor: Number(conta.valor) }));
    }

    ocorrencias.forEach(({ data, valor }) => {
      const paga = pagosSet.has(`${conta.id}|${data}`);
      const atrasada = data < hoje && !paga;
      if (data.slice(0, 7) === mesAtual && !paga) {
        totalMes += valor;
      }
      ocorrenciasParaExibir.push({ conta, data, valor, paga, atrasada });
    });
  });

  ocorrenciasParaExibir.sort((a, b) => a.data.localeCompare(b.data));
  cpTotalMesEl.textContent = formatMoney(totalMes);

  cpListEl.innerHTML = ocorrenciasParaExibir.map(({ conta, data, valor, paga, atrasada }) => `
    <li class="lancamento-item${atrasada ? ' lancamento-atrasada' : ''}">
      <label class="lancamento-checkbox">
        <input type="checkbox" data-conta-id="${conta.id}" data-data="${data}" class="cp-pago-checkbox" ${paga ? 'checked' : ''}>
        <div class="lancamento-info">
          <span class="lancamento-desc">${conta.descricao}${atrasada ? ' <span class="tag-atrasada">Atrasada</span>' : ''}</span>
          <span class="lancamento-data">${formatDataBR(data)}</span>
        </div>
      </label>
      <span class="lancamento-valor negativo">${formatMoney(valor)}</span>
      <button type="button" class="btn-icon cp-pular-btn" data-conta-id="${conta.id}" data-data="${data}" data-tipo="${conta.tipo}" aria-label="Pular esta ocorrência" title="Pular esta ocorrência">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </li>
  `).join('');

  cpContasListEl.innerHTML = contas.map((conta) => {
    const valorExibido = conta.tipo === 'parcelado'
      ? parcelasRows.filter((p) => p.conta_id === conta.id).reduce((acc, p) => acc + Number(p.valor), 0)
      : Number(conta.valor);

    return `
    <li class="lancamento-item">
      <div class="lancamento-info">
        <span class="lancamento-desc">${conta.descricao}</span>
        <span class="lancamento-data">${conta.tipo === 'parcelado' ? 'parcelado' : `mensal — dia ${conta.dia_vencimento}`}</span>
      </div>
      <span class="lancamento-valor negativo">${formatMoney(valorExibido)}</span>
      <button type="button" class="btn-icon cp-remover-btn" data-conta-id="${conta.id}" aria-label="Remover conta" title="Remover conta">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </li>
  `;
  }).join('');
}

cpListEl.addEventListener('change', async (e) => {
  if (!e.target.classList.contains('cp-pago-checkbox')) return;
  const contaId = e.target.dataset.contaId;
  const data = e.target.dataset.data;

  if (e.target.checked) {
    await supabase.from(CP_PAGAMENTOS_TABLE).insert({ conta_id: contaId, data });
  } else {
    await supabase.from(CP_PAGAMENTOS_TABLE).delete().eq('conta_id', contaId).eq('data', data);
  }
  await carregarContasPagar();
});

cpListEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('.cp-pular-btn');
  if (!btn) return;

  if (btn.dataset.tipo === 'parcelado') {
    await supabase.from(CP_PARCELAS_TABLE).delete().eq('conta_id', btn.dataset.contaId).eq('data', btn.dataset.data);
  } else {
    await supabase.from(CP_EXDATES_TABLE).insert({ conta_id: btn.dataset.contaId, data: btn.dataset.data });
  }
  await carregarContasPagar();
});

cpContasListEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('.cp-remover-btn');
  if (!btn) return;
  if (!confirm('Remover esta conta e todo o seu histórico de pagamentos/parcelas/exceções?')) return;
  await supabase.from(CP_TABLE).delete().eq('id', btn.dataset.contaId);
  await carregarContasPagar();
});

cpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  cpErrorEl.hidden = true;

  const descricao = cpDescricaoInput.value.trim();
  const valor = parseMoney(cpValorInput.value);
  const tipo = document.querySelector('input[name="cp-tipo"]:checked').value;

  if (!valor || valor <= 0) {
    cpErrorEl.textContent = 'Informe um valor válido.';
    cpErrorEl.hidden = false;
    return;
  }

  if (tipo === 'recorrente') {
    const dataInicio = cpDataInicioInput.value;
    if (!dataInicio) {
      cpErrorEl.textContent = 'Informe a data.';
      cpErrorEl.hidden = false;
      return;
    }

    const dia = Number(dataInicio.split('-')[2]);
    const { error } = await supabase.from(CP_TABLE).insert({
      descricao,
      valor,
      tipo: 'recorrente',
      dia_vencimento: dia,
      data_inicio: dataInicio,
    });

    if (error) {
      cpErrorEl.textContent = 'Erro ao salvar. Tente novamente.';
      cpErrorEl.hidden = false;
      return;
    }
  } else {
    const datasParcelas = Array.from(cpDatasParcelasEl.querySelectorAll('.cp-data-parcela')).map((el) => el.value);

    if (datasParcelas.length === 0 || datasParcelas.some((d) => !d)) {
      cpErrorEl.textContent = 'Informe a quantidade de parcelas e preencha todas as datas.';
      cpErrorEl.hidden = false;
      return;
    }

    const modoValor = document.querySelector('input[name="cp-valor-modo"]:checked').value;
    const valoresParcelas = calcularValoresParcelas(valor, datasParcelas.length, modoValor);
    const dataInicio = [...datasParcelas].sort()[0];

    const { data: contaCriada, error } = await supabase.from(CP_TABLE).insert({
      descricao,
      tipo: 'parcelado',
      data_inicio: dataInicio,
    }).select().single();

    if (error) {
      cpErrorEl.textContent = 'Erro ao salvar. Tente novamente.';
      cpErrorEl.hidden = false;
      return;
    }

    const { error: errParcelas } = await supabase.from(CP_PARCELAS_TABLE).insert(
      datasParcelas.map((data, i) => ({ conta_id: contaCriada.id, data, valor: valoresParcelas[i] }))
    );

    if (errParcelas) {
      cpErrorEl.textContent = 'Conta criada, mas houve erro ao salvar as parcelas.';
      cpErrorEl.hidden = false;
      return;
    }
  }

  cpForm.reset();
  cpDataInicioInput.value = hojeISO();
  cpCampoDataUnicaEl.hidden = false;
  cpCampoParcelasEl.hidden = true;
  cpValorModoEl.hidden = true;
  cpDatasParcelasEl.innerHTML = '';
  await carregarContasPagar();
});

// ===================== INIT =====================

checkSession();
