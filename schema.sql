-- Rode este script no SQL Editor do seu projeto Supabase.

create table caixa_casa_lancamentos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('entrada', 'saida')),
  valor       numeric(12,2) not null check (valor > 0),
  descricao   text,
  data        date not null,
  created_at  timestamptz not null default now()
);

create table salario_lancamentos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('venda', 'pagamento')),
  valor       numeric(12,2) not null check (valor > 0),
  venda_base  numeric(12,2),
  descricao   text,
  data        date not null,
  created_at  timestamptz not null default now()
);

create index caixa_casa_lancamentos_data on caixa_casa_lancamentos (data desc);
create index salario_lancamentos_data on salario_lancamentos (data desc);

-- Segurança: só usuários autenticados podem ler/gravar. Sem cadastro público
-- habilitado, isso equivale a "só você e a gerente com o login combinado".
alter table caixa_casa_lancamentos enable row level security;
alter table salario_lancamentos enable row level security;

create policy "auth_all" on caixa_casa_lancamentos
  for all to authenticated using (true) with check (true);

create policy "auth_all" on salario_lancamentos
  for all to authenticated using (true) with check (true);

-- IMPORTANTE: no painel Supabase, em Authentication > Providers > Email,
-- desative "Allow new users to sign up" e crie manualmente o único usuário
-- em Authentication > Users. Isso evita que qualquer pessoa crie conta.
