# Tracking Portal

Shipment Manager web portal with integrated tracking, BL document handling, movement classification, and operational dashboarding.

## Current Phase
Phase 1 is complete and ready for controlled testing.

## Project Structure
- `frontend/` React + Vite dashboard
- `backend/` FastAPI API and shipment logic
- `docs/` closure note, Phase 2 plan, UAT sheet, and deployment/testing guide

## Core Phase 1 Capabilities
- Manual shipment entry
- Excel import with relevant-sheet detection
- Customer-name normalization and suggestions
- BL-wise dashboard grouping
- Tracking refresh and movement classification
- BL document upload, replacement, and viewing
- Completion flow with clearance doc number
- User-scoped shipment and document data

## Important Docs
- `docs/PHASE_1_CLOSURE_NOTE.md`
- `docs/PHASE_2_EXECUTION_PLAN.md`
- `docs/UAT_TESTING_SHEET.md`
- `docs/DEPLOYMENT_AND_TESTER_SETUP.md`

## Local Run

### Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend
```powershell
cd frontend
npm install
copy .env.example .env
npm run dev -- --host 127.0.0.1 --port 5173
```

## Deployment Notes
For friend/UAT deployment, use the configuration in `docs/DEPLOYMENT_AND_TESTER_SETUP.md`.

The key hosted settings are:
- disable demo frontend auto-login
- disable demo backend fallback
- seed separate tester accounts
- deploy with a fresh database, not your local one
