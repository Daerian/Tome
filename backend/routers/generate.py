from fastapi import APIRouter
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.messages import ModelRequest, ModelResponse, UserPromptPart, TextPart
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from dotenv import load_dotenv
import os

# Load .env before reading any env vars so the API key is available locally.
# In production (Render) the key is already in the environment — load_dotenv is a no-op.
load_dotenv()

router = APIRouter()  # FastAPI router — groups /generate under /api prefix in main.py

TESTING_MODE = os.getenv("TESTING_MODE", "false").lower() == "true"  # toggles console-only output

# Explicitly pass the API key via AnthropicProvider so it works whether the key
# comes from .env (local) or an injected environment variable (Render).
agent = Agent(
    AnthropicModel("claude-haiku-4-5", provider=AnthropicProvider(api_key=os.getenv("ANTHROPIC_API_KEY"))),
    system_prompt="You are a helpful assistant.",
)


class Message(BaseModel):
    """A single chat message with a speaker role and text content."""

    role: str     # "user" or "assistant"
    content: str  # the message text


class GenerateRequest(BaseModel):
    """The full conversation history sent from the frontend on each request."""

    messages: list[Message]  # ordered oldest-to-newest; last item is always the new user prompt


def build_history(messages: list[Message]) -> list:
    """
    Convert frontend message dicts into PydanticAI typed message objects.

    The frontend sends plain ``{role, content}`` dicts. PydanticAI requires
    ``ModelRequest`` (user turns) and ``ModelResponse`` (assistant turns) so
    that it can validate and trace the conversation correctly.

    Parameters
    ----------
    messages : list[Message]
        All messages *except* the latest user prompt — i.e. the prior
        conversation history to pass as context to the model.

    Returns
    -------
    list
        A list of ``ModelRequest`` and ``ModelResponse`` objects ready to
        pass to ``agent.run(..., message_history=...)``.
    """
    history = []  # accumulates typed PydanticAI message objects

    for msg in messages:
        if msg.role == "user":
            # UserPromptPart wraps the text; ModelRequest is the container for user turns
            history.append(ModelRequest(parts=[UserPromptPart(content=msg.content)]))
        else:
            # TextPart wraps the text; ModelResponse is the container for assistant turns
            history.append(ModelResponse(parts=[TextPart(content=msg.content)]))

    return history


@router.post("/generate")
async def generate(body: GenerateRequest):
    """
    Receive the conversation history, call Claude, and return the reply.

    All messages except the last are treated as history; the last message is
    the new user prompt sent to the model. The full history is forwarded so
    Claude has conversational context on every request.

    Parameters
    ----------
    body : GenerateRequest
        Request body containing the full ordered message history. The last
        item must have ``role == "user"``.

    Returns
    -------
    dict
        ``{"result": str}`` with Claude's response, or
        ``{"result": str, "testing": True}`` when TESTING_MODE is enabled.
    """
    history = build_history(body.messages[:-1])  # all prior turns as typed objects
    user_prompt = body.messages[-1].content       # the new message to send to Claude

    result = await agent.run(user_prompt, message_history=history)  # call Claude via PydanticAI

    if TESTING_MODE:
        print("\n--- TESTING MODE ---")
        print(f"History depth: {len(history)} messages")  # number of prior turns
        print(f"User: {user_prompt}")
        print(f"Response: {result.output}")
        print("--------------------\n")
        return {"result": result.output, "testing": True}

    return {"result": result.output}  # result.output is the validated string response from Claude
