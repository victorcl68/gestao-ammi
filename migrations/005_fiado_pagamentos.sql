-- Migration 005: pagamentos parciais do Fiado.
--
-- Cada pagamento pertence a uma pessoa e reduz o saldo devido por ela.
-- A exclusão da pessoa remove também seus pagamentos.

create table fiado_pagamentos (
  id          uuid primary key default gen_random_uuid(),
  pessoa_id   uuid not null references fiado_pessoas (id) on delete cascade,
  valor       numeric(12,2) not null check (valor > 0),
  descricao   text,
  data        date not null,
  created_at  timestamptz not null default now()
);

create index fiado_pagamentos_pessoa_id on fiado_pagamentos (pessoa_id);

alter table fiado_pagamentos enable row level security;

create policy "auth_all" on fiado_pagamentos
  for all to authenticated using (true) with check (true);
