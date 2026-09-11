import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ===================== CONFIG =====================

const SUPABASE_URL = 'https://odjryakghivbwyftfjar.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_SHyvOxJ8tz2BMFDJ1nZL0w_hUQbIGUc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CC_TABLE = 'caixa_casa_lancamentos';
const SAL_TABLE = 'salario_lancamentos';
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

// ===================== INIT =====================

checkSession();
