-- Migration 002: Contas a Pagar.
--
-- Duas formas de conta:
-- - 'recorrente': repete todo mês no mesmo dia (dia_vencimento), sem fim.
--   Exceções pontuais (pular uma ocorrência) ficam em contas_pagar_exdates,
--   no espírito do EXDATE do iCalendar.
-- - 'parcelado': um número fixo de parcelas com datas escolhidas à mão,
--   sem nenhum padrão de recorrência. As datas ficam em
--   contas_pagar_parcelas — uma linha por parcela.
--
-- Pagamentos (marcar uma ocorrência/parcela como paga) ficam em
-- contas_pagar_pagamentos pros dois casos, sem tocar na regra/parcelas.

-- Para 'recorrente', o valor mora em contas_pagar.valor (mesmo valor em
-- toda ocorrência). Para 'parcelado', cada parcela tem seu próprio valor
-- em contas_pagar_parcelas.valor — pode ser o valor total repetido em
-- cada uma, ou o total dividido pela quantidade (a UI decide, o banco só
-- guarda o valor final de cada parcela) — então contas_pagar.valor fica
-- nulo nesse caso.
create table contas_pagar (
  id              uuid primary key default gen_random_uuid(),
  descricao       text not null,
  valor           numeric(12,2) check (valor > 0),
  tipo            text not null check (tipo in ('recorrente', 'parcelado')),
  dia_vencimento  integer check (dia_vencimento between 1 and 31),
  data_inicio     date not null,
  created_at      timestamptz not null default now(),
  constraint valores_por_tipo check (
    (tipo = 'recorrente' and dia_vencimento is not null and valor is not null) or
    (tipo = 'parcelado' and dia_vencimento is null and valor is null)
  )
);

create table contas_pagar_exdates (
  conta_id  uuid not null references contas_pagar (id) on delete cascade,
  data      date not null,
  primary key (conta_id, data)
);

create table contas_pagar_parcelas (
  conta_id  uuid not null references contas_pagar (id) on delete cascade,
  data      date not null,
  valor     numeric(12,2) not null check (valor > 0),
  primary key (conta_id, data)
);

create table contas_pagar_pagamentos (
  conta_id  uuid not null references contas_pagar (id) on delete cascade,
  data      date not null,
  primary key (conta_id, data)
);

alter table contas_pagar enable row level security;
alter table contas_pagar_exdates enable row level security;
alter table contas_pagar_parcelas enable row level security;
alter table contas_pagar_pagamentos enable row level security;

create policy "auth_all" on contas_pagar
  for all to authenticated using (true) with check (true);

create policy "auth_all" on contas_pagar_exdates
  for all to authenticated using (true) with check (true);

create policy "auth_all" on contas_pagar_parcelas
  for all to authenticated using (true) with check (true);

create policy "auth_all" on contas_pagar_pagamentos
  for all to authenticated using (true) with check (true);
