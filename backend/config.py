from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/ibds2d"
    gemini_api_key: str = ""

    # JWT — override in production via environment variable
    jwt_secret: str = "IBDS_CHANGE_ME_IN_PROD_32chars!!"
    jwt_expire_minutes: int = 480

    allowed_source_dir: str = r"D:\DownloadD\Stanley\FS\Companies\太宇\download\整車and建構線\整車and建構線\DWG"
    allowed_output_dir: str = r"D:\DownloadD\Stanley\FS\Bicycle2D\Output"

    dxf_source_dir: str = r"D:\DownloadD\Stanley\FS\Bicycle2D\backend\data\dxf_source"
    svg_output_dir: str = r"D:\DownloadD\Stanley\FS\Bicycle2D\backend\data\svg"
    attach_points_json: str = (
        r"D:\DownloadD\Stanley\FS\Bicycle2D\backend\data\attach_points_all.json"
    )

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).with_name(".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
