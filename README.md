# Piaseg Chamados

Plataforma de abertura de chamados para franqueados Piaseg — o franqueado abre um chamado com número sequencial, anexa arquivos e conversa com o time interno até o chamado ser encerrado.

## Estrutura

- `backend/` — FastAPI (login JWT, chamados, mensagens, upload de anexos, notificação por e-mail)
- `frontend/` — Next.js App Router (login, chamados, admin de usuários)

## Papéis de usuário

- **franqueado** — abre chamados, vê e responde apenas os próprios, pode encerrar
- **atendente** — vê todos os chamados, pode se atribuir a um chamado, responder e encerrar
- **admin** — tudo do atendente + gerencia usuários (cria franqueados e atendentes) em Usuários

Não existe autocadastro: contas são criadas pelo admin em **Usuários**.

## Rodando localmente

**Backend**
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8123
```

**Frontend**
```bash
cd frontend
npm install
npm run dev -- --port 3123
```

Crie `frontend/.env.local` com:
```
NEXT_PUBLIC_API_URL=http://localhost:8123
```

Acesse http://localhost:3123. Login inicial: `admin` / `chamados2026` (crie os usuários reais e troque essa senha em Usuários assim que possível).

## Variáveis de ambiente

- `backend/.env` (veja `backend/.env.example`) → `JWT_SECRET`, `SMTP_*`, `FRONTEND_URL`
- `frontend/.env.local` → `NEXT_PUBLIC_API_URL` (URL do backend)

O nome de usuário (`username`) deve ser o e-mail da pessoa — é para lá que vão as notificações de chamado aberto, respondido e encerrado.

## Deploy

- **Backend**: Render, usando `render.yaml` na raiz (disco persistente em `/data`, configurar `JWT_SECRET`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` e `FRONTEND_URL` no dashboard)
- **Frontend**: Vercel, configurar `NEXT_PUBLIC_API_URL` apontando para a URL do backend no Render
