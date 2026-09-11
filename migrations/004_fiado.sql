-- Migration 004: Fiado.
--
-- Módulo isolado, sem ligação com nenhum outro (Caixa Casa, Salário,
-- Contas a Pagar). Serve só para documentar vendas fiadas por pessoa —
-- não há controle de pagamento nem abatimento de saldo, é puramente
-- um registro histórico.
--
-- fiado_pessoas: quem deve. fiado_vendas: cada venda fiada (valor +
-- descrição dos itens), uma pessoa tem várias vendas. O saldo devido de
-- uma pessoa é sempre a soma de todas as suas vendas.

create table fiado_pessoas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  created_at  timestamptz not null default now()
);

create table fiado_vendas (
  id          uuid primary key default gen_random_uuid(),
  pessoa_id   uuid not null references fiado_pessoas (id) on delete cascade,
  valor       numeric(12,2) not null check (valor > 0),
  descricao   text,
  data        date not null,
  created_at  timestamptz not null default now()
);

create index fiado_vendas_pessoa_id on fiado_vendas (pessoa_id);

alter table fiado_pessoas enable row level security;
alter table fiado_vendas enable row level security;

create policy "auth_all" on fiado_pessoas
  for all to authenticated using (true) with check (true);

create policy "auth_all" on fiado_vendas
  for all to authenticated using (true) with check (true);
