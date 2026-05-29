from pydantic import BaseModel, ConfigDict
from typing import Optional, List


class UserGroupCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None
    permissoes: str = ""  # Comma-separated list of active permission keys
    parent_id: Optional[int] = None


class UserGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    descricao: Optional[str] = None
    permissoes: str
    parent_id: Optional[int] = None


class UserCreate(BaseModel):
    email: str
    senha: str
    role: str = "Suporte"
    grupo_id: Optional[int] = None


class UserUpdate(BaseModel):
    role: str
    grupo_id: Optional[int] = None
    ativo: bool


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: str
    grupo_id: Optional[int] = None
    exige_troca_senha: bool
    ativo: bool


class LoginRequest(BaseModel):
    email: str
    senha: str


class ChangePasswordRequest(BaseModel):
    nova_senha: str
