# Gestão Ammi

Site simples (HTML/CSS/JS puro, sem build, mobile-first) para controles financeiros manuais de uma loja:

- **Caixa Casa** — dinheiro retirado do caixa e guardado em casa (entradas e saídas).
- **Salário** — comissão de 25% sobre a venda do dia, mais pagamentos (retiradas).
- **Contas a Pagar** — contas recorrentes mensais (com ou sem data de fim), com exceções pontuais e controle de pagamento por ocorrência.

Em telas largas (desktop), as três seções aparecem lado a lado na mesma página. Em celular, cada uma é uma tela separada acessada por um menu inicial.

## Stack

- HTML, CSS e JavaScript puros — nenhum framework, nenhum passo de build.
- [Supabase](https://supabase.com) como backend: autenticação (login por e-mail/senha) e banco Postgres para os lançamentos.

## Como rodar localmente

Não há build nem dependências para instalar. Basta servir os arquivos estáticos, por exemplo:

```bash
npx serve .
# ou
python -m http.server 8000
```

Depois abra o endereço indicado no navegador. Abrir o `index.html` direto como arquivo (`file://`) também funciona, mas um servidor local evita eventuais bloqueios de módulo ES do navegador.

## Configurar o Supabase

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. Abra o **SQL Editor** do projeto e rode, em ordem, os arquivos da pasta [migrations/](migrations) — cada um cria suas tabelas, índices e políticas de Row Level Security (RLS):
   - [001_caixa_casa_e_salario.sql](migrations/001_caixa_casa_e_salario.sql) — tabelas `caixa_casa_lancamentos` e `salario_lancamentos`.
   - [002_contas_pagar.sql](migrations/002_contas_pagar.sql) — tabelas `contas_pagar`, `contas_pagar_exdates` e `contas_pagar_pagamentos`.
3. Em **Authentication → Providers → Email**, desative **"Allow new users to sign up"**. Isso é importante: sem essa etapa, qualquer pessoa que abrir o site poderia criar a própria conta e logar.
4. Em **Authentication → Users**, crie manualmente o(s) usuário(s) que vão acessar o painel (e-mail + senha). Todos os usuários autenticados enxergam e lançam os mesmos dados — não há separação por usuário.
5. Em **Project Settings → API Keys**, copie a **Project URL** e a chave pública (**anon key** ou, em projetos mais novos, **Publishable key** — formato `sb_publishable_...`).
6. Cole essas duas informações em [app.js](app.js), nas constantes `SUPABASE_URL` e `SUPABASE_ANON_KEY` (topo do arquivo).
7. (Opcional) Em **Authentication → Sessions** (ou **Authentication → Settings**, dependendo da versão do painel), ajuste **"Time-box user sessions"** para **9 horas** — isso força um logout automático 9h após o login, independente de o navegador ficar aberto. Sem esse ajuste, o Supabase renova a sessão automaticamente e ela dura indefinidamente enquanto o app for revisitado.

## Sobre a chave pública no código (importante para repositório público)

A `SUPABASE_ANON_KEY` fica exposta no código-fonte do frontend — isso é esperado e seguro, **não é um segredo**. Ela é diferente da `service_role key`, que nunca deve aparecer em código público.

A segurança real dos dados vem inteiramente das políticas de **Row Level Security (RLS)** definidas nas migrations: apenas usuários autenticados (login criado manualmente no passo 4) podem ler ou gravar nas tabelas. Sem um login válido, a chave pública sozinha não dá acesso a nada. Por isso é fundamental manter o cadastro público desativado (passo 3) — do contrário, qualquer visitante do site poderia se autenticar sozinho.

## Publicar no GitHub Pages

1. Suba este repositório no GitHub (pode ser público — veja a nota de segurança acima).
2. Em **Settings → Pages**, escolha a branch (ex: `main`) e a pasta raiz (`/`) como fonte.
3. Aguarde a publicação; o GitHub fornece a URL final (algo como `https://<usuario>.github.io/<repositorio>/`).
4. Não é necessário nenhum passo de build — o Pages serve os arquivos estáticos diretamente.

## Estrutura

```
index.html    - as 5 telas (login, home, caixa casa, salário, contas a pagar), alternadas via JS ([hidden])
style.css     - todos os estilos (mobile-first, com layout lado a lado em telas largas)
app.js        - client Supabase, autenticação, navegação e lógica das três seções
ammi-logo.png - logo usada como favicon e na tela de login
migrations/   - scripts SQL do Supabase, em ordem de aplicação
```

## Próximos passos (fora do escopo atual)

- Um novo módulo pode seguir o mesmo padrão: uma nova migration em `migrations/` e uma nova seção na tela, sem alterar o que já existe.
- Contas a Pagar hoje só suporta recorrência mensal (dia fixo do mês). Outras frequências (semanal, anual) ficam para quando/se forem necessárias.
