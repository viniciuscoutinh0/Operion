from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import UserModel
from app.models.user_group import UserGroupModel
from app.schemas.user_schema import LoginRequest, ChangePasswordRequest
from app.core.security import verify_password, create_access_token, get_password_hash

def obter_permissoes_recursivas(grupo, db: Session) -> str:
    if not grupo:
        return ""
    
    permissoes_set = set(p.strip() for p in grupo.permissoes.split(",") if p.strip())
    
    # Sobe a hierarquia de forma recursiva (evitando ciclos)
    current_parent_id = grupo.parent_id
    visited = {grupo.id}
    while current_parent_id:
        if current_parent_id in visited:
            break  # Evita ciclo infinito
        visited.add(current_parent_id)
        parent_group = db.query(UserGroupModel).filter(UserGroupModel.id == current_parent_id).first()
        if not parent_group:
            break
        if parent_group.permissoes:
            for p in parent_group.permissoes.split(","):
                p_clean = p.strip()
                if p_clean:
                    permissoes_set.add(p_clean)
        current_parent_id = parent_group.parent_id
        
    return ",".join(sorted(permissoes_set))

router = APIRouter()

@router.post("/login", tags=["Autenticação"])
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.email == req.email).first()
    if not user or not verify_password(req.senha, user.senha_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")

    if not user.ativo:
        raise HTTPException(status_code=403, detail="Usuário inativo. Contate o administrador.")

    if user.exige_troca_senha:
        return {
            "require_password_change": True,
            "user_id": user.id,
            "message": "Ação Necessária: Redefina sua senha."
        }

    # Carrega permissões dinâmicas do grupo
    permissoes = ""
    grupo_nome = ""
    if user.grupo:
        permissoes = obter_permissoes_recursivas(user.grupo, db)
        grupo_nome = user.grupo.nome
    elif user.role == "Admin":
        permissoes = "VER_DASHBOARD,EXECUTAR_SCRIPT,GERENCIAR_COFRE,GERENCIAR_AUDITORIA,VER_LOGS,EXECUTAR_BROADCAST,GERENCIAR_EQUIPE"
        grupo_nome = "Administradores"
    else:
        permissoes = "VER_DASHBOARD"
        grupo_nome = "Suporte N1"

    token = create_access_token({
        "sub": user.email,
        "role": grupo_nome,
        "id": user.id,
        "permissions": permissoes
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": grupo_nome,
        "email": user.email,
        "permissions": permissoes
    }

@router.post("/mudar_senha/{user_id}", tags=["Autenticação"])
def mudar_senha(user_id: int, req: ChangePasswordRequest, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    user.senha_hash = get_password_hash(req.nova_senha)
    user.exige_troca_senha = False
    db.commit()

    # Carrega permissões dinâmicas do grupo
    permissoes = ""
    grupo_nome = ""
    if user.grupo:
        permissoes = obter_permissoes_recursivas(user.grupo, db)
        grupo_nome = user.grupo.nome
    elif user.role == "Admin":
        permissoes = "VER_DASHBOARD,EXECUTAR_SCRIPT,GERENCIAR_COFRE,GERENCIAR_AUDITORIA,VER_LOGS,EXECUTAR_BROADCAST,GERENCIAR_EQUIPE"
        grupo_nome = "Administradores"
    else:
        permissoes = "VER_DASHBOARD"
        grupo_nome = "Suporte N1"

    token = create_access_token({
        "sub": user.email,
        "role": grupo_nome,
        "id": user.id,
        "permissions": permissoes
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": grupo_nome,
        "email": user.email,
        "permissions": permissoes,
        "message": "Senha atualizada com sucesso!"
    }

