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

settings = Settings()
