"""
assembly.py — generate a combined DXF from multiple component DXF files,
              then optionally convert to DWG via ODA File Converter.

Note: ODA File Converter must be installed for DWG output.
      If it is not present the convert_dxf_to_dwg() call will raise FileNotFoundError.
"""

from __future__ import annotations

import math
import os
import subprocess
from pathlib import Path

import ezdxf
from ezdxf.math import Matrix44

# Default ODA path — can be overridden via env var ODA_PATH
ODA_DEFAULT = r"C:\Program Files\ODA\ODAFileConverter 27.1.0\ODAFileConverter.exe"
ODA_PATH = os.environ.get("ODA_PATH", ODA_DEFAULT)


def generate_assembly_dxf(
    components_data: list[dict],
    output_path: str,
) -> str:
    """
    Combine multiple component DXF files into one assembly DXF.

    Each entry in components_data must contain:
        dwg_path        str   — path to the source DXF (or DWG if readable)
        attach_primary  dict  — {"x": float, "y": float}  local attach point
        position        dict  — {"x": float, "y": float}  world position
        angle_deg       float — rotation around attach_primary in degrees

    Returns the output_path on success.
    Raises FileNotFoundError if a source DXF is missing.
    """
    assembly = ezdxf.new("R2010")
    msp = assembly.modelspace()

    for comp in components_data:
        src_path = comp["dwg_path"]
        if not Path(src_path).exists():
            raise FileNotFoundError(f"Source DXF not found: {src_path}")

        source_doc = ezdxf.readfile(src_path)
        importer = ezdxf.xref.Importer(source_doc, assembly)
        importer.import_modelspace()

        a = math.radians(comp.get("angle_deg", 0.0))
        pos = comp.get("position", {"x": 0.0, "y": 0.0})
        att = comp.get("attach_primary", {"x": 0.0, "y": 0.0})

        # Translate so that attach_primary lands at position after rotation
        tx = pos["x"] - (att["x"] * math.cos(a) - att["y"] * math.sin(a))
        ty = pos["y"] - (att["x"] * math.sin(a) + att["y"] * math.cos(a))

        transform = Matrix44.chain(
            Matrix44.z_rotate(a),
            Matrix44.translate(tx, ty, 0),
        )
        for entity in msp:
            if hasattr(entity, "transform"):
                try:
                    entity.transform(transform)
                except Exception:  # noqa: BLE001
                    pass

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    assembly.saveas(output_path)
    return output_path


def convert_dxf_to_dwg(dxf_path: str, output_dir: str) -> str:
    """
    Convert a DXF file to DWG using ODA File Converter.

    ODA File Converter takes a *source directory* as its first argument, not
    an individual file path.  To avoid converting every DXF that happens to
    sit alongside the target file, we copy the target DXF into a temporary
    directory, convert that directory, then move the resulting DWG to
    output_dir.

    Raises:
        FileNotFoundError — ODA File Converter executable not found.
        subprocess.CalledProcessError — conversion failed.
        RuntimeError — ODA produced no DWG output.
    """
    import shutil
    import tempfile

    oda = ODA_PATH
    if not Path(oda).exists():
        raise FileNotFoundError(
            f"ODA File Converter not found at '{oda}'. "
            "Install it from https://www.opendesign.com/guestfiles/oda_file_converter "
            "or set the ODA_PATH environment variable."
        )

    Path(output_dir).mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_src:
        # Copy only the target DXF into the temp source dir
        tmp_dxf = Path(tmp_src) / Path(dxf_path).name
        shutil.copy2(dxf_path, tmp_dxf)

        with tempfile.TemporaryDirectory() as tmp_out:
            # ODA signature: <src_dir> <out_dir> <version> <type> <recurse> <audit> [filter]
            result = subprocess.run(
                [oda, tmp_src, tmp_out, "ACAD2018", "DWG", "0", "1"],
                capture_output=True,
            )

            dwg_name = Path(dxf_path).with_suffix(".dwg").name
            tmp_dwg = Path(tmp_out) / dwg_name
            if not tmp_dwg.exists():
                stderr = result.stderr.decode(errors="replace")
                stdout = result.stdout.decode(errors="replace")
                raise RuntimeError(
                    f"ODA conversion produced no DWG output (exit={result.returncode}).\n"
                    f"stdout: {stdout}\nstderr: {stderr}"
                )

            # Move the DWG to the final output directory
            final_dwg = Path(output_dir) / dwg_name
            shutil.move(str(tmp_dwg), str(final_dwg))

    return str(final_dwg)


def generate_pdf_from_dxf(dxf_path: str, output_dir: str) -> str:
    """
    Generate a PDF from a DXF using LibreOffice (Draw).
    Falls back gracefully with a FileNotFoundError if LibreOffice is absent.

    Returns path to the generated PDF.
    """
    import shutil

    LO_DEFAULT = r"C:\Program Files\LibreOffice\program\soffice.exe"
    lo_bin = shutil.which("soffice") or shutil.which("libreoffice")
    if not lo_bin:
        # On Windows, soffice is rarely on PATH — fall back to default install location
        if Path(LO_DEFAULT).exists():
            lo_bin = LO_DEFAULT
        else:
            raise FileNotFoundError(
                "LibreOffice (soffice) not found. Install LibreOffice to enable PDF export."
            )

    Path(output_dir).mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [lo_bin, "--headless", "--convert-to", "pdf", "--outdir", output_dir, dxf_path],
        capture_output=True,
        check=True,
    )
    pdf_path = str(Path(output_dir) / Path(dxf_path).with_suffix(".pdf").name)
    return pdf_path
