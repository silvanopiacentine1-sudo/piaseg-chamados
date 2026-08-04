import json
import os
import re
import secrets
import shutil
import smtplib
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

load_dotenv()

import auth

# ---------------------------------------------------------------------------
# Trava de segurança: no Render, DATA_DIR é obrigatório.
#
# Sem essa trava, se alguém um dia recriar o serviço no Render e esquecer de
# configurar a env var DATA_DIR, o app subiria normalmente (sem erro nenhum)
# escrevendo os dados dentro do próprio container em vez do disco persistente
# — e tudo seria perdido silenciosamente no próximo deploy, sem nenhum aviso.
# Preferível falhar alto (o deploy não sobe) a perder dados em silêncio.
# ---------------------------------------------------------------------------
if os.getenv("RENDER") and not os.getenv("DATA_DIR"):
    raise RuntimeError(
        "DATA_DIR não está configurado no Render. Isso faria o app gravar dados "
        "fora do disco persistente, perdendo tudo no próximo deploy. Configure a "
        "env var DATA_DIR=/data no serviço antes de tentar de novo."
    )

app = FastAPI(title="Piaseg Chamados")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

APP_DIR = Path(__file__).parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(APP_DIR)))
FILES_DIR = DATA_DIR / "files"
FILES_DIR.mkdir(parents=True, exist_ok=True)

TICKETS_FILE = DATA_DIR / "tickets.json"
MESSAGES_FILE = DATA_DIR / "messages.json"
RESETS_FILE = DATA_DIR / "password_resets.json"
DEPARTMENTS_FILE = DATA_DIR / "departments.json"
_BUNDLED_DEPARTMENTS_FILE = APP_DIR / "departments.json"
BACKUPS_DIR = DATA_DIR / "backups"
MAX_BACKUPS = 30

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx", ".zip"}
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15MB

RATINGS = {"ruim", "bom", "excelente"}

SMTP_HOST = os.getenv("SMTP_HOST", "email02.webplusidc.com.br")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "franchising@piaseg.com.br")
SMTP_PASS = os.getenv("SMTP_PASS", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "franchising@piaseg.com.br")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://piaseg-chamados.vercel.app")
RESET_TOKEN_TTL_HOURS = 1

STATUSES = {"aberto", "em_andamento", "encerrado"}


def _load(path: Path) -> list:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return []


def _save(path: Path, data: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


_BACKUP_FILES = ["users.json", "departments.json", "tickets.json", "messages.json"]


def _run_startup_backup() -> None:
    """Tira um snapshot dos dados a cada subida do app (ou seja, a cada deploy).

    Só roda quando DATA_DIR foi explicitamente configurado (produção), nunca
    em desenvolvimento local — evita acumular lixo na pasta do projeto.
    """
    if not os.getenv("DATA_DIR"):
        return
    snapshot_dir = BACKUPS_DIR / datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    for filename in _BACKUP_FILES:
        source = DATA_DIR / filename
        if source.exists():
            shutil.copy2(source, snapshot_dir / filename)

    existing = sorted(p for p in BACKUPS_DIR.iterdir() if p.is_dir())
    for old in existing[:-MAX_BACKUPS]:
        shutil.rmtree(old, ignore_errors=True)


_run_startup_backup()


def _br_time(iso: str) -> str:
    dt = datetime.fromisoformat(iso) - timedelta(hours=3)
    return dt.strftime("%d/%m/%Y %H:%M")


def _load_departments() -> list[dict]:
    if DEPARTMENTS_FILE.exists():
        return json.loads(DEPARTMENTS_FILE.read_text(encoding="utf-8"))
    if _BUNDLED_DEPARTMENTS_FILE.exists():
        return json.loads(_BUNDLED_DEPARTMENTS_FILE.read_text(encoding="utf-8"))
    return []


def _save_departments(departments: list[dict]) -> None:
    _save(DEPARTMENTS_FILE, departments)


def _slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    return slug or uuid.uuid4().hex[:8]


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------

bearer = HTTPBearer()


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    payload = auth.decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido ou expirado")
    return payload


def require_staff(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("atendente", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito ao time interno")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores")
    return user


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    name: str
    password: str
    role: str = "franqueado"
    department: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None


class DepartmentCreate(BaseModel):
    name: str


class DepartmentUpdate(BaseModel):
    name: str


class ForgotPasswordRequest(BaseModel):
    username: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class TicketCreate(BaseModel):
    subject: str
    description: str
    department: str
    assigned_to: Optional[str] = None
    attachment: Optional[str] = None


class MessageCreate(BaseModel):
    text: str
    attachment: Optional[str] = None


class AssignRequest(BaseModel):
    username: Optional[str] = None


class RedirectRequest(BaseModel):
    department: str


class RatingRequest(BaseModel):
    rating: str


# ---------------------------------------------------------------------------
# Email helpers
# ---------------------------------------------------------------------------

def _send_email(to: str, subject: str, html_body: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = EMAIL_FROM
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(EMAIL_FROM, [to], msg.as_string())


def _notify(to: str, title: str, body_lines: list[str], ticket_number: int) -> None:
    body_html = "".join(f"<p style='margin:0 0 12px;'>{line}</p>" for line in body_lines)
    html = f"""
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background:#072a3c; padding: 24px; text-align:center;">
        <h1 style="color:#c2a360; font-size:20px; margin:0;">Piaseg Chamados</h1>
      </div>
      <div style="padding: 24px; color:#111;">
        <h2 style="font-size:16px; margin:0 0 16px;">{title}</h2>
        {body_html}
        <p style="text-align:center; margin: 24px 0;">
          <a href="{FRONTEND_URL}/tickets/{ticket_number}" style="background:#072a3c; color:#ffffff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold; display:inline-block;">
            Abrir chamado #{ticket_number:04d}
          </a>
        </p>
      </div>
    </div>
    """
    try:
        _send_email(to, f"[Chamado #{ticket_number:04d}] {title}", html)
    except Exception as e:
        print(f"[email] falha ao notificar {to}: {type(e).__name__}: {e}")  # best-effort, não deve derrubar a operação


def _notify_many(usernames: list[str], title: str, body_lines: list[str], ticket_number: int) -> None:
    for u in set(usernames):
        _notify(u, title, body_lines, ticket_number)


def _department_staff_usernames(department_id: str) -> list[str]:
    users = auth.load_users()
    return [
        u["username"]
        for u in users
        if u.get("role") == "admin" or (u.get("role") == "atendente" and u.get("department") == department_id)
    ]


def _admin_usernames() -> list[str]:
    return [u["username"] for u in auth.load_users() if u.get("role") == "admin"]


# ---------------------------------------------------------------------------
# Ticket helpers
# ---------------------------------------------------------------------------

def _ticket_or_404(ticket_id: str) -> dict:
    tickets = _load(TICKETS_FILE)
    for t in tickets:
        if t["id"] == ticket_id:
            return t
    raise HTTPException(status_code=404, detail="Chamado não encontrado")

def _save_ticket(ticket: dict) -> None:
    tickets = _load(TICKETS_FILE)
    for i, t in enumerate(tickets):
        if t["id"] == ticket["id"]:
            tickets[i] = ticket
            _save(TICKETS_FILE, tickets)
            return
    tickets.append(ticket)
    _save(TICKETS_FILE, tickets)


def _next_ticket_number() -> int:
    tickets = _load(TICKETS_FILE)
    return max((t["number"] for t in tickets), default=0) + 1


def _require_ticket_access(ticket: dict, user: dict) -> None:
    role = user.get("role")
    if role == "admin":
        return
    if ticket["opened_by"] == user["sub"]:
        return
    if role == "atendente":
        if ticket.get("department") == user.get("department") or ticket.get("assigned_to") == user["sub"]:
            return
        raise HTTPException(status_code=403, detail="Este chamado não pertence ao seu departamento")
    raise HTTPException(status_code=403, detail="Você não tem acesso a este chamado")


def _department_or_404(department_id: str) -> dict:
    department = next((d for d in _load_departments() if d["id"] == department_id), None)
    if not department:
        raise HTTPException(status_code=400, detail="Departamento inválido")
    return department


def _messages_for_ticket(ticket_id: str) -> list[dict]:
    messages = _load(MESSAGES_FILE)
    return sorted([m for m in messages if m["ticket_id"] == ticket_id], key=lambda m: m["created_at"])


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/auth/login")
def login(body: LoginRequest):
    user = auth.authenticate(body.username, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")
    role = user.get("role", "franqueado")
    department = user.get("department")
    token = auth.create_token(user["username"], user["name"], role, department)
    return {"token": token, "name": user["name"], "role": role, "username": user["username"], "department": department}


@app.post("/auth/forgot-password")
def forgot_password(body: ForgotPasswordRequest):
    users = auth.load_users()
    user = next((u for u in users if u["username"] == body.username), None)
    if user:
        token = secrets.token_urlsafe(32)
        resets = _load(RESETS_FILE)
        resets.append({
            "token": token,
            "username": user["username"],
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=RESET_TOKEN_TTL_HOURS)).isoformat(),
            "used": False,
        })
        _save(RESETS_FILE, resets)
        reset_link = f"{FRONTEND_URL}/reset-password?token={token}"
        html = f"""
        <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="background:#072a3c; padding: 24px; text-align:center;">
            <h1 style="color:#c2a360; font-size:20px; margin:0;">Piaseg Chamados</h1>
          </div>
          <div style="padding: 24px; color:#111;">
            <p>Olá, {user["name"]},</p>
            <p>Recebemos uma solicitação para redefinir sua senha no Piaseg Chamados.</p>
            <p style="text-align:center; margin: 32px 0;">
              <a href="{reset_link}" style="background:#072a3c; color:#ffffff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold; display:inline-block;">
                Redefinir senha
              </a>
            </p>
            <p style="font-size:13px; color:#555;">
              Esse link expira em {RESET_TOKEN_TTL_HOURS} hora(s). Se você não pediu essa redefinição, pode ignorar este e-mail.
            </p>
          </div>
        </div>
        """
        try:
            _send_email(user["username"], "Redefinição de senha — Piaseg Chamados", html)
        except Exception as e:
            print(f"[email] falha ao enviar redefinição de senha para {user['username']}: {type(e).__name__}: {e}")
    return {"message": "Se o usuário existir, enviamos um e-mail com instruções de redefinição."}


@app.post("/auth/reset-password")
def reset_password(body: ResetPasswordRequest):
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos 6 caracteres")

    resets = _load(RESETS_FILE)
    entry = next((r for r in resets if r["token"] == body.token), None)
    if not entry or entry["used"]:
        raise HTTPException(status_code=400, detail="Link inválido ou já utilizado")
    if datetime.fromisoformat(entry["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Link expirado. Solicite uma nova redefinição.")

    result = auth.update_user(entry["username"], password=body.new_password)
    if not result:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    entry["used"] = True
    _save(RESETS_FILE, resets)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Users (admin)
# ---------------------------------------------------------------------------

@app.get("/admin/users")
def list_users(user: dict = Depends(require_admin)):
    return [
        {"username": u["username"], "name": u["name"], "role": u.get("role", "franqueado"), "department": u.get("department")}
        for u in auth.load_users()
    ]


@app.post("/admin/users", status_code=201)
def create_user_endpoint(body: UserCreate, user: dict = Depends(require_admin)):
    if body.role == "atendente" and body.department:
        _department_or_404(body.department)
    try:
        return auth.create_user(body.username, body.name, body.password, body.role, body.department)
    except ValueError as e:
        raise HTTPException(status_code=409 if "já existe" in str(e) else 400, detail=str(e))


@app.put("/admin/users/{username}")
def update_user_endpoint(username: str, body: UserUpdate, user: dict = Depends(require_admin)):
    if body.department:
        _department_or_404(body.department)
    try:
        result = auth.update_user(username, body.name, body.password, body.role, body.department)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return result


@app.delete("/admin/users/{username}")
def delete_user_endpoint(username: str, user: dict = Depends(require_admin)):
    if not auth.delete_user(username):
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Departments
# ---------------------------------------------------------------------------

@app.get("/departments")
def list_departments(user: dict = Depends(get_current_user)):
    return sorted(_load_departments(), key=lambda d: d["name"])


@app.get("/departments/{department_id}/staff")
def list_department_staff(department_id: str, user: dict = Depends(get_current_user)):
    _department_or_404(department_id)
    atendentes = [
        {"username": u["username"], "name": u["name"]}
        for u in auth.load_users()
        if u.get("role") == "atendente" and u.get("department") == department_id
    ]
    return sorted(atendentes, key=lambda u: u["name"])


@app.post("/admin/departments", status_code=201)
def create_department(body: DepartmentCreate, user: dict = Depends(require_admin)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome é obrigatório")
    departments = _load_departments()
    dept_id = _slugify(name)
    if any(d["id"] == dept_id for d in departments):
        raise HTTPException(status_code=409, detail="Já existe um departamento com esse nome")
    department = {"id": dept_id, "name": name}
    departments.append(department)
    _save_departments(departments)
    return department


@app.put("/admin/departments/{department_id}")
def update_department(department_id: str, body: DepartmentUpdate, user: dict = Depends(require_admin)):
    departments = _load_departments()
    department = next((d for d in departments if d["id"] == department_id), None)
    if not department:
        raise HTTPException(status_code=404, detail="Departamento não encontrado")
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome é obrigatório")
    department["name"] = name
    _save_departments(departments)
    return department


@app.delete("/admin/departments/{department_id}")
def delete_department(department_id: str, user: dict = Depends(require_admin)):
    users_in_department = [u for u in auth.load_users() if u.get("department") == department_id]
    if users_in_department:
        raise HTTPException(status_code=409, detail="Realoque os atendentes desse departamento antes de excluí-lo")
    departments = _load_departments()
    filtered = [d for d in departments if d["id"] != department_id]
    if len(filtered) == len(departments):
        raise HTTPException(status_code=404, detail="Departamento não encontrado")
    _save_departments(filtered)
    return {"ok": True}


# ---------------------------------------------------------------------------
# File upload
# ---------------------------------------------------------------------------

@app.post("/tickets/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    original_name = os.path.basename(file.filename or "")
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Tipo de arquivo não permitido. Use: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Arquivo muito grande (máximo 15MB)")
    stored_name = f"{uuid.uuid4().hex[:8]}_{original_name}"
    dest = FILES_DIR / stored_name
    dest.write_bytes(content)
    return {"filename": stored_name, "original_name": original_name}


@app.get("/files/{filename}")
def get_file(filename: str, user: dict = Depends(get_current_user)):
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Nome de arquivo inválido")
    file_path = FILES_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    display_name = filename.split("_", 1)[1] if "_" in filename else filename
    return FileResponse(file_path, filename=display_name)


# ---------------------------------------------------------------------------
# Tickets
# ---------------------------------------------------------------------------

@app.get("/tickets")
def list_tickets(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    tickets = _load(TICKETS_FILE)
    role = user.get("role")
    if role == "franqueado":
        tickets = [t for t in tickets if t["opened_by"] == user["sub"]]
    elif role == "atendente":
        tickets = [
            t for t in tickets
            if t.get("department") == user.get("department") or t.get("assigned_to") == user["sub"] or t.get("opened_by") == user["sub"]
        ]
    if status_filter:
        if status_filter not in STATUSES:
            raise HTTPException(status_code=400, detail=f"status deve ser um de {sorted(STATUSES)}")
        tickets = [t for t in tickets if t["status"] == status_filter]
    return sorted(tickets, key=lambda t: t["number"], reverse=True)


@app.post("/tickets", status_code=201)
def create_ticket(body: TicketCreate, user: dict = Depends(get_current_user)):
    if not body.subject.strip() or not body.description.strip():
        raise HTTPException(status_code=400, detail="Assunto e descrição são obrigatórios")
    department = _department_or_404(body.department)

    assigned_to = None
    assigned_to_name = None
    if body.assigned_to:
        target_user = next((u for u in auth.load_users() if u["username"] == body.assigned_to), None)
        if not target_user or target_user.get("role") != "atendente" or target_user.get("department") != department["id"]:
            raise HTTPException(status_code=400, detail="Esse atendente não pertence ao departamento escolhido")
        assigned_to = target_user["username"]
        assigned_to_name = target_user["name"]

    ticket = {
        "id": f"tkt_{uuid.uuid4().hex[:8]}",
        "number": _next_ticket_number(),
        "subject": body.subject.strip(),
        "description": body.description.strip(),
        "status": "aberto",
        "department": department["id"],
        "department_name": department["name"],
        "opened_by": user["sub"],
        "opened_by_name": user["name"],
        "opened_by_role": user["role"],
        "assigned_to": assigned_to,
        "assigned_to_name": assigned_to_name,
        "attachment": body.attachment,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "closed_at": None,
        "closed_by": None,
        "rating": None,
        "rated_at": None,
        "transcript_sent_at": None,
    }
    _save_ticket(ticket)

    recipients = list({assigned_to, *_admin_usernames()}) if assigned_to else _department_staff_usernames(department["id"])
    _notify_many(
        recipients,
        f"Novo chamado de {user['name']} — {department['name']}",
        [f"<strong>Assunto:</strong> {ticket['subject']}", ticket["description"]],
        ticket["number"],
    )
    return ticket


@app.get("/tickets/{number}")
def get_ticket(number: int, user: dict = Depends(get_current_user)):
    tickets = _load(TICKETS_FILE)
    ticket = next((t for t in tickets if t["number"] == number), None)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    _require_ticket_access(ticket, user)
    return {**ticket, "messages": _messages_for_ticket(ticket["id"])}


@app.post("/tickets/{number}/messages", status_code=201)
def add_message(number: int, body: MessageCreate, user: dict = Depends(get_current_user)):
    tickets = _load(TICKETS_FILE)
    ticket = next((t for t in tickets if t["number"] == number), None)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    _require_ticket_access(ticket, user)
    if ticket["status"] == "encerrado":
        raise HTTPException(status_code=409, detail="Chamado encerrado — não é possível enviar novas mensagens")
    if not body.text.strip() and not body.attachment:
        raise HTTPException(status_code=400, detail="Envie um texto ou anexo")

    message = {
        "id": f"msg_{uuid.uuid4().hex[:8]}",
        "ticket_id": ticket["id"],
        "author": user["sub"],
        "author_name": user["name"],
        "author_role": user["role"],
        "text": body.text.strip(),
        "attachment": body.attachment,
        "created_at": now_iso(),
    }
    messages = _load(MESSAGES_FILE)
    messages.append(message)
    _save(MESSAGES_FILE, messages)

    is_staff = user["role"] in ("atendente", "admin")
    if is_staff and ticket["status"] == "aberto":
        ticket["status"] = "em_andamento"
    ticket["updated_at"] = now_iso()
    _save_ticket(ticket)

    if is_staff:
        _notify(ticket["opened_by"], f"Nova resposta de {user['name']}", [message["text"] or "(anexo enviado)"], number)
    else:
        recipients = [ticket["assigned_to"]] if ticket["assigned_to"] else _department_staff_usernames(ticket.get("department"))
        _notify_many(recipients, f"Nova mensagem de {user['name']}", [message["text"] or "(anexo enviado)"], number)

    return message


@app.post("/tickets/{number}/assign")
def assign_ticket(number: int, body: AssignRequest, user: dict = Depends(require_staff)):
    tickets = _load(TICKETS_FILE)
    ticket = next((t for t in tickets if t["number"] == number), None)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")

    target_username = body.username
    if user["role"] == "atendente" and user.get("department") != ticket.get("department"):
        raise HTTPException(status_code=403, detail="Este chamado não pertence ao seu departamento")

    if target_username:
        target_user = next((u for u in auth.load_users() if u["username"] == target_username), None)
        if not target_user or target_user.get("role") not in ("atendente", "admin"):
            raise HTTPException(status_code=400, detail="Usuário indicado não é do time interno")
        if target_user.get("role") == "atendente" and target_user.get("department") != ticket.get("department"):
            raise HTTPException(status_code=400, detail="Esse atendente não pertence ao departamento do chamado")
        ticket["assigned_to"] = target_user["username"]
        ticket["assigned_to_name"] = target_user["name"]
    else:
        ticket["assigned_to"] = user["sub"]
        ticket["assigned_to_name"] = user["name"]

    if ticket["status"] == "aberto":
        ticket["status"] = "em_andamento"
    ticket["updated_at"] = now_iso()
    _save_ticket(ticket)

    if target_username and target_username != user["sub"]:
        _notify(target_username, f"{user['name']} direcionou um chamado para você", [f"<strong>Assunto:</strong> {ticket['subject']}"], number)

    return ticket


@app.post("/tickets/{number}/redirect")
def redirect_ticket(number: int, body: RedirectRequest, user: dict = Depends(require_staff)):
    tickets = _load(TICKETS_FILE)
    ticket = next((t for t in tickets if t["number"] == number), None)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    if ticket["status"] == "encerrado":
        raise HTTPException(status_code=409, detail="Chamado encerrado — não é possível redirecionar")

    department = _department_or_404(body.department)
    if department["id"] == ticket.get("department"):
        raise HTTPException(status_code=400, detail="O chamado já está nesse departamento")

    ticket["department"] = department["id"]
    ticket["department_name"] = department["name"]
    ticket["assigned_to"] = None
    ticket["assigned_to_name"] = None
    ticket["status"] = "aberto"
    ticket["updated_at"] = now_iso()
    _save_ticket(ticket)

    _notify_many(
        _department_staff_usernames(department["id"]),
        f"Chamado redirecionado para {department['name']}",
        [f"{user['name']} redirecionou este chamado para o seu departamento."],
        number,
    )
    return ticket


@app.post("/tickets/{number}/close")
def close_ticket(number: int, user: dict = Depends(get_current_user)):
    tickets = _load(TICKETS_FILE)
    ticket = next((t for t in tickets if t["number"] == number), None)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    _require_ticket_access(ticket, user)
    if ticket["status"] == "encerrado":
        raise HTTPException(status_code=409, detail="Chamado já está encerrado")

    ticket["status"] = "encerrado"
    ticket["closed_at"] = now_iso()
    ticket["closed_by"] = user["sub"]
    ticket["updated_at"] = now_iso()
    _save_ticket(ticket)

    is_staff = user["role"] in ("atendente", "admin")
    if is_staff:
        _notify(ticket["opened_by"], f"Chamado encerrado por {user['name']}", ["O chamado foi marcado como encerrado."], number)
    else:
        recipients = [ticket["assigned_to"]] if ticket["assigned_to"] else _department_staff_usernames(ticket.get("department"))
        _notify_many(recipients, f"Chamado encerrado por {user['name']}", ["O franqueado encerrou o chamado."], number)

    return ticket


@app.post("/tickets/{number}/rating")
def rate_ticket(number: int, body: RatingRequest, user: dict = Depends(get_current_user)):
    if body.rating not in RATINGS:
        raise HTTPException(status_code=400, detail=f"rating deve ser um de {sorted(RATINGS)}")

    tickets = _load(TICKETS_FILE)
    ticket = next((t for t in tickets if t["number"] == number), None)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    if ticket["opened_by"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Você não abriu este chamado")
    if ticket["status"] != "encerrado":
        raise HTTPException(status_code=409, detail="Só é possível avaliar um chamado encerrado")

    ticket["rating"] = body.rating
    ticket["rated_at"] = now_iso()
    _save_ticket(ticket)
    return ticket


@app.post("/tickets/{number}/send-transcript")
def send_transcript(number: int, user: dict = Depends(get_current_user)):
    tickets = _load(TICKETS_FILE)
    ticket = next((t for t in tickets if t["number"] == number), None)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    if ticket["opened_by"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Você não abriu este chamado")
    if ticket["status"] != "encerrado":
        raise HTTPException(status_code=409, detail="Só é possível enviar a conversa de um chamado encerrado")

    entries = [(ticket["opened_by_name"], ticket["created_at"], ticket["description"])]
    for m in _messages_for_ticket(ticket["id"]):
        entries.append((m["author_name"], m["created_at"], m["text"] or "(anexo enviado)"))

    rows_html = "".join(
        f"<p style='margin:0 0 4px;'><strong>{name}</strong> — {_br_time(created_at)}</p>"
        f"<p style='margin:0 0 16px; white-space:pre-wrap;'>{text}</p>"
        for name, created_at, text in entries
    )
    html = f"""
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto;">
      <div style="background:#072a3c; padding: 24px; text-align:center;">
        <h1 style="color:#c2a360; font-size:20px; margin:0;">Piaseg Chamados</h1>
      </div>
      <div style="padding: 24px; color:#111;">
        <h2 style="font-size:16px; margin:0 0 4px;">Chamado #{number:04d} — {ticket['subject']}</h2>
        <p style="font-size:12px; color:#777; margin:0 0 24px;">Departamento: {ticket.get('department_name') or '—'}</p>
        {rows_html}
      </div>
    </div>
    """
    try:
        _send_email(user["sub"], f"Conversa do chamado #{number:04d} — {ticket['subject']}", html)
    except Exception as e:
        print(f"[email] falha ao enviar transcrição do chamado #{number} para {user['sub']}: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail="Não foi possível enviar o e-mail agora. Tente novamente em instantes.")

    ticket["transcript_sent_at"] = now_iso()
    _save_ticket(ticket)
    return ticket


# ---------------------------------------------------------------------------
# SLA (admin)
# ---------------------------------------------------------------------------

def _minutes_between(start_iso: str, end_iso: str) -> float:
    start = datetime.fromisoformat(start_iso)
    end = datetime.fromisoformat(end_iso)
    return (end - start).total_seconds() / 60


@app.get("/admin/sla")
def sla_report(user: dict = Depends(require_admin)):
    tickets = _load(TICKETS_FILE)
    messages = _load(MESSAGES_FILE)
    messages_by_ticket: dict[str, list[dict]] = {}
    for m in messages:
        messages_by_ticket.setdefault(m["ticket_id"], []).append(m)

    rows = []
    for t in tickets:
        msgs = sorted(messages_by_ticket.get(t["id"], []), key=lambda m: m["created_at"])
        first_staff_msg = next((m for m in msgs if m.get("author_role") in ("atendente", "admin")), None)
        first_response_minutes = _minutes_between(t["created_at"], first_staff_msg["created_at"]) if first_staff_msg else None
        resolution_minutes = _minutes_between(t["created_at"], t["closed_at"]) if t.get("closed_at") else None
        # Atribui pra quem realmente respondeu primeiro; sem resposta ainda, cai no assigned_to (se houver)
        if first_staff_msg:
            attributed_username = first_staff_msg["author"]
            attributed_name = first_staff_msg["author_name"]
        else:
            attributed_username = t.get("assigned_to")
            attributed_name = t.get("assigned_to_name")
        rows.append({
            "number": t["number"],
            "subject": t["subject"],
            "department_name": t.get("department_name"),
            "assigned_to": attributed_username,
            "assigned_to_name": attributed_name,
            "status": t["status"],
            "created_at": t["created_at"],
            "first_response_minutes": first_response_minutes,
            "resolution_minutes": resolution_minutes,
        })

    departments_by_id = {d["id"]: d["name"] for d in _load_departments()}
    users_by_username = {u["username"]: u for u in auth.load_users()}

    by_atendente: dict[str, dict] = {}
    for row in rows:
        key = row["assigned_to"] or "__unassigned__"
        entry = by_atendente.setdefault(key, {
            "username": row["assigned_to"],
            "name": row["assigned_to_name"] or "Não atribuído",
            "tickets_count": 0,
            "closed_count": 0,
            "_first_response_sum": 0.0,
            "_first_response_count": 0,
            "_resolution_sum": 0.0,
            "_resolution_count": 0,
        })
        entry["tickets_count"] += 1
        if row["status"] == "encerrado":
            entry["closed_count"] += 1
        if row["first_response_minutes"] is not None:
            entry["_first_response_sum"] += row["first_response_minutes"]
            entry["_first_response_count"] += 1
        if row["resolution_minutes"] is not None:
            entry["_resolution_sum"] += row["resolution_minutes"]
            entry["_resolution_count"] += 1

    summary = []
    for entry in by_atendente.values():
        username = entry["username"]
        u = users_by_username.get(username) if username else None
        department_name = departments_by_id.get(u.get("department")) if u else None
        summary.append({
            "username": username,
            "name": entry["name"],
            "department_name": department_name,
            "tickets_count": entry["tickets_count"],
            "closed_count": entry["closed_count"],
            "avg_first_response_minutes": (entry["_first_response_sum"] / entry["_first_response_count"]) if entry["_first_response_count"] else None,
            "avg_resolution_minutes": (entry["_resolution_sum"] / entry["_resolution_count"]) if entry["_resolution_count"] else None,
        })
    summary.sort(key=lambda s: (s["username"] is None, s["name"]))

    return {"tickets": sorted(rows, key=lambda r: r["number"], reverse=True), "by_atendente": summary}


# ---------------------------------------------------------------------------
# Manutenção (admin)
# ---------------------------------------------------------------------------

@app.post("/admin/reset-tickets")
def reset_tickets(user: dict = Depends(require_admin)):
    """Apaga todos os chamados, mensagens e anexos. Reinicia a numeração do zero.
    Não afeta usuários nem departamentos cadastrados."""
    _save(TICKETS_FILE, [])
    _save(MESSAGES_FILE, [])
    for f in FILES_DIR.glob("*"):
        if f.is_file():
            f.unlink()
    return {"ok": True}


@app.get("/admin/backups")
def list_backups(user: dict = Depends(require_admin)):
    """Lista os snapshots disponíveis (um por deploy/reinício do app), mais recente primeiro."""
    if not BACKUPS_DIR.exists():
        return []
    return sorted((p.name for p in BACKUPS_DIR.iterdir() if p.is_dir()), reverse=True)


@app.post("/admin/backups/{name}/restore")
def restore_backup(name: str, user: dict = Depends(require_admin)):
    """Restaura usuários/departamentos/chamados/mensagens a partir de um snapshot.
    Antes de restaurar, tira um novo snapshot do estado atual (por segurança)."""
    if "/" in name or ".." in name:
        raise HTTPException(status_code=400, detail="Nome de backup inválido")
    snapshot_dir = BACKUPS_DIR / name
    if not snapshot_dir.is_dir():
        raise HTTPException(status_code=404, detail="Backup não encontrado")

    _run_startup_backup()

    for filename in _BACKUP_FILES:
        source = snapshot_dir / filename
        if source.exists():
            shutil.copy2(source, DATA_DIR / filename)
    return {"ok": True, "restored_from": name}
