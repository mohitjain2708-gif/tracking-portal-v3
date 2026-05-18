from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "Tracking Portal API"
    app_env: str = "development"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 1440
    database_url: str = "sqlite:///./tracking_portal.db"
    cors_origins: str = "http://localhost:5173"
    max_upload_mb: int = 10
    upload_dir: str = "./uploads"
    runtime_dir: str = "./runtime_data"
    demo_email: str = "demo@example.com"
    demo_password: str = "change-me-local"
    allow_demo_portal_fallback: bool = True
    allow_demo_account_bootstrap: bool = True
    enable_demo_shipment_adoption: bool = True
    seed_test_users: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @staticmethod
    def _is_local_origin(origin: str) -> bool:
        host = (urlparse(origin).hostname or "").strip().lower()
        return host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}

    @property
    def is_local_env(self) -> bool:
        return self.app_env.lower() in {"development", "local"}

    def validate_runtime_settings(self) -> None:
        if not self.is_local_env:
            origins = self.cors_origins_list
            if self.secret_key == "change-me":
                raise RuntimeError("SECRET_KEY must be changed outside local development.")
            if not origins:
                raise RuntimeError("CORS_ORIGINS must be set outside local development.")
            if "*" in origins:
                raise RuntimeError("Wildcard CORS is not allowed outside local development.")
            if all(self._is_local_origin(origin) for origin in origins):
                raise RuntimeError("CORS_ORIGINS must include at least one non-local origin outside local development.")
            if self.allow_demo_portal_fallback:
                raise RuntimeError("ALLOW_DEMO_PORTAL_FALLBACK must be false outside local development.")
            if self.allow_demo_account_bootstrap:
                raise RuntimeError("ALLOW_DEMO_ACCOUNT_BOOTSTRAP must be false outside local development.")

settings = Settings()
