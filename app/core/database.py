from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.base import Base

import os

# Para começar rápido e simplificar testes, usaremos SQLite localmente.
# Depois podemos alterar essa URL para o PostgreSQL.
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./parametrizacao.db")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_tables():
    Base.metadata.create_all(bind=engine)
    
    # Lista de colunas a serem criadas incrementalmente nas tabelas existentes
    migrations = [
        ("pc_status_snapshots", "db_size_mb", "BIGINT"),
        ("pc_status_snapshots", "db_mdf_size_mb", "BIGINT"),
        ("pc_status_snapshots", "db_ldf_size_mb", "BIGINT"),
        ("pc_status_snapshots", "disco_total_gb", "INTEGER"),
        ("pc_status_snapshots", "disco_livre_gb", "INTEGER"),
        ("pc_status_snapshots", "backup_dias_atras", "INTEGER"),
        ("scripts", "criado_por", "VARCHAR(100)"),
        ("scripts", "modificado_por", "VARCHAR(100)"),
        ("usuarios", "grupo_id", "INTEGER"),
        ("user_grupos", "parent_id", "INTEGER"),
    ]
    
    from sqlalchemy import text
    for table, col, col_type in migrations:
        try:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
        except Exception:
            # Engole erro se a coluna já existir
            pass
