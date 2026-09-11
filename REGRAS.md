# Regras de negócio — Gestão Ammi

Documento de referência das **regras, cálculos e decisões** do sistema.
Não trata de stack, setup ou como rodar — só do que o sistema faz e por quê.
O objetivo é que essas regras não se percam com o tempo, já que boa parte
delas não é óbvia lendo o código e nenhuma está registrada em outro lugar.

Última revisão: 2026-09-13 (atualização).

---

## Índice

- [Conceitos gerais](#conceitos-gerais)
- [Módulo: Caixa Casa](#módulo-caixa-casa)
- [Módulo: Salário](#módulo-salário)
- [Módulo: Contas a Pagar](#módulo-contas-a-pagar)
  - [Conta Mensal (recorrente)](#conta-mensal-recorrente)
  - [Conta Parcelada](#conta-parcelada)
  - [Pagamento de ocorrências](#pagamento-de-ocorrências)
  - [Pular ocorrência](#pular-ocorrência)
  - [Ajuste de valor](#ajuste-de-valor)
  - [Atrasadas](#atrasadas)
  - [Total a pagar no mês](#total-a-pagar-no-mês)
  - [Agrupamento por semana](#agrupamento-por-semana)
- [Regras transversais](#regras-transversais)
- [Comportamentos conhecidos e limitações](#comportamentos-conhecidos-e-limitações)

---

## Conceitos gerais

### Os três módulos são independentes

Caixa Casa, Salário e Contas a Pagar **não se comunicam**. Não existe
transferência entre eles, nem saldo consolidado. São três controles
separados que por acaso vivem na mesma tela.

Consequência prática: pagar uma conta em Contas a Pagar **não** debita
nada do Caixa Casa. Se esse dinheiro saiu do caixa de casa, o lançamento
tem que ser feito manualmente nos dois lugares.

### Dinheiro

- Todo valor é `numeric(12,2)` no banco e sempre **positivo** (`check (valor > 0)`).
- O sinal (entrada/saída) vem do campo `tipo`, nunca do sinal do número.
- Arredondamento sempre a 2 casas, via `Math.round(n * 100) / 100`.
- Entrada do usuário aceita o formato brasileiro (`1.234,56`): o ponto é
  separador de milhar e a vírgula é decimal. A máscara aplica isso enquanto
  a pessoa digita, tratando os dígitos como centavos da direita para a
  esquerda (digitar `12345` resulta em `123,45`).

### Datas

- Datas são sempre `YYYY-MM-DD` (string), nunca objeto `Date` serializado.
  Isso permite comparar datas com comparação de string (`data < hoje`), que
  é usada em várias regras.
- "Hoje" é sempre calculado no fuso **America/Sao_Paulo**, não no fuso do
  dispositivo. Um celular configurado em outro fuso continua vendo o mesmo
  "hoje" que o sistema considera.
- Exibição é sempre `DD/MM/AAAA`.

### Acesso

Todos os usuários autenticados veem e editam **os mesmos dados**. Não há
separação por usuário, nem papéis/permissões diferentes. Quem tem login vê
tudo. O cadastro público de novos usuários fica desativado no Supabase, e
os logins são criados manualmente — essa é a única barreira de acesso.

A sessão é limitada a **9 horas** (configurado no painel do Supabase, em
*Authentication → Sessions → Time-box user sessions*). Sem esse ajuste, o
Supabase renovaria o token indefinidamente e a sessão nunca expiraria.

A chave usada no frontend é a pública (*anon* / *publishable*) e pode ficar
exposta no código — a proteção real vem das políticas de RLS, que exigem
usuário autenticado para qualquer leitura ou escrita.

---

## Módulo: Caixa Casa

Controla o dinheiro retirado do caixa da loja e guardado fisicamente em casa.

### Lançamentos

Cada lançamento é `entrada` ou `saida`, com valor, data e descrição.

| Campo | Regra |
|---|---|
| `valor` | Obrigatório, maior que zero |
| `data` | Obrigatória, default = hoje |
| `descricao` | **Obrigatória em saídas**, opcional em entradas |

A descrição é obrigatória só para saídas porque a intenção é sempre saber
para onde o dinheiro foi. Entrada sem descrição é aceitável (é só dinheiro
entrando), e nesse caso a lista exibe "Entrada" como rótulo.

### Descrições pré-preenchidas

Ao alternar o tipo, o campo de descrição é **sobrescrito** com um valor padrão:

- Entrada → `Suprimento`
- Saída → `Aluguel`

São os casos mais frequentes na prática. O campo continua editável — o
padrão é só para economizar digitação, não uma categoria fixa.

Atenção: alternar o tipo sobrescreve o que já estava digitado no campo.

### Saldo

```
saldo = Σ(entradas) − Σ(saídas)
```

Calculado **sobre os lançamentos carregados**, que são os 50 mais recentes
(ver [Comportamentos conhecidos](#comportamentos-conhecidos-e-limitações)).

Saldo negativo é exibido em vermelho. Não há bloqueio para saldo negativo —
o sistema registra o que aconteceu, não impede lançamentos.

---

## Módulo: Salário

Controla a remuneração da gerente: comissão sobre vendas menos os pagamentos
já feitos a ela. O saldo representa **quanto ainda é devido**.

### Comissão

```
comissão = valor_da_venda × 0,25
```

O percentual é fixo em **25%** (`PERCENTUAL_COMISSAO`), definido no código.
Não há como alterar pela interface — mudar exige editar o código.

Quando você lança uma venda:

- O campo "Valor" é o **total vendido**, não a comissão.
- O sistema calcula a comissão e é **ela** que vai para `valor` no banco.
- O total vendido é preservado em `venda_base`, para rastreabilidade.

O botão "Salvar" mostra em tempo real a comissão que será gravada
(`Salvar — R$ 25,00`), para conferência antes de confirmar.

### Pagamento

Um pagamento é dinheiro entregue à gerente, que **abate** o saldo devido.
Descrição tem default `Saque` e é obrigatória (se esvaziada, volta a `Saque`).

### Saldo

```
saldo = Σ(comissões) − Σ(pagamentos)
```

Interpretação: **saldo positivo = ainda se deve à gerente**. Saldo negativo
significa que ela recebeu adiantado, além do que foi comissionado até então.

### Rótulo na lista

Uma venda sem descrição aparece como `Comissão (venda de R$ X)`, onde X é o
`venda_base`. Com descrição preenchida, a descrição substitui esse texto —
e o valor da venda base deixa de aparecer na lista.

---

## Módulo: Contas a Pagar

Controla contas futuras. Diferente dos outros dois módulos, aqui não se
registra o que já aconteceu — se registra o que **vai** acontecer, e depois
marca-se o que foi pago.

### Princípio central: regra vs. ocorrência

Esta é a decisão de arquitetura mais importante do módulo, e a que menos se
deduz olhando a tela:

> **Ocorrências futuras não são gravadas no banco.** O banco guarda a *regra*
> (ou a lista de parcelas); as datas concretas são calculadas em memória,
> toda vez que a tela carrega.

Por isso uma conta mensal "sem fim" não gera linhas infinitas — ela é uma
linha só, e a lista de datas é derivada dela.

Tudo que é **exceção** à regra (pular, pagar, ajustar valor) vive em tabelas
auxiliares separadas, indexadas por `(conta_id, data)`. A regra original
nunca é alterada por essas ações. O modelo é inspirado no `EXDATE` do
iCalendar, onde a recorrência é uma regra e as exceções são uma lista à parte.

### Os dois tipos de conta

Uma conta é **`recorrente`** (exibida como "Mensal") ou **`parcelado`**.
São mutuamente exclusivos e o banco garante isso por constraint:

| Campo | `recorrente` | `parcelado` |
|---|---|---|
| `valor` | Obrigatório | **Sempre nulo** |
| `dia_vencimento` | Obrigatório (1–31) | **Sempre nulo** |
| `data_inicio` | Data escolhida | Menor data entre as parcelas |
| Datas das ocorrências | Calculadas da regra | Linhas em `contas_pagar_parcelas` |
| Onde mora o valor | `contas_pagar.valor` | `contas_pagar_parcelas.valor` |

---

### Conta Mensal (recorrente)

Repete todo mês no mesmo dia, **sem data de fim**. Não existe recorrência
mensal com prazo — para isso, use Parcelado.

#### Dia do vencimento é derivado, não digitado

O `dia_vencimento` é extraído do dia da data informada em "Data". Escolher
15/03 cria uma conta que vence todo dia 15. Não existe campo separado para
o dia — ele existiria apenas para poder divergir da data, o que seria
contraditório.

#### Meses que não têm o dia

Um `dia_vencimento` de 31 não existe em todos os meses. A regra é
**ancorar no último dia do mês**:

```
dia_efetivo = min(dia_vencimento, último_dia_do_mês)
```

Dia 31 vira 30 em abril e 28 (ou 29) em fevereiro. O `dia_vencimento` da
conta permanece 31 — a redução acontece só no cálculo da ocorrência, então
março seguinte volta a cair no dia 31.

#### Quantas ocorrências aparecem

A lista mostra, por conta:

- **Todas** as ocorrências vencidas e não pagas (sem limite, desde `data_inicio`)
- As **3 próximas** a partir de hoje (inclusive)

O limite de 3 é sobre as futuras, não sobre o total. Uma conta com 5 meses
de atraso mostra 5 atrasadas + 3 futuras = 8 linhas.

Uma ocorrência já paga **continua aparecendo** (com o checkbox marcado) e
ocupa uma das 3 vagas de futuras. Isso é intencional: permite desmarcar um
pagamento feito por engano direto na lista, sem precisar procurar em outro
lugar.

---

### Conta Parcelada

Um número fixo de parcelas com **datas escolhidas manualmente, uma a uma**.
Não há padrão de recorrência: 3 parcelas podem ser 01/01, 15/01 e 01/03.

Isso existe porque nem toda conta parcelada segue um ritmo previsível —
forçá-las num modelo de recorrência exigiria exceções demais.

#### Fluxo

Informa-se a quantidade de parcelas, e o formulário gera esse número de
campos de data para preencher. **Limite: 24 parcelas.** Reduzir a
quantidade remove os campos do fim; aumentar acrescenta campos vazios.

`data_inicio` da conta é preenchida automaticamente com a **menor** data
entre as parcelas (não a primeira digitada — a cronologicamente menor).

#### Repetir vs. Dividir

O switch ao lado do campo Valor define como interpretar o número digitado:

**Repetir** — o valor é de **cada** parcela.
```
3 parcelas, valor 100  →  100, 100, 100   (total 300)
```

**Dividir** — o valor é o **total**, rateado entre as parcelas.
```
3 parcelas, valor 100  →  33,33, 33,33, 33,34   (total 100)
```

Na divisão, cada parcela recebe o valor truncado para baixo em centavos, e
**a diferença acumulada vai toda para a última parcela**. Isso garante que
a soma das parcelas seja exatamente igual ao total informado, sem perder
nem criar centavos.

O modo escolhido **não é gravado**. Após o cálculo, o banco só guarda o
valor final de cada parcela — não há como saber depois se foi repetido ou
dividido, nem "recalcular" alterando o total.

---

### Pagamento de ocorrências

O checkbox grava/apaga uma linha em `contas_pagar_pagamentos` para aquele
`(conta_id, data)`.

Marcar como paga **não altera** a conta nem a parcela: só registra que
aquela data específica foi quitada. Desmarcar apaga o registro e a
ocorrência volta a contar como pendente.

Não há registro de valor pago nem de data de pagamento — apenas o fato
booleano de que aquela ocorrência foi paga.

Ocorrências pagas ficam misturadas no mesmo bloco de semana das não pagas,
ordenadas por data como as demais — não há seção separada. A única
diferença visual é o checkbox já vir marcado, e os botões de editar valor
e pular não aparecem numa ocorrência já paga.

---

### Pular ocorrência

O botão "×" remove uma ocorrência específica, mas o efeito **difere por tipo**:

| Tipo | O que acontece | Reversível? |
|---|---|---|
| Mensal | Insere em `contas_pagar_exdates`. A regra continua; só aquela data é omitida. | Só apagando a linha direto no banco |
| Parcelado | **Apaga a parcela** de `contas_pagar_parcelas`. | Não — o dado some |

Em conta Mensal, pular é o mecanismo para "esse mês não teve" sem quebrar a
recorrência dos meses seguintes.

Em conta Parcelada, pular é destrutivo: a parcela deixa de existir e o total
da conta diminui. É a única forma de encurtar um parcelamento.

---

### Ajuste de valor

Permite corrigir o valor de uma ocorrência quando o valor cadastrado era uma
aproximação (conta de luz, água, etc.).

| Tipo | Onde grava | Efeito |
|---|---|---|
| Mensal | `contas_pagar_ajustes` (upsert em `conta_id`+`data`) | Só aquela data. Demais ocorrências seguem com `contas_pagar.valor` |
| Parcelado | `UPDATE` em `contas_pagar_parcelas.valor` | Altera a parcela em definitivo |

Em conta Mensal, o ajuste é **sempre pontual**: nunca altera o valor padrão
da conta nem afeta meses seguintes. Para mudar o valor "de verdade" de uma
conta mensal, não há caminho pela interface — seria preciso recriar a conta.

Na exibição, o valor de cada ocorrência é `ajuste ?? valor_padrão` — o ajuste
tem precedência quando existe.

---

### Atrasadas

Uma ocorrência é **atrasada** quando:

```
data < hoje  E  não está marcada como paga
```

Atrasadas aparecem com borda vermelha e a tag "Atrasada", e **não têm limite
de quantidade** — todas são exibidas, desde a `data_inicio` da conta.

Elas continuam aparecendo indefinidamente até serem pagas ou puladas. É
proposital: uma conta vencida não some da vista sozinha.

---

### Total a pagar no mês

Exibido no topo do módulo, no formato `R$ X de R$ Y`:

```
X = soma das ocorrências do mês corrente que NÃO estão pagas
Y = X + soma das ocorrências do mês corrente que ESTÃO pagas
```

Ou seja: **X é quanto ainda falta pagar**, **Y é o custo total do mês**
(pago + pendente). Y nunca é menor que X.

Implicações que não são óbvias:

- **Atrasadas de meses anteriores não entram em nenhum dos dois números**,
  mesmo aparecendo na lista principal. O cálculo é estritamente do mês
  corrente (comparação por `AAAA-MM`).
- Usa o valor efetivo de cada ocorrência (com ajuste aplicado, se houver).
- Uma conta paga logo no início do mês some do "X" mas continua contando
  para o "Y" — o card mostra o esforço que falta, não some com o que já
  foi resolvido.

---

### Agrupamento por semana

A lista de ocorrências é dividida em blocos com cabeçalho `Mês — Semana N`.

#### Definição de semana

Semana de **calendário real, começando no domingo** (não blocos fixos de 7
dias a partir do dia 1).

Consequência: a Semana 1 pode ter menos de 7 dias. Se o mês começa numa
terça, a Semana 1 tem 5 dias (terça a sábado), porque o domingo daquela
semana ficou no mês anterior.

#### Agrupamento é por mês da data

Uma semana que atravessa a virada do mês é **cortada**: uma ocorrência em
30/09 fica na última semana de *setembro*, mesmo que essa semana continue
até 03/10. Cada mês fecha suas próprias semanas.

Isso evita que um bloco misture datas de dois meses diferentes. Como
consequência, a última semana de um mês pode ter poucos dias (às vezes só
1) — e ainda assim **sempre aparece como bloco próprio**, sem fundir com a
semana anterior. A antiga regra de fusão (que juntava a última semana com
a penúltima quando tinha 3 dias ou menos) foi removida por decisão do
usuário: prefere ver a semana curta separada a arriscar perder alguma
ocorrência de vista dentro de um bloco maior.

#### Destaque da semana atual

O cabeçalho da semana que contém a data de hoje ganha uma cor de destaque e
um pontinho ao lado — discreto, mas suficiente para localizar rapidamente
"onde estou" na lista.

#### Total por semana

Cada bloco mostra, no cabeçalho, a soma dos valores de todas as suas
ocorrências (pagas e não pagas), alinhada à direita. Não distingue pago de
não pago — é o total do que está programado para aquela semana.

---

## Regras transversais

### Nada é editável depois de salvo (com uma exceção)

Lançamentos de Caixa Casa e Salário **não podem ser editados nem excluídos**
pela interface. Uma vez salvos, são definitivos — correções exigem acesso
direto ao banco.

A única edição disponível em todo o sistema é o valor de uma ocorrência de
Contas a Pagar, e ainda assim porque ali o "lançamento" é uma previsão, não
um fato consumado.

### Exclusão de conta é em cascata

Remover uma conta em "Contas cadastradas" apaga também, por `on delete
cascade`, todas as suas parcelas, exdates, pagamentos e ajustes. Não há
lixeira nem desfazer. Por isso a ação pede confirmação.

### Valores na lista "Contas cadastradas"

O valor exibido ali tem significado **diferente** conforme o tipo:

- Mensal → o valor de **uma** ocorrência (o valor mensal)
- Parcelado → a **soma de todas** as parcelas (o total da conta)

Ajustes pontuais de contas mensais não aparecem nesse número — ele mostra
sempre o valor padrão da conta.

---

## Comportamentos conhecidos e limitações

Coisas que funcionam assim de propósito, ou que são limitações aceitas.
Registradas aqui para não serem "descobertas" como bug no futuro.

### Limite de 50 lançamentos afeta o saldo

Caixa Casa e Salário carregam apenas os **50 lançamentos mais recentes**, e
o saldo é calculado sobre esses 50. Quando qualquer um dos módulos passar de
50 lançamentos, **o saldo exibido deixa de ser o saldo real** — passa a ser
o saldo dos últimos 50.

Este é o ponto mais provável de virar um problema real com o tempo. A
correção exige calcular o saldo no banco (agregação) em vez de no cliente.

### Comissão de 25% é fixa no código

Alterar exige mudar `PERCENTUAL_COMISSAO` e republicar. Lançamentos antigos
mantêm a comissão já calculada — a mudança não é retroativa, o que é o
comportamento correto, mas significa que o histórico pode ter percentuais
mistos sem nenhuma indicação de qual foi usado.

### Contas mensais não têm fim

Por decisão de escopo. Uma conta que precisa acabar deve ser cadastrada como
Parcelada. Se uma conta mensal precisar ser encerrada, a única saída é
removê-la — o que apaga também todo o histórico de pagamentos dela.

### Recorrência só mensal

Não existe recorrência semanal, quinzenal ou anual. Uma conta semanal teria
que ser cadastrada como parcelada com muitas datas (limite de 24).

### Ajuste de valor sem histórico

O ajuste sobrescreve (upsert). Não fica registro do valor anterior nem de
quando foi alterado.

### Pular parcela é destrutivo

Já mencionado acima, mas vale repetir por ser assimétrico com o
comportamento de conta mensal: em conta parcelada não existe "exdate", a
parcela é apagada de verdade.

### Ajustes órfãos

Se uma ocorrência mensal com ajuste for pulada (exdate), o ajuste
permanece na tabela sem nunca ser usado. Inofensivo — se a exdate for
removida algum dia, o ajuste volta a valer.

### Conta mensal sempre gera 3 futuras, custe o que custar

A busca pelas 3 próximas ocorrências percorre mês a mês até encontrar 3
datas válidas. Se a conta tiver `data_inicio` muito no futuro, ou muitos
meses seguidos com exdate, o cálculo percorre todos esses meses antes de
achar as 3. Não trava (sempre há um mês futuro válido), mas é um laço sem
limite superior de iterações.

### Chave primária impede duplicatas por data

Como todas as tabelas auxiliares têm PK `(conta_id, data)`, uma conta não
pode ter duas ocorrências no mesmo dia. Isso é irrelevante para contas
mensais (uma por mês), mas **impede cadastrar duas parcelas na mesma data**
dentro da mesma conta.
