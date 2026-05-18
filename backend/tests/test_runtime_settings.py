import unittest

from app.core.config import Settings


class RuntimeSettingsValidationTests(unittest.TestCase):
    def test_non_local_accepts_real_public_origins(self):
        settings = Settings(
            app_env="testing",
            secret_key="super-secret-prod-key",
            cors_origins="https://tracking-portal-v3.vercel.app,https://tracking-portal-v3-backend.onrender.com",
            allow_demo_portal_fallback=False,
            allow_demo_account_bootstrap=False,
        )

        settings.validate_runtime_settings()

    def test_non_local_rejects_localhost_only_origins(self):
        settings = Settings(
            app_env="testing",
            secret_key="super-secret-prod-key",
            cors_origins="http://localhost:5173,http://127.0.0.1:5173",
            allow_demo_portal_fallback=False,
            allow_demo_account_bootstrap=False,
        )

        with self.assertRaisesRegex(RuntimeError, "CORS_ORIGINS must include at least one non-local origin"):
            settings.validate_runtime_settings()

    def test_non_local_rejects_wildcard_origins(self):
        settings = Settings(
            app_env="testing",
            secret_key="super-secret-prod-key",
            cors_origins="*",
            allow_demo_portal_fallback=False,
            allow_demo_account_bootstrap=False,
        )

        with self.assertRaisesRegex(RuntimeError, "Wildcard CORS is not allowed"):
            settings.validate_runtime_settings()

    def test_local_keeps_development_defaults(self):
        settings = Settings(
            app_env="development",
            secret_key="change-me",
            cors_origins="*",
            allow_demo_portal_fallback=True,
            allow_demo_account_bootstrap=True,
        )

        settings.validate_runtime_settings()


if __name__ == "__main__":
    unittest.main()
