-- Migration 006: aportes parciais em Empréstimos.
--
-- Cada aporte reduz o saldo de uma ocorrência de Contas a Pagar chamada
-- exatamente "Empréstimo". A origem indica se o aporte foi informado
-- manualmente ou gerado a partir de 25% de uma venda bruta.

create table emprestimo_aportes (
  id                       uuid primary key default gen_random_uuid(),
  conta_id                 uuid not null references contas_pagar (id) on delete cascade,
  data_ocorrencia          date not null,
  valor                    numeric(12,2) not null check (valor > 0),
  origem                   text not null check (origem in ('manual', 'venda')),
  salario_lancamento_id    uuid references salario_lancamentos (id) on delete set null,
  data                     date not null,
  created_at               timestamptz not null default now()
);

create unique index emprestimo_aportes_venda_unica
  on emprestimo_aportes (salario_lancamento_id)
  where salario_lancamento_id is not null;

create index emprestimo_aportes_ocorrencia
  on emprestimo_aportes (conta_id, data_ocorrencia);

alter table emprestimo_aportes enable row level security;

revoke all on table emprestimo_aportes from anon, authenticated;
grant select, insert on table emprestimo_aportes to authenticated;

create policy "auth_all" on emprestimo_aportes
  for all to authenticated using (true) with check (true);
