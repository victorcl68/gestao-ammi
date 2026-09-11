-- Migration 002: Contas a Pagar recorrentes (recorrência mensal, dia fixo
-- do mês). data_fim nula = recorrência sem fim. Segue o espírito do EXDATE
-- do iCalendar: exceções (pular uma ocorrência) e pagamentos (marcar uma
-- ocorrência como paga) ficam em tabelas à parte, sem tocar na regra.

create table contas_pagar (
  id              uuid primary key default gen_random_uuid(),
  descricao       text not null,
  valor           numeric(12,2) not null check (valor > 0),
  dia_vencimento  integer not null check (dia_vencimento between 1 and 31),
  data_inicio     date not null,
  data_fim        date,
  created_at      timestamptz not null default now()
);

create table contas_pagar_exdates (
  conta_id  uuid not null references contas_pagar (id) on delete cascade,
  data      date not null,
  primary key (conta_id, data)
);

create table contas_pagar_pagamentos (
  conta_id  uuid not null references contas_pagar (id) on delete cascade,
  data      date not null,
  primary key (conta_id, data)
);

alter table contas_pagar enable row level security;
alter table contas_pagar_exdates enable row level security;
alter table contas_pagar_pagamentos enable row level security;

create policy "auth_all" on contas_pagar
  for all to authenticated using (true) with check (true);

create policy "auth_all" on contas_pagar_exdates
  for all to authenticated using (true) with check (true);

create policy "auth_all" on contas_pagar_pagamentos
  for all to authenticated using (true) with check (true);
