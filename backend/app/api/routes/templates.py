from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user
from app.models.template import Template
from app.models.user import User
from app.schemas.template import TemplateCreateRequest, TemplateResponse

router = APIRouter()

@router.post("", response_model=TemplateResponse)
def create_template(
    payload: TemplateCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = Template(
        user_id=current_user.id,
        name=payload.name,
        workbook_sheet_name=payload.workbook_sheet_name,
        header_row=payload.header_row,
        mapping_json=payload.mapping_json,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return TemplateResponse(
        id=template.id,
        name=template.name,
        workbook_sheet_name=template.workbook_sheet_name,
        header_row=template.header_row,
        mapping_json=template.mapping_json,
    )

@router.get("", response_model=list[TemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.execute(select(Template).where(Template.user_id == current_user.id).order_by(Template.id.desc())).scalars().all()
    return [
        TemplateResponse(
            id=row.id,
            name=row.name,
            workbook_sheet_name=row.workbook_sheet_name,
            header_row=row.header_row,
            mapping_json=row.mapping_json,
        )
        for row in rows
    ]

@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Template, template_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Template not found")

    return TemplateResponse(
        id=row.id,
        name=row.name,
        workbook_sheet_name=row.workbook_sheet_name,
        header_row=row.header_row,
        mapping_json=row.mapping_json,
    )

@router.delete("/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Template, template_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(row)
    db.commit()
    return {"deleted": True}
