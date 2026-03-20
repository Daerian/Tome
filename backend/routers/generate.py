from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import anthropic
import os

router = APIRouter()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


class GenerateRequest(BaseModel):
    prompt: str


@router.post("/generate")
async def generate(body: GenerateRequest):
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{"role": "user", "content": body.prompt}],
    )
    return {"result": message.content[0].text}