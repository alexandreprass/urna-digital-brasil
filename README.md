# Urna Digital Brasil

Simulador moderno de urna eletrônica com mapa do Brasil por estado, detecção de localização por IP e contador em tempo real.

## Recursos

- Urna estilizada com teclado (digite 13 ou 22 + CONFIRMA)
- Mapa interativo do Brasil (estados ficam vermelho se Lula lidera, verde se Flávio lidera)
- Detecção automática do estado via IP (ipapi.co)
- Animação: voto voa do estado até a foto do candidato
- Contadores gerais atualizados em tempo real
- Pronto para Supabase (real-time database gratuito)

## Deploy no GitHub Pages

1. Este repositório já tem os arquivos.
2. Vá em **Settings > Pages**
3. Source: Deploy from a branch → Branch: `main` → Folder: `/ (root)`
4. Salve. O site ficará em `https://alexandreprass.github.io/urna-digital-brasil/`

## Conectar Banco de Dados (Supabase - recomendado, gratuito)

1. Crie uma conta em [supabase.com](https://supabase.com)
2. Novo projeto → copie a URL e a `anon public` key
3. No SQL Editor, rode:

```sql
create table votes (
  id uuid default gen_random_uuid() primary key,
  candidate text not null check (candidate in ('lula', 'flavio')),
  state text not null,
  created_at timestamp with time zone default now()
);

-- Habilitar Realtime
alter publication supabase_realtime add table votes;

-- Política pública para insert e select (ajuste para produção)
alter table votes enable row level security;
create policy "public insert" on votes for insert with check (true);
create policy "public select" on votes for select using (true);
```

4. Edite `script.js` e substitua:

```js
const SUPABASE_URL = 'https://seu-projeto.supabase.co';
const SUPABASE_ANON_KEY = 'sua-anon-key';
```

5. Faça commit e push. Pronto! Votos de todos os usuários aparecem ao vivo.

## Alternativas

- Firebase Realtime Database
- Ably / Pusher para broadcast
- Para produção: adicione rate limit, autenticação anônima, etc.

## Mapa

O arquivo `brazil-map.svg` contém o mapa com IDs dos estados (SP, RJ, RS, etc.).

Feito para ser mais moderno e bonito que o urna.digital original.
