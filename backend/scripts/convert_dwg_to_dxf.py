from __future__ import annotations

import argparse
import platform
import time
from pathlib import Path

from backend.config import settings
from backend.scripts.vehicle_spec import VEHICLES

try:
    import win32com.client  # type: ignore
    import pythoncom  # type: ignore
except Exception:  # pragma: no cover
    win32com = None
    pythoncom = None


RPC_E_CALL_REJECTED = -2147418111


def is_subpath(path: Path, base: Path) -> bool:
    path = path.resolve()
    base = base.resolve()
    return str(path).startswith(str(base))


def to_dxf_name(filename: str) -> str:
    return f"{Path(filename).stem}.dxf"


def collect_jobs(source_base: Path, output_base: Path) -> list[tuple[Path, Path]]:
    jobs: list[tuple[Path, Path]] = []
    for parts in VEHICLES.values():
        folder = parts["_folder"]
        source_folder = source_base / folder
        output_folder = output_base / folder
        output_folder.mkdir(parents=True, exist_ok=True)

        skeleton_file = parts["_skeleton"]
        jobs.append(
            (source_folder / skeleton_file, output_folder / to_dxf_name(skeleton_file))
        )

        for category, filename in parts.items():
            if category.startswith("_"):
                continue
            jobs.append(
                (source_folder / filename, output_folder / to_dxf_name(filename))
            )
    return jobs


def convert_all(source_base: Path, output_base: Path, skip_existing: bool) -> None:
    if platform.system().lower() != "windows":
        raise RuntimeError(
            "This script must run on Windows because AutoCAD COM is required."
        )
    if win32com is None:
        raise RuntimeError(
            "pywin32 is required. Install it in the current environment."
        )
    if pythoncom is None:
        raise RuntimeError(
            "pythoncom is required. Install pywin32 in the current environment."
        )

    if not is_subpath(source_base, Path(settings.allowed_source_dir)):
        raise ValueError("Source path is outside ALLOWED_SOURCE_DIR")
    if not is_subpath(output_base, Path(settings.dxf_source_dir)):
        raise ValueError("Output path must stay inside DXF_SOURCE_DIR")

    jobs = collect_jobs(source_base, output_base)
    app = win32com.client.Dispatch("AutoCAD.Application")
    app.Visible = False

    converted = 0
    failed = 0

    def is_call_rejected(exc: Exception) -> bool:
        if not getattr(exc, "args", None):
            return False
        first_arg = exc.args[0]
        return isinstance(first_arg, int) and first_arg == RPC_E_CALL_REJECTED

    def call_with_retry(func, *args):
        retries = 12
        delay_sec = 0.5
        last_error = None
        for _ in range(retries):
            try:
                return func(*args)
            except Exception as exc:  # pragma: no cover
                if not is_call_rejected(exc):
                    raise
                last_error = exc
                time.sleep(delay_sec)
                pythoncom.PumpWaitingMessages()
        if last_error is not None:
            raise last_error

    def save_as_dxf(document, dxf_path: Path) -> None:
        save_types = [65, 61, 49, 37, 25, 13, 9, 5, 1, None]
        last_error: Exception | None = None
        for save_type in save_types:
            try:
                if save_type is None:
                    call_with_retry(document.SaveAs, str(dxf_path))
                else:
                    call_with_retry(document.SaveAs, str(dxf_path), save_type)
                return
            except Exception as exc:  # pragma: no cover
                last_error = exc
        if last_error is not None:
            raise last_error

    try:
        for source_path, dxf_path in jobs:
            if not source_path.exists():
                print(f"[MISSING] {source_path}")
                failed += 1
                continue

            if skip_existing and dxf_path.exists():
                print(f"[SKIP] {dxf_path}")
                continue

            dxf_path.parent.mkdir(parents=True, exist_ok=True)
            print(f"[CONVERT] {source_path.name} -> {dxf_path.name}")

            document = None
            try:
                document = call_with_retry(app.Documents.Open, str(source_path))
                save_as_dxf(document, dxf_path)
                converted += 1
            except Exception as exc:  # pragma: no cover
                failed += 1
                print(f"[ERROR] {source_path}: {exc}")
            finally:
                if document is not None:
                    try:
                        call_with_retry(document.Close, False)
                    except Exception:
                        pass
                time.sleep(0.2)
    finally:
        app.Quit()

    print(f"\nDone. converted={converted}, failed={failed}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Batch convert source DWG files to DXF with AutoCAD COM"
    )
    parser.add_argument(
        "--source-base",
        default=settings.allowed_source_dir,
        help="DWG source base directory",
    )
    parser.add_argument(
        "--output-base",
        default=settings.dxf_source_dir,
        help="DXF output base directory",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip files already converted",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        convert_all(
            source_base=Path(args.source_base),
            output_base=Path(args.output_base),
            skip_existing=args.skip_existing,
        )
    except Exception as exc:
        print(f"Fatal: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
