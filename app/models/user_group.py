from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import Base

class UserGroupModel(Base):
    __tablename__ = "user_grupos"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), unique=True, index=True, nullable=False)
    descricao = Column(String(255), nullable=True)
    permissoes = Column(Text, default="")  # Comma-separated list of permission keys
    parent_id = Column(Integer, ForeignKey("user_grupos.id"), nullable=True)

    parent = relationship("UserGroupModel", remote_side=[id], backref="children")
