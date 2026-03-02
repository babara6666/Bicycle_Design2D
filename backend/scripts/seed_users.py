"""
seed_users.py — create the three default application accounts.

Run once after init_db.py:
    python -m backend.scripts.seed_users

Existing accounts with the same username are left unchanged.
"""

from __future__ import annotations

from backend.database import SessionLocal
from backend.models import User
from backend.security import hash_password

DEFAULT_USERS = [
    {"username": "admin", "password": "ibds2025", "role": "admin"},
    {"username": "editor", "password": "ibds2025", "role": "editor"},
    {"username": "viewer", "password": "ibds2025", "role": "viewer"},
]


def main() -> int:
    with SessionLocal() as db:
        for spec in DEFAULT_USERS:
            existing = (
                db.query(User).filter(User.username == spec["username"]).one_or_none()
            )
            if existing is not None:
                print(f"[SKIP] {spec['username']} already exists")
                continue
            db.add(
                User(
                    username=spec["username"],
                    hashed_password=hash_password(spec["password"]),
                    role=spec["role"],
                    is_active=True,
                )
            )
            db.commit()
            print(f"[OK]   {spec['username']} ({spec['role']}) created")

    print("User seed complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
