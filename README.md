# IBDS Bicycle2D

Phase 1 backend scaffold + Phase 2/3 frontend geometry engine scaffold for the 2D AutoCAD workflow.

## Conda environment

Create and use the project environment:

```bash
conda create -y -n bicycle2d python=3.12
conda run -n bicycle2d pip install -r backend/requirements.txt

# interactive shell
conda activate bicycle2d
```

## PostgreSQL setup (Windows)

This project uses PostgreSQL. If `psql` is not in PATH after installation, use the full executable path:

```bash
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -h localhost -U postgres -d postgres -c "CREATE DATABASE ibds2d;"
```

Default credentials used in current local setup:

- User: `postgres`
- Password: `postgres`
- Database: `ibds2d`

## Backend setup

1. Copy `backend/.env.example` to `backend/.env` and adjust DB credentials.
2. Ensure PostgreSQL is running and the `ibds2d` database exists.
3. Convert source DWG files to DXF with AutoCAD COM:

```bash
conda run -n bicycle2d python -m backend.scripts.convert_dwg_to_dxf --skip-existing
```

4. Extract attach blocks and SVG previews:

```bash
conda run -n bicycle2d python -m backend.scripts.extract_blocks
conda run -n bicycle2d python -m backend.scripts.extract_svg
```

5. Create DB tables and seed data:

```bash
conda run -n bicycle2d python -m backend.scripts.init_db
conda run -n bicycle2d python -m backend.scripts.seed_db
```

6. Run API server:

```bash
conda run -n bicycle2d uvicorn backend.main:app --reload
```

## Implemented API endpoints

- `GET /health`
- `GET /api/components`
- `GET /api/components/{id}`
- `GET /api/skeletons`
- `GET /api/skeletons/{id}`
- `GET /api/configurations`
- `GET /api/configurations/{id}`
- `POST /api/configurations`
- `PATCH /api/configurations/{id}/constraints`

## Frontend setup (Phase 2)

1. Install frontend packages:

```bash
conda activate bicycle2d
cd frontend
npm install
```

2. Create frontend env file:

```bash
cp .env.example .env
```

3. Start frontend dev server:

```bash
conda activate bicycle2d
cd frontend
npm run dev
```

4. Build frontend:

```bash
conda activate bicycle2d
cd frontend
npm run build
```

Phase 2 currently includes:

- `Viewer2D` SVG canvas with pan/zoom
- PA/PB drag handles with touch-friendly hit area (44px)
- Vehicle switch + component picker panel
- Geometry panel (head angle, PA/PB inputs, seat tube axis lock)
- Free mode global toggle and warning banner

Phase 3 currently includes:

- Head tube angle auto-calculation from PA/PB line direction
- PA/PB world-coordinate update from head tube angle + local attach offsets
- Top tube auto-angle toward current `PA` point
- Down tube auto-angle toward current `PB` point
- Seat tube axis constraint (`vertical` locks X, `horizontal` locks Y)
- Part dragging constraints (`seat_tube` in normal mode, all parts in free mode)
- Configuration persistence flow (save new, load by id, update constraints)

## Data notes

- Skeleton DXF extraction uses 6 attach blocks by design (`HT_Attach`, `ST_Attach`, `Motor_Attach`, `SS_Attach`, `CS_Attach`, `END_Attach`).
- Top tube / down tube are driven by `PA` and `PB` anchors.
- Head tube `PA` and `PB` were extracted successfully for both vehicles.
