-- Migration 003: ajuste pontual de valor em Contas a Pagar.
--
-- Permite corrigir o valor de UMA ocorrência específica sem alterar o
-- padrão da conta nem as demais ocorrências (ex: a conta de luz costuma
-- vir R$100, mas esse mês veio R$120).
--
-- Só se aplica a contas 'recorrente': para 'parcelado', cada parcela já
-- tem seu próprio valor em contas_pagar_parcelas, editável diretamente.

create table contas_pagar_ajustes (
  conta_id  uuid not null references contas_pagar (id) on delete cascade,
  data      date not null,
  valor     numeric(12,2) not null check (valor > 0),
  primary key (conta_id, data)
);

alter table contas_pagar_ajustes enable row level security;

create policy "auth_all" on contas_pagar_ajustes
  for all to authenticated using (true) with check (true);
