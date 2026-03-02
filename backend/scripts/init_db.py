from __future__ import annotations

from backend.database import Base, engine
import backend.models  # noqa: F401


def main() -> int:
    Base.metadata.create_all(bind=engine)
    print("Database tables created.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
