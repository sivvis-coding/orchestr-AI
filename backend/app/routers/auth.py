from fastapi import APIRouter, HTTPException, status
import google.genai as genai
from google.genai import types as genai_types

from ..schemas import ValidateKeyRequest, ValidateKeyResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/validate-key", response_model=ValidateKeyResponse)
def validate_api_key(payload: ValidateKeyRequest):
    """Validate a Gemini API key by making a lightweight test call."""
    try:
        client = genai.Client(api_key=payload.api_key)
        response = client.models.generate_content(
            model=payload.model,
            contents="Reply with the single word: OK",
            config=genai_types.GenerateContentConfig(
                max_output_tokens=5,
            ),
        )
        _ = response.text  # raises if blocked / invalid key
        return ValidateKeyResponse(valid=True, message="API key is valid.")
    except Exception as exc:
        return ValidateKeyResponse(valid=False, message=str(exc))
