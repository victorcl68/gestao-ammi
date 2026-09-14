# Instruções para agentes

Projeto pessoal de controle financeiro de uma loja. HTML/CSS/JS puro, sem
build, sem framework, sem dependências instaladas. Backend é Supabase.

## Leia isto antes de mexer em qualquer lógica

**[REGRAS.md](REGRAS.md) é a fonte de verdade das regras de negócio.**

Leia antes de alterar qualquer cálculo, regra de exibição ou comportamento
de Caixa Casa, Salário ou Contas a Pagar. Boa parte das regras não é óbvia
lendo o código: o modelo regra-vs-ocorrência de Contas a Pagar, o rateio de
parcelas, a definição de semana, quais ações são destrutivas e quais são
reversíveis.

Se uma mudança alterar alguma regra descrita lá, **atualize o REGRAS.md no
mesmo commit**. Documentação desatualizada é pior que documentação ausente.

## Preferências de trabalho

### Evite overengineering, sempre

Esta é a preferência mais importante do projeto. O usuário rejeita
explicitamente abstrações prematuras — uma proposta de "arquitetura
hexagonal com plugins" para adicionar um módulo foi recusada por isso.

- Não crie camadas, interfaces ou indireções que o projeto não precisa hoje
- Não adicione tratamento de erro para cenários que não acontecem
- Três linhas parecidas são melhores que uma abstração prematura
- Escopo fechado: implemente o que foi pedido, não o que talvez venha depois

### Tudo em três arquivos

`index.html`, `style.css`, `app.js`. Não crie arquivos JS/CSS novos para
separar módulos — o usuário pediu explicitamente para manter tudo junto.
A separação é por blocos comentados dentro do `app.js`:

```
// ===================== CAIXA CASA =====================
```

### Confirme antes de decidir por conta própria

Quando houver ambiguidade real (nome de campo, comportamento de uma regra,
escopo de uma feature), pergunte em vez de assumir. O usuário responde
rápido e prefere corrigir o rumo antes da implementação, não depois.

## Commits e push

### Mudanças mínimas de estilo: commit e push direto

Ajustes visuais pequenos — espaçamento, alinhamento, cor, troca de ícone,
tamanho de fonte — podem ser commitados e enviados para
`victorcl68/gestao-ammi` **sem pedir confirmação**.

### Todo o resto: confirme antes do push

Features novas, mudanças de schema, alterações de lógica em `app.js`,
refatorações estruturais. Na dúvida sobre a classificação, pergunte.

### Formato

Mensagens em português, explicando o **porquê** e não só o quê. Termine com
a linha de atribuição do modelo que o sistema indicar na sessão.

## Migrations — cuidado redobrado

`migrations/` contém SQL aplicado manualmente no SQL Editor do Supabase.
Não há ferramenta de migration, nem registro automático do que já rodou.

**Nunca reescreva uma migration já aplicada.** Se o usuário já rodou o
arquivo, alterá-lo faz o arquivo descrever algo diferente do banco real —
o que já aconteceu uma vez neste projeto e teve que ser desfeito.

Antes de editar qualquer arquivo em `migrations/`:

1. Pergunte se aquela migration já foi rodada no Supabase
2. Se sim, crie uma nova numerada (`004_...`) com o incremento
3. Se não, pode editar no lugar

Estado confirmado pelo usuário nesta sessão: **001, 002, 003 e 004 já foram
aplicadas. 005 (pagamentos do Fiado) e 006 (aportes do Empréstimo) ainda não.**
O usuário avisa quando roda uma nova — atualize esta linha quando isso acontecer.

Toda tabela nova precisa de RLS habilitado e a policy `auth_all`, seguindo
o padrão das existentes. Sem isso, a tabela fica inacessível pelo app.

## Detalhes técnicos que importam

- **A chave do Supabase no `app.js` é pública** (anon/publishable) e fica
  exposta de propósito. O repositório é público. A proteção é o RLS. Não
  trate isso como vazamento nem tente mover para variável de ambiente —
  não há build para injetar variáveis.
- **Datas são strings `YYYY-MM-DD`**, comparadas como string. Não converta
  para `Date` sem necessidade; várias regras dependem dessa comparação.
- **"Hoje" é sempre America/Sao_Paulo**, via `hojeISO()`. Nunca use
  `new Date()` direto para obter a data corrente.
- **Valores no banco são sempre positivos.** O sinal vem do campo `tipo`.
- **Mobile e desktop compartilham o mesmo HTML.** As seções vivem dentro de
  `#desktop-grid`, que usa `display: contents` no mobile e vira grid de 4
  colunas acima de 900px. Cuidado ao mexer nisso — já causou tela em branco
  no mobile uma vez.

## Testes

Não há suíte de testes nem servidor de desenvolvimento configurado. Não
existe Node instalado no ambiente. Mudanças de UI não podem ser verificadas
automaticamente — diga isso ao usuário em vez de afirmar que algo funciona,
e sugira que ele confira no navegador.
