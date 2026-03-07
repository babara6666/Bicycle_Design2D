from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel as PydanticBase
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Component, Configuration, DrawingJob, Skeleton, User
from .schemas import (
    ComponentDetail,
    ComponentListItem,
    ConfirmPaPbPayload,
    ConfigurationConstraintsPatch,
    ConfigurationCreate,
    ConfigurationDetail,
    ConfigurationListItem,
    HealthOut,
    SkeletonDetail,
    SkeletonListItem,
)
from .config import settings
from .scripts.extract_svg import extract_svg_preview
from .security import (
    CurrentUser,
    TokenResponse,
    assert_output_path,
    assert_source_path,
    authenticate_user,
    create_access_token,
    get_current_user,
    hash_password,
    require_admin,
    require_editor,
)
from .services.head_tube import compute_local_pa_pb, update_pa_pb_in_dxf

app = FastAPI(title="IBDS Bicycle2D API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DbDep = Annotated[Session, Depends(get_db)]
AuthDep = Annotated[CurrentUser, Depends(get_current_user)]
EditorDep = Annotated[CurrentUser, Depends(require_editor)]
AdminDep = Annotated[CurrentUser, Depends(require_admin)]


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------


class LoginRequest(PydanticBase):
    username: str
    password: str


class UserCreateRequest(PydanticBase):
    username: str
    password: str
    role: str = "viewer"  # viewer | editor | admin


class UserOut(PydanticBase):
    id: int
    username: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


@app.post("/api/auth/login", response_model=TokenResponse)
def login(request: LoginRequest, db: DbDep) -> TokenResponse:
    """Authenticate and return a JWT bearer token."""
    user = authenticate_user(db, request.username, request.password)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(user.username, user.role)
    return TokenResponse(access_token=token, role=user.role)


@app.get("/api/auth/me", response_model=UserOut)
def me(current_user: AuthDep, db: DbDep) -> User:
    """Return the profile of the currently authenticated user."""
    stmt = select(User).where(User.username == current_user.username)
    user = db.scalars(stmt).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.post("/api/auth/users", response_model=UserOut, status_code=201)
def create_user(request: UserCreateRequest, _admin: AdminDep, db: DbDep) -> User:
    """Admin only: create a new user."""
    if db.scalars(select(User).where(User.username == request.username)).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    allowed_roles = {"viewer", "editor", "admin"}
    if request.role not in allowed_roles:
        raise HTTPException(
            status_code=422, detail=f"role must be one of {allowed_roles}"
        )
    user = User(
        username=request.username,
        hashed_password=hash_password(request.password),
        role=request.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.get("/api/auth/users", response_model=list[UserOut])
def list_users(_admin: AdminDep, db: DbDep) -> list[User]:
    """Admin only: list all users."""
    return list(db.scalars(select(User).order_by(User.id)).all())


@app.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    return HealthOut(ok=True)


@app.get("/api/components", response_model=list[ComponentListItem])
def list_components(
    db: DbDep,
    category: str | None = Query(default=None),
    vehicle: str | None = Query(default=None),
) -> list[Component]:
    stmt = select(Component)
    if category:
        stmt = stmt.where(Component.category == category)
    if vehicle:
        stmt = stmt.where(Component.vehicle == vehicle)
    stmt = stmt.order_by(Component.vehicle, Component.category, Component.name)
    return list(db.scalars(stmt).all())


@app.get("/api/components/{component_id}", response_model=ComponentDetail)
def get_component(component_id: int, db: DbDep) -> Component:
    component = db.get(Component, component_id)
    if component is None:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@app.get("/api/skeletons", response_model=list[SkeletonListItem])
def list_skeletons(db: DbDep) -> list[Skeleton]:
    stmt = select(Skeleton).order_by(Skeleton.vehicle)
    return list(db.scalars(stmt).all())


@app.get("/api/skeletons/{skeleton_id}", response_model=SkeletonDetail)
def get_skeleton(skeleton_id: int, db: DbDep) -> Skeleton:
    skeleton = db.get(Skeleton, skeleton_id)
    if skeleton is None:
        raise HTTPException(status_code=404, detail="Skeleton not found")
    return skeleton


@app.get("/api/configurations", response_model=list[ConfigurationListItem])
def list_configurations(
    db: DbDep,
    vehicle: str | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=200),
) -> list[Configuration]:
    stmt = select(Configuration)
    if vehicle:
        stmt = stmt.join(Skeleton, Skeleton.id == Configuration.skeleton_id).where(
            Skeleton.vehicle == vehicle
        )
    stmt = stmt.order_by(desc(Configuration.updated_at)).limit(limit)
    return list(db.scalars(stmt).all())


@app.get("/api/configurations/{configuration_id}", response_model=ConfigurationDetail)
def get_configuration(configuration_id: int, db: DbDep) -> Configuration:
    configuration = db.get(Configuration, configuration_id)
    if configuration is None:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return configuration


@app.post("/api/configurations", response_model=ConfigurationDetail, status_code=201)
def create_configuration(
    payload: ConfigurationCreate, db: DbDep, _user: AuthDep
) -> Configuration:
    skeleton = db.get(Skeleton, payload.skeleton_id)
    if skeleton is None:
        raise HTTPException(status_code=404, detail="Skeleton not found")

    requested_component_ids = [item.component_id for item in payload.components]
    if not requested_component_ids:
        raise HTTPException(status_code=400, detail="components cannot be empty")

    found_components = list(
        db.scalars(
            select(Component.id).where(Component.id.in_(requested_component_ids))
        ).all()
    )
    missing_ids = sorted(set(requested_component_ids) - set(found_components))
    if missing_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Component ids not found: {missing_ids}",
        )

    configuration = Configuration(
        skeleton_id=payload.skeleton_id,
        name=payload.name,
        components=[item.model_dump() for item in payload.components],
        pa_position=payload.pa_position.model_dump() if payload.pa_position else None,
        pb_position=payload.pb_position.model_dump() if payload.pb_position else None,
        seat_tube_override=payload.seat_tube_override,
        overrides=payload.overrides,
    )
    db.add(configuration)
    db.commit()
    db.refresh(configuration)
    return configuration


@app.patch(
    "/api/configurations/{configuration_id}/constraints",
    response_model=ConfigurationDetail,
)
def patch_configuration_constraints(
    configuration_id: int,
    payload: ConfigurationConstraintsPatch,
    db: DbDep,
    _user: AuthDep,
) -> Configuration:
    configuration = db.get(Configuration, configuration_id)
    if configuration is None:
        raise HTTPException(status_code=404, detail="Configuration not found")

    updates = payload.model_dump(exclude_unset=True)
    if "pa_position" in updates:
        pa_point = updates["pa_position"]
        configuration.pa_position = pa_point
    if "pb_position" in updates:
        pb_point = updates["pb_position"]
        configuration.pb_position = pb_point
    if "seat_tube_override" in updates:
        configuration.seat_tube_override = updates["seat_tube_override"]
    if "overrides" in updates:
        configuration.overrides = updates["overrides"]

    db.add(configuration)
    db.commit()
    db.refresh(configuration)
    return configuration


@app.post(
    "/api/components/{component_id}/confirm-pa-pb",
    response_model=ComponentDetail,
)
def confirm_pa_pb(
    component_id: int,
    payload: ConfirmPaPbPayload,
    db: DbDep,
    _editor: EditorDep,
) -> Component:
    """Write confirmed PA/PB world positions back to the head-tube DXF and DB.

    Steps:
    1. Validate component exists and is category ``head_tube``.
    2. Resolve the DXF working-copy path from ``metadata_json.dxf_path``.
    3. Determine the HT_Attach world position (from skeleton if provided,
       else falls back to (0, 0)).
    4. Determine the HT_Attach local position (from component.attach_primary,
       else (0, 0)).
    5. Convert PA/PB world ??local using inverse rotation.
    6. Write updated INSERT blocks to the DXF (one-time backup preserved).
    7. Re-generate SVG preview from the updated DXF.
    8. Persist pa_default, pb_default, preview_svg to DB.
    9. Return updated ComponentDetail.
    """
    component = db.get(Component, component_id)
    if component is None:
        raise HTTPException(status_code=404, detail="Component not found")
    if component.category != "head_tube":
        raise HTTPException(
            status_code=400,
            detail=f"Component {component_id} is not a head_tube (got {component.category!r}).",
        )

    # Resolve DXF path
    meta = component.metadata_json or {}
    dxf_path_str: str | None = meta.get("dxf_path")
    if not dxf_path_str:
        raise HTTPException(
            status_code=422,
            detail="Component has no dxf_path in metadata. Re-run seed_db.py.",
        )
    dxf_path = Path(dxf_path_str)
    if not dxf_path.exists():
        raise HTTPException(
            status_code=422,
            detail=f"DXF file not found: {dxf_path}",
        )

    # HT_Attach world position ??from skeleton or (0, 0)
    ht_world = (0.0, 0.0)
    if payload.skeleton_id is not None:
        skeleton = db.get(Skeleton, payload.skeleton_id)
        if skeleton is None:
            raise HTTPException(status_code=404, detail="Skeleton not found")
        ht_node = skeleton.nodes.get("HT_Attach", {})
        ht_world = (float(ht_node.get("x", 0.0)), float(ht_node.get("y", 0.0)))

    # HT_Attach local position ??from component.attach_primary or (0, 0)
    ap = component.attach_primary or {}
    ht_local = (float(ap.get("x", 0.0)), float(ap.get("y", 0.0)))

    # Convert world ??local
    pa_local, pb_local = compute_local_pa_pb(
        pa_world=(payload.pa.x, payload.pa.y),
        pb_world=(payload.pb.x, payload.pb.y),
        ht_attach_world=ht_world,
        ht_attach_local=ht_local,
        angle_deg=payload.head_tube_angle_deg,
    )

    # Update DXF
    try:
        update_pa_pb_in_dxf(dxf_path, pa_local, pb_local)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update DXF: {exc}",
        ) from exc

    # Regenerate SVG
    try:
        new_svg = extract_svg_preview(dxf_path)
    except Exception:
        new_svg = component.preview_svg  # keep old SVG on failure

    # Persist to DB
    component.pa_default = {"x": pa_local.x, "y": pa_local.y}
    component.pb_default = {"x": pb_local.x, "y": pb_local.y}
    component.preview_svg = new_svg
    db.add(component)
    db.commit()
    db.refresh(component)
    return component


# ?? AI Image Endpoints (Gemini Nano Banana 2) ??????????????????????????????????


class AIImageResponse(PydanticBase):
    image_base64: str | None = None
    text: str | None = None
    error: str | None = None


class AIRefineRequest(PydanticBase):
    image: str  # base64 PNG/JPEG (may include data: prefix)
    prompt: str | None = None
    component_summary: str = ""


class AIBrandPartsRequest(PydanticBase):
    image: str
    user_prompt: str


class AIReplacePartRequest(PydanticBase):
    base_image: str
    current_part_image: str | None = None
    part_image: str
    target_mask_image: str | None = None
    part_name_zh: str
    part_name_en: str
    design_name: str
    parts_context: str


class AISimilarRequest(PydanticBase):
    bicycle_image: str
    reference_image: str
    user_prompt: str


class AIIntegrateRequest(PydanticBase):
    combined_canvas: str  # full canvas WITH all overlays visible
    part_names_en: str  # e.g. "Down Tube, Top Tube"
    part_names_zh: str


def _get_gemini(http_request: Request):
    """Resolve the per-user Gemini API key from the request header."""
    from .services.gemini_service import GeminiImageService

    import re as _re

    raw_key = http_request.headers.get("X-Gemini-Key", "")
    # Strip any character outside printable ASCII (e.g. \xa0 non-breaking
    # space copied from a browser/PDF) that would cause codec errors.
    api_key = _re.sub(r"[^\x21-\x7e]", "", raw_key).strip()
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=(
                "Gemini API Key is required. Open the Gemini Key dialog and paste your own Google Gemini API key before generating images.",
            ),
        )
    return GeminiImageService(api_key, settings.gemini_image_model)


@app.post("/api/ai/refine", response_model=AIImageResponse)
async def ai_refine(request: AIRefineRequest, http_request: Request) -> AIImageResponse:
    """Generate a marketing illustration from a 2D SVG screenshot."""
    svc = _get_gemini(http_request)
    try:
        result = await asyncio.to_thread(
            svc.generate_marketing_image,
            request.image,
            request.component_summary,
            request.prompt,
        )
        return AIImageResponse(**result)
    except Exception as exc:
        print(f"[AI /refine ERROR] {type(exc).__name__}: {exc}")
        return AIImageResponse(error=str(exc))


@app.post("/api/ai/brand-parts", response_model=AIImageResponse)
async def ai_brand_parts(
    request: AIBrandPartsRequest, http_request: Request
) -> AIImageResponse:
    """Sketch how brand-specific parts would look on the 2D frame."""
    svc = _get_gemini(http_request)
    try:
        result = await asyncio.to_thread(
            svc.generate_brand_parts,
            request.image,
            request.user_prompt,
        )
        return AIImageResponse(**result)
    except Exception as exc:
        return AIImageResponse(error=str(exc))


@app.post("/api/ai/replace-part", response_model=AIImageResponse)
async def ai_replace_part(
    request: AIReplacePartRequest, http_request: Request
) -> AIImageResponse:
    """Replace a specific part in the 2D drawing using a reference image."""
    svc = _get_gemini(http_request)
    try:
        result = await asyncio.to_thread(
            svc.replace_part,
            request.base_image,
            request.part_image,
            request.current_part_image,
            request.target_mask_image,
            request.part_name_zh,
            request.part_name_en,
            request.design_name,
            request.parts_context,
        )
        return AIImageResponse(**result)
    except Exception as exc:
        return AIImageResponse(error=str(exc))


@app.post("/api/ai/similar", response_model=AIImageResponse)
async def ai_similar(
    request: AISimilarRequest, http_request: Request
) -> AIImageResponse:
    """Apply styling/colours from a reference image to the bicycle drawing."""
    svc = _get_gemini(http_request)
    try:
        result = await asyncio.to_thread(
            svc.generate_similar_image,
            request.bicycle_image,
            request.reference_image,
            request.user_prompt,
        )
        return AIImageResponse(**result)
    except Exception as exc:
        return AIImageResponse(error=str(exc))


@app.post("/api/ai/integrate-part", response_model=AIImageResponse)
async def ai_integrate_part(
    request: AIIntegrateRequest, http_request: Request
) -> AIImageResponse:
    """Blend a placed AI part overlay seamlessly into the bicycle drawing."""
    svc = _get_gemini(http_request)
    try:
        result = await asyncio.to_thread(
            svc.integrate_part,
            request.combined_canvas,
            request.part_names_en,
            request.part_names_zh,
        )
        return AIImageResponse(**result)
    except Exception as exc:
        return AIImageResponse(error=str(exc))


# ---------------------------------------------------------------------------
# Phase 5 — Export endpoints
# ---------------------------------------------------------------------------

OUTPUT_DXF_DIR = Path(r"D:\DownloadD\Stanley\FS\Bicycle2D\Output\dxf")
OUTPUT_DWG_DIR = Path(r"D:\DownloadD\Stanley\FS\Bicycle2D\Output\dwg")
OUTPUT_PDF_DIR = Path(r"D:\DownloadD\Stanley\FS\Bicycle2D\Output\pdf")


class ExportRequest(PydanticBase):
    configuration_id: int


class JobStatusResponse(PydanticBase):
    job_id: int
    status: str  # pending | processing | completed | failed
    progress: int  # 0-100
    current_step: str | None = None
    dxf_path: str | None = None
    dwg_path: str | None = None
    pdf_path: str | None = None
    error_message: str | None = None


def _job_to_status(job: DrawingJob) -> JobStatusResponse:
    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        progress=job.progress,
        current_step=job.current_step,
        dxf_path=job.dxf_path,
        dwg_path=job.dwg_path,
        pdf_path=job.pdf_path,
        error_message=job.error_message,
    )


def _run_export_job(job_id: int) -> None:
    """
    Background task: assembles DXF, attempts DWG conversion, then PDF.
    Uses its own DB session (background tasks run outside the request session).
    """
    from .database import SessionLocal  # local import to avoid circular
    from .services.assembly import (
        convert_dxf_to_dwg,
        generate_assembly_dxf,
        generate_pdf_from_dxf,
    )

    db = SessionLocal()
    try:
        job: DrawingJob | None = db.get(DrawingJob, job_id)
        if job is None:
            return
        job_nn: DrawingJob = job  # narrow away None for Pyright

        def _update(status: str, progress: int, step: str) -> None:
            job_nn.status = status
            job_nn.progress = progress
            job_nn.current_step = step
            db.commit()

        _update("processing", 5, "頛閮剖?")

        config: Configuration | None = db.get(Configuration, job_nn.configuration_id)
        if config is None:
            job_nn.status = "failed"
            job_nn.error_message = "Configuration not found"
            db.commit()
            return

        # Build components_data list
        components_data: list[dict] = []
        for ref in config.components:
            cat = ref.get("category") if isinstance(ref, dict) else ref.category
            cid = ref.get("component_id") if isinstance(ref, dict) else ref.component_id
            comp: Component | None = db.get(Component, cid)
            if comp is None:
                continue
            dxf_path = comp.dwg_path  # already DXF in dxf_source
            att = comp.attach_primary or {"x": 0.0, "y": 0.0}
            # Position: use skeleton node or default origin
            position = {"x": 0.0, "y": 0.0}
            if config.pa_position and cat == "head_tube":
                position = config.pa_position
            components_data.append(
                {
                    "dwg_path": dxf_path,
                    "attach_primary": att,
                    "position": position,
                    "angle_deg": 0.0,
                }
            )

        _update("processing", 20, "蝯? DXF")

        job_name = f"job_{job_id}_{uuid.uuid4().hex[:6]}"
        dxf_out = str(OUTPUT_DXF_DIR / f"{job_name}.dxf")
        try:
            generate_assembly_dxf(components_data, dxf_out)
            job_nn.dxf_path = dxf_out
            db.commit()
        except Exception as exc:  # noqa: BLE001
            job_nn.status = "failed"
            job_nn.error_message = f"DXF assembly failed: {exc}"
            db.commit()
            return

        _update("processing", 60, "頧? DWG")

        try:
            dwg_out = convert_dxf_to_dwg(dxf_out, str(OUTPUT_DWG_DIR))
            job_nn.dwg_path = dwg_out
            db.commit()
        except FileNotFoundError as exc:
            # ODA not installed ??DWG step skipped, not fatal
            job_nn.current_step = f"DWG 頝喲? (ODA?芸?鋆?: {exc}"
            db.commit()
        except Exception as exc:  # noqa: BLE001
            job_nn.current_step = f"DWG 憭望?: {exc}"
            db.commit()

        _update("processing", 80, "頛詨 PDF")

        try:
            pdf_out = generate_pdf_from_dxf(dxf_out, str(OUTPUT_PDF_DIR))
            job_nn.pdf_path = pdf_out
            db.commit()
        except FileNotFoundError as exc:
            job_nn.current_step = f"PDF 頝喲? (LibreOffice?芸?鋆?: {exc}"
            db.commit()
        except Exception as exc:  # noqa: BLE001
            job_nn.current_step = f"PDF 憭望?: {exc}"
            db.commit()

        job_nn.status = "completed"
        job_nn.progress = 100
        job_nn.current_step = "摰?"
        db.commit()

    except Exception as exc:  # noqa: BLE001
        try:
            job = db.get(DrawingJob, job_id)
            if job:
                job.status = "failed"
                job.error_message = str(exc)
                db.commit()
        except Exception:  # noqa: BLE001
            pass
    finally:
        db.close()


@app.post("/api/export/dwg", response_model=JobStatusResponse, status_code=202)
def start_export(
    request: ExportRequest,
    background_tasks: BackgroundTasks,
    db: DbDep,
    _user: AuthDep,
) -> JobStatusResponse:
    """Trigger a background DXF/DWG/PDF export job for a configuration."""
    config = db.get(Configuration, request.configuration_id)
    if config is None:
        raise HTTPException(status_code=404, detail="Configuration not found")

    job = DrawingJob(
        configuration_id=request.configuration_id,
        status="pending",
        progress=0,
        current_step="Queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_export_job, job.id)
    return _job_to_status(job)


@app.get("/api/export/status/{job_id}", response_model=JobStatusResponse)
def get_export_status(job_id: int, db: DbDep) -> JobStatusResponse:
    """Poll export job progress."""
    job = db.get(DrawingJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_status(job)


@app.get("/api/export/download/{job_id}/dxf")
def download_dxf(job_id: int, db: DbDep, _user: AuthDep) -> FileResponse:
    """Download the assembled DXF file."""
    job = db.get(DrawingJob, job_id)
    if job is None or not job.dxf_path:
        raise HTTPException(status_code=404, detail="DXF not available")
    assert_output_path(job.dxf_path)
    p = Path(job.dxf_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="DXF file missing on disk")
    return FileResponse(str(p), media_type="application/dxf", filename=p.name)


@app.get("/api/export/download/{job_id}/dwg")
def download_dwg(job_id: int, db: DbDep, _user: AuthDep) -> FileResponse:
    """Download the DWG file (requires ODA conversion to have succeeded)."""
    job = db.get(DrawingJob, job_id)
    if job is None or not job.dwg_path:
        raise HTTPException(
            status_code=404,
            detail="DWG not available. ODA File Converter may not be installed.",
        )
    assert_output_path(job.dwg_path)
    p = Path(job.dwg_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="DWG file missing on disk")
    return FileResponse(
        str(p),
        media_type="application/acad",
        filename=p.name,
    )


@app.get("/api/export/download/{job_id}/pdf")
def download_pdf(job_id: int, db: DbDep, _user: AuthDep) -> FileResponse:
    """Download the PDF file (requires LibreOffice to be installed)."""
    job = db.get(DrawingJob, job_id)
    if job is None or not job.pdf_path:
        raise HTTPException(
            status_code=404,
            detail="PDF not available. LibreOffice may not be installed.",
        )
    assert_output_path(job.pdf_path)
    p = Path(job.pdf_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="PDF file missing on disk")
    return FileResponse(str(p), media_type="application/pdf", filename=p.name)
