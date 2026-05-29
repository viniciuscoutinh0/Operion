from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.user import UserModel
from app.models.user_group import UserGroupModel
from app.models.script import ScriptModel
from app.schemas.user_schema import UserCreate, UserResponse, UserUpdate, UserGroupCreate, UserGroupResponse
from app.core.security import get_password_hash
from pydantic import BaseModel

class PermissionsUpdate(BaseModel):
    script_ids: List[int]

router = APIRouter()

# ══════════════════════════════════════════════════════════════════════════════
#  USER GROUPS (DYNAMICAL PERMISSIONS)
# ══════════════════════════════════════════════════════════════════════════════

def check_circular_parent(grupo_id: int, parent_id: int, db: Session) -> bool:
    if not parent_id:
        return False
    if grupo_id == parent_id:
        return True
    
    current_parent_id = parent_id
    visited = {grupo_id}
    while current_parent_id:
        if current_parent_id in visited:
            return True
        visited.add(current_parent_id)
        parent_group = db.query(UserGroupModel).filter(UserGroupModel.id == current_parent_id).first()
        if not parent_group:
            break
        current_parent_id = parent_group.parent_id
    return False

@router.get("/grupos/", response_model=List[UserGroupResponse], tags=["Admin - Grupos"])
def listar_grupos(db: Session = Depends(get_db)):
    return db.query(UserGroupModel).all()

@router.post("/grupos/", response_model=UserGroupResponse, tags=["Admin - Grupos"])
def criar_grupo(req: UserGroupCreate, db: Session = Depends(get_db)):
    existente = db.query(UserGroupModel).filter(UserGroupModel.nome == req.nome).first()
    if existente:
        raise HTTPException(status_code=400, detail="Já existe um grupo com este nome.")
    
    if req.parent_id:
        parent_exists = db.query(UserGroupModel).filter(UserGroupModel.id == req.parent_id).first()
        if not parent_exists:
            raise HTTPException(status_code=400, detail="Grupo superior selecionado não existe.")
    
    novo_grupo = UserGroupModel(
        nome=req.nome,
        descricao=req.descricao,
        permissoes=req.permissoes,
        parent_id=req.parent_id
    )
    db.add(novo_grupo)
    db.commit()
    db.refresh(novo_grupo)
    return novo_grupo

@router.put("/grupos/{grupo_id}", response_model=UserGroupResponse, tags=["Admin - Grupos"])
def editar_grupo(grupo_id: int, req: UserGroupCreate, db: Session = Depends(get_db)):
    grupo = db.query(UserGroupModel).filter(UserGroupModel.id == grupo_id).first()
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    
    # Impede renomear ou alterar o grupo raiz "Administradores" para evitar que se percam permissões administrativas fundamentais
    if grupo.nome == "Administradores" and req.nome != "Administradores":
        raise HTTPException(status_code=400, detail="Não é permitido renomear o grupo administrativo raiz Administradores.")
    
    if req.parent_id:
        if req.parent_id == grupo_id:
            raise HTTPException(status_code=400, detail="Um grupo não pode ser pai de si mesmo.")
        parent_exists = db.query(UserGroupModel).filter(UserGroupModel.id == req.parent_id).first()
        if not parent_exists:
            raise HTTPException(status_code=400, detail="Grupo superior selecionado não existe.")
        if check_circular_parent(grupo_id, req.parent_id, db):
            raise HTTPException(status_code=400, detail="Estrutura circular detectada. Este grupo superior geraria uma referência cíclica.")
        
    grupo.nome = req.nome
    grupo.descricao = req.descricao
    grupo.permissoes = req.permissoes
    grupo.parent_id = req.parent_id
    db.commit()
    db.refresh(grupo)
    return grupo

@router.delete("/grupos/{grupo_id}", tags=["Admin - Grupos"])
def deletar_grupo(grupo_id: int, db: Session = Depends(get_db)):
    grupo = db.query(UserGroupModel).filter(UserGroupModel.id == grupo_id).first()
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
        
    if grupo.nome == "Administradores":
        raise HTTPException(status_code=400, detail="Não é permitido excluir o grupo raiz Administradores.")
        
    # Verifica se há subgrupos associados a este grupo
    subgrupo = db.query(UserGroupModel).filter(UserGroupModel.parent_id == grupo_id).first()
    if subgrupo:
        raise HTTPException(
            status_code=400,
            detail="Não é permitido excluir um grupo que possui subgrupos. Remova ou altere o pai dos subgrupos primeiro."
        )

    # Verifica se há algum usuário vinculado a este grupo
    usuario_vinculado = db.query(UserModel).filter(UserModel.grupo_id == grupo_id).first()
    if usuario_vinculado:
        raise HTTPException(
            status_code=400, 
            detail="Não é permitido excluir um grupo que possui membros ativos. Transfira os membros antes."
        )
        
    db.delete(grupo)
    db.commit()
    return {"message": "Grupo excluído com sucesso!"}


# ══════════════════════════════════════════════════════════════════════════════
#  USERS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/", response_model=List[UserResponse], tags=["Admin - Usuários"])
def listar_usuarios(db: Session = Depends(get_db)):
    return db.query(UserModel).all()

@router.post("/", response_model=UserResponse, tags=["Admin - Usuários"])
def criar_usuario(req: UserCreate, db: Session = Depends(get_db)):
    user_db = db.query(UserModel).filter(UserModel.email == req.email).first()
    if user_db:
        raise HTTPException(status_code=400, detail="Este e-mail já está em uso.")
    
    novo_usuario = UserModel(
        email=req.email,
        senha_hash=get_password_hash(req.senha),
        role=req.role,
        grupo_id=req.grupo_id,
        exige_troca_senha=True
    )
    db.add(novo_usuario)
    db.commit()
    db.refresh(novo_usuario)
    return novo_usuario

@router.put("/{user_id}/resetar_senha", tags=["Admin - Usuários"])
def resetar_senha(user_id: int, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    user.senha_hash = get_password_hash("mudar123")
    user.exige_troca_senha = True
    db.commit()
    return {"message": f"Senha de {user.email} resetada para 'mudar123'."}

@router.put("/{user_id}", response_model=UserResponse, tags=["Admin - Usuários"])
def editar_usuario(user_id: int, req: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Busca grupo de Administradores para validação do failsafe
    grupo_ti = db.query(UserGroupModel).filter(UserGroupModel.nome == "Administradores").first()
    grupo_ti_id = grupo_ti.id if grupo_ti else None

    # Validação de segurança: Não permitir remover ou inativar o último Administrador/TI ativo
    e_admin = user.role == "Admin" or user.grupo_id == grupo_ti_id
    if e_admin and user.ativo:
        tentativa_remover_admin = (req.role != "Admin" and req.grupo_id != grupo_ti_id) or not req.ativo
        if tentativa_remover_admin:
            # Conta admins ativos (seja pela role Admin ou grupo TI)
            active_admins = db.query(UserModel).filter(
                (UserModel.role == "Admin") | (UserModel.grupo_id == grupo_ti_id),
                UserModel.ativo == True
            ).all()
            if len(active_admins) <= 1 and user.id in [a.id for a in active_admins]:
                raise HTTPException(
                    status_code=400,
                    detail="Ação bloqueada. Não é permitido desativar ou alterar o perfil do único Administrador/TI ativo no sistema."
                )
    
    user.role = req.role
    user.grupo_id = req.grupo_id
    user.ativo = req.ativo
    db.commit()
    db.refresh(user)
    return user

@router.get("/{user_id}/permissoes", tags=["Admin - Usuários"])
def listar_permissoes(user_id: int, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return [script.id for script in user.scripts_permitidos]

@router.post("/{user_id}/permissoes", tags=["Admin - Usuários"])
def salvar_permissoes(user_id: int, req: PermissionsUpdate, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    scripts = db.query(ScriptModel).filter(ScriptModel.id.in_(req.script_ids)).all()
    user.scripts_permitidos = scripts
    db.commit()
    return {"message": "Permissões atualizadas com sucesso!"}
