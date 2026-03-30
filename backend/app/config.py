"""Configuration module for ENIGMA backend."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application configuration from environment variables."""

    # Application
    APP_NAME: str = "ENIGMA Entropy Backend"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql://postgres:password@db:5432/enigma_db"

    # Security
    SERVER_RANDOM_SEED: str = "your-server-random-seed-here"
    ALGORITHM: str = "aes"
    AES_KEY_SIZE: int = 16  # 128-bit AES

    # Image Processing
    MIN_IMAGE_SIZE: int = 100  # pixels
    MAX_IMAGE_SIZE: int = 1920  # pixels
    MAX_BASE64_IMAGE_SIZE: int = 10_000_000  # ~10MB

    # API
    CORS_ORIGINS: list = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
