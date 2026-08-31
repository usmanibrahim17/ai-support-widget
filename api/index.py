import base64
import io
import os
import re
from pathlib import Path
from typing import Literal

import google.generativeai as genai
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pypdf import PdfReader
from supabase import Client, create_client

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")  # no longer used; kept for future reference
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_EMBEDDING_MODEL = "models/gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768
GEMINI_CHAT_MODEL = "gemini-3.6-flash"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
CHAT_MATCH_COUNT = 3
CHAT_HISTORY_LIMIT = 20
# Cosine similarity from the RPC is expected in the 0..1 range.
CHAT_CONFIDENCE_THRESHOLD = 0.60
ESCALATION_MESSAGE = "I don't know, let me connect you with someone who can help."
DEFAULT_BUSINESS_NAME = "this business"
DEFAULT_BUSINESS_DESCRIPTION = ""
DEFAULT_BUSINESS_TONE = "neutral and helpful"

supabase: Client | None = None
if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

### Create FastAPI instance with custom docs and openapi url
app = FastAPI(docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")

# The widget runs on arbitrary third-party business websites, so the API
# has to accept requests from any origin — there's no fixed allowlist we
# could maintain. allow_credentials must stay False: browsers reject the
# combination of allow_origins=["*"] with credentialed requests outright,
# and none of these endpoints rely on cookies/browser-managed credentials
# (business_id is passed explicitly in each request body instead).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class UploadRequest(BaseModel):
    business_id: str
    source_type: Literal["text", "pdf", "url"]
    content: str
    title: str | None = None


class ProcessRequest(BaseModel):
    business_id: str


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    business_id: str
    question: str
    history: list[HistoryTurn] = []


class EscalateRequest(BaseModel):
    business_id: str
    chat_log_id: str
    visitor_email: str


class BusinessProfileRequest(BaseModel):
    business_id: str
    name: str | None = None
    description: str | None = None
    tone: str | None = None


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _error_response(message: str, status_code: int = 400) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"status": "error", "message": message},
    )


def _extract_text(source_type: str, content: str) -> str:
    if source_type == "text":
        return content.strip()

    if source_type == "url":
        try:
            response = requests.get(content, timeout=30)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise ValueError(f"Failed to fetch URL: {exc}") from exc

        soup = BeautifulSoup(response.text, "html.parser")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        return soup.get_text(separator="\n", strip=True)

    if source_type == "pdf":
        try:
            pdf_bytes = base64.b64decode(content, validate=True)
        except (ValueError, base64.binascii.Error) as exc:
            raise ValueError(f"Invalid base64 PDF data: {exc}") from exc

        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            pages = [page.extract_text() or "" for page in reader.pages]
        except Exception as exc:
            raise ValueError(f"Failed to parse PDF: {exc}") from exc

        text = "\n".join(pages).strip()
        if not text:
            raise ValueError("PDF contains no extractable text")
        return text

    raise ValueError(f"Unsupported source_type: {source_type}")


def _chunk_text(
    text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP
) -> list[str]:
    normalized_text = text.strip()
    if not normalized_text:
        raise ValueError("Document is empty")

    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than 0")

    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be between 0 and chunk_size - 1")

    chunks: list[str] = []
    step = chunk_size - overlap

    for start in range(0, len(normalized_text), step):
        end = min(start + chunk_size, len(normalized_text))
        chunk = normalized_text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(normalized_text):
            break

    return chunks


def _create_embedding(chunk: str) -> list[float]:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    try:
        result = genai.embed_content(
            model=GEMINI_EMBEDDING_MODEL,
            content=chunk,
            output_dimensionality=EMBEDDING_DIMENSIONS,
        )
    except Exception as exc:
        raise RuntimeError(f"Failed to reach Gemini embeddings API: {exc}") from exc

    try:
        embedding = result["embedding"]
    except (KeyError, TypeError) as exc:
        raise RuntimeError("Gemini embeddings API returned an invalid response") from exc

    return embedding


def _get_business_profile(business_id: str) -> dict:
    default_profile = {
        "name": DEFAULT_BUSINESS_NAME,
        "description": DEFAULT_BUSINESS_DESCRIPTION,
        "tone": DEFAULT_BUSINESS_TONE,
    }

    if supabase is None:
        return default_profile

    try:
        result = (
            supabase.table("businesses")
            .select("name, description, tone")
            .eq("id", business_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return default_profile

    if not result.data:
        return default_profile

    row = result.data[0]
    return {
        "name": row.get("name") or default_profile["name"],
        "description": row.get("description") or default_profile["description"],
        "tone": row.get("tone") or default_profile["tone"],
    }


def _build_chat_messages(
    question: str, chunks: list[dict], profile: dict
) -> list[dict[str, str]]:
    if chunks:
        context = "\n\n".join(
            [
                f"Chunk {index + 1} (similarity {chunk.get('similarity', 0):.3f}):\n"
                f"{chunk.get('content', '')}"
                for index, chunk in enumerate(chunks)
            ]
        )
    else:
        context = "No relevant context was found."

    persona = f"You are a support assistant for {profile['name']}. "
    if profile["description"]:
        persona += f"About the business: {profile['description']}. "
    persona += f"Respond in a tone that is {profile['tone']}. "

    return [
        {
            "role": "system",
            "content": (
                persona
                + "If the visitor's message is a greeting, thanks, or other small "
                "talk, respond naturally and briefly — do not treat it as an "
                "unanswered question. "
                "For actual questions, answer ONLY using the provided context. "
                "If the context does not contain a real answer to the question, "
                f"reply with exactly: \"{ESCALATION_MESSAGE}\""
            ),
        },
        {
            "role": "user",
            "content": (
                f"Question:\n{question}\n\n"
                f"Context:\n{context}\n\n"
                "Answer using only the context above."
            ),
        },
    ]


def _create_chat_completion(
    question: str, chunks: list[dict], profile: dict, history: list[HistoryTurn]
) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    messages = _build_chat_messages(question, chunks, profile)
    system_message = next(m["content"] for m in messages if m["role"] == "system")
    user_message = next(m["content"] for m in messages if m["role"] == "user")

    history_contents = [
        {
            "role": "user" if turn.role == "user" else "model",
            "parts": [{"text": turn.content}],
        }
        for turn in history[-CHAT_HISTORY_LIMIT:]
    ]
    contents = history_contents + [
        {"role": "user", "parts": [{"text": user_message}]}
    ]

    try:
        model = genai.GenerativeModel(
            GEMINI_CHAT_MODEL, system_instruction=system_message
        )
        response = model.generate_content(
            contents,
            generation_config=genai.types.GenerationConfig(temperature=0),
        )
    except Exception as exc:
        raise RuntimeError(f"Failed to reach Gemini chat API: {exc}") from exc

    try:
        answer = response.text.strip()
    except (ValueError, AttributeError) as exc:
        raise RuntimeError("Gemini chat API returned an invalid response") from exc

    return answer or ESCALATION_MESSAGE


def _match_chunks(
    query_embedding: list[float],
    business_id: str,
    match_count: int = CHAT_MATCH_COUNT,
) -> list[dict]:
    if supabase is None:
        raise RuntimeError("Supabase client is not configured")

    params = {
        "query_embedding": query_embedding,
        "match_count": match_count,
        "filter_business_id": business_id,
    }
    print(
        "[chat-debug] rpc_params="
        f"{{'query_embedding': <{type(query_embedding).__name__} "
        f"len={len(query_embedding)} first5={query_embedding[:5]!r}>, "
        f"'match_count': {match_count}}}"
    )

    try:
        result = supabase.rpc(
            "match_chunks",
            params,
        ).execute()
    except Exception as exc:
        print(f"[chat-debug] rpc_exception_type={type(exc).__name__}")
        print(f"[chat-debug] rpc_exception_repr={exc!r}")
        print(f"[chat-debug] rpc_exception_message={str(exc)}")
        if hasattr(exc, "response"):
            print(f"[chat-debug] rpc_exception_response={getattr(exc, 'response')!r}")
        if hasattr(exc, "args"):
            print(f"[chat-debug] rpc_exception_args={getattr(exc, 'args')!r}")
        raise RuntimeError(
            "Failed to search chunks with RPC function `match_chunks`. "
            "Create the SQL function first, then try again. "
            f"Details: {exc}"
        ) from exc

    print(f"[chat-debug] rpc_raw_response={result!r}")
    return result.data or []


def _save_chat_log(
    business_id: str, question: str, answer: str, was_escalated: bool
) -> str:
    if supabase is None:
        raise RuntimeError("Supabase client is not configured")

    try:
        result = (
            supabase.table("chat_logs")
            .insert(
                {
                    "business_id": business_id,
                    "question": question,
                    "answer": answer,
                    "was_escalated": was_escalated,
                }
            )
            .execute()
        )
    except Exception as exc:
        raise RuntimeError(f"Failed to save chat log: {exc}") from exc

    if not result.data:
        raise RuntimeError("Failed to save chat log: no data returned")

    return result.data[0]["id"]


@app.get("/api/py/helloFastApi")
def hello_fast_api():
    return {"message": "Hello from FastAPI"}


@app.get("/api/py/test-connection")
def test_connection():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "supabase": "failed",
                "message": "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment",
            },
        )

    if supabase is None:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "supabase": "failed",
                "message": "Supabase client failed to initialize",
            },
        )

    try:
        supabase.table("documents").select("*").limit(1).execute()
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "supabase": "failed",
                "message": str(exc),
            },
        )

    return {"status": "connected", "supabase": "ok"}


@app.post("/api/py/upload")
def upload_document(body: UploadRequest):
    if supabase is None:
        return _error_response(
            "Supabase is not configured — check SUPABASE_URL and SUPABASE_SERVICE_KEY",
            status_code=500,
        )

    business_id = body.business_id.strip()
    if not business_id:
        return _error_response("business_id is required")

    try:
        raw_content = _extract_text(body.source_type, body.content)
    except ValueError as exc:
        return _error_response(str(exc))

    if not raw_content:
        return _error_response("No text content could be extracted")

    row = {
        "business_id": business_id,
        "title": body.title or "Untitled",
        "source_type": body.source_type,
        "raw_content": raw_content,
    }

    try:
        result = supabase.table("documents").insert(row).execute()
    except Exception as exc:
        return _error_response(f"Failed to save document: {exc}", status_code=500)

    if not result.data:
        return _error_response("Failed to save document: no data returned", status_code=500)

    document = result.data[0]
    document_id = document.get("id")
    preview = raw_content[:300]

    return {
        "status": "ok",
        "id": document_id,
        "preview": preview,
    }


@app.post("/api/py/process/{document_id}")
def process_document(document_id: str, body: ProcessRequest):
    if supabase is None:
        return _error_response(
            "Supabase is not configured — check SUPABASE_URL and SUPABASE_SERVICE_KEY",
            status_code=500,
        )

    business_id = body.business_id.strip()
    if not business_id:
        return _error_response("business_id is required")

    try:
        result = (
            supabase.table("documents")
            .select("id, business_id, raw_content")
            .eq("id", document_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        return _error_response(f"Failed to load document: {exc}", status_code=500)

    if not result.data or result.data[0].get("business_id") != business_id:
        return _error_response(f"Document {document_id} was not found", status_code=404)

    document = result.data[0]
    raw_content = (document.get("raw_content") or "").strip()
    if not raw_content:
        return _error_response("Document has no raw_content to process")

    try:
        chunks = _chunk_text(raw_content)
    except ValueError as exc:
        return _error_response(str(exc))

    rows = []
    try:
        for chunk in chunks:
            rows.append(
                {
                    "document_id": document_id,
                    "content": chunk,
                    "embedding": _create_embedding(chunk),
                }
            )
    except RuntimeError as exc:
        return _error_response(str(exc), status_code=502)

    try:
        insert_result = supabase.table("chunks").insert(rows).execute()
    except Exception as exc:
        return _error_response(f"Failed to save chunks: {exc}", status_code=500)

    chunks_created = len(insert_result.data) if insert_result.data else len(rows)

    return {
        "status": "ok",
        "document_id": document_id,
        "chunks_created": chunks_created,
    }


@app.post("/api/py/chat")
def chat(body: ChatRequest):
    if supabase is None:
        return _error_response(
            "Supabase is not configured — check SUPABASE_URL and SUPABASE_SERVICE_KEY",
            status_code=500,
        )

    business_id = body.business_id.strip()
    if not business_id:
        return _error_response("business_id is required")

    question = body.question.strip()
    if not question:
        return _error_response("Question is required")

    profile = _get_business_profile(business_id)

    try:
        question_embedding = _create_embedding(question)
    except RuntimeError as exc:
        return _error_response(str(exc), status_code=502)

    print(
        "[chat-debug] "
        f"embedding_length={len(question_embedding)} "
        f"embedding_first5={question_embedding[:5]!r}"
    )

    try:
        matches = _match_chunks(question_embedding, business_id, CHAT_MATCH_COUNT)
    except RuntimeError as exc:
        return _error_response(str(exc), status_code=500)

    print(f"[chat-debug] question={question!r}")
    print(f"[chat-debug] match_count_returned={len(matches)}")
    print(f"[chat-debug] confidence_threshold={CHAT_CONFIDENCE_THRESHOLD}")
    for index, match in enumerate(matches, start=1):
        print(
            "[chat-debug] "
            f"match_{index} similarity={match.get('similarity', 0)} "
            f"content={match.get('content', '')!r}"
        )

    top_chunks = matches[:CHAT_MATCH_COUNT]
    top_similarity = float(top_chunks[0].get("similarity", 0)) if top_chunks else 0.0
    print(
        "[chat-debug] "
        f"top_similarity={top_similarity} "
        f"confidence_threshold={CHAT_CONFIDENCE_THRESHOLD} "
        "(informational only — no longer drives the escalate decision)"
    )

    try:
        answer = _create_chat_completion(question, top_chunks, profile, body.history)
    except RuntimeError as exc:
        return _error_response(str(exc), status_code=502)

    # Escalate only when the model actually returned the exact "I don't know"
    # fallback — not from similarity score alone, so confident answers and
    # greetings/small talk never get flagged regardless of chunk similarity.
    was_escalated = answer.strip().lower() == ESCALATION_MESSAGE.lower()
    print(
        "[chat-debug] "
        "escalate_condition=(answer == ESCALATION_MESSAGE) "
        f"was_escalated={was_escalated}"
    )

    try:
        chat_log_id = _save_chat_log(business_id, question, answer, was_escalated)
    except RuntimeError as exc:
        return _error_response(str(exc), status_code=500)

    return {
        "answer": answer,
        "escalate": was_escalated,
        "chat_log_id": chat_log_id,
    }


@app.post("/api/py/escalate")
def escalate(body: EscalateRequest):
    if supabase is None:
        return _error_response(
            "Supabase is not configured — check SUPABASE_URL and SUPABASE_SERVICE_KEY",
            status_code=500,
        )

    business_id = body.business_id.strip()
    chat_log_id = body.chat_log_id.strip()
    visitor_email = body.visitor_email.strip()

    if not business_id:
        return _error_response("business_id is required")

    if not chat_log_id:
        return _error_response("chat_log_id is required")

    if not visitor_email or not EMAIL_PATTERN.match(visitor_email):
        return _error_response("visitor_email is not a valid email address")

    try:
        chat_log_result = (
            supabase.table("chat_logs")
            .select("id, business_id")
            .eq("id", chat_log_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        return _error_response(f"Failed to look up chat log: {exc}", status_code=500)

    if (
        not chat_log_result.data
        or chat_log_result.data[0].get("business_id") != business_id
    ):
        return _error_response(f"chat_log {chat_log_id} was not found", status_code=404)

    try:
        insert_result = (
            supabase.table("escalations")
            .insert(
                {
                    "chat_log_id": chat_log_id,
                    "visitor_email": visitor_email,
                }
            )
            .execute()
        )
    except Exception as exc:
        return _error_response(f"Failed to save escalation: {exc}", status_code=500)

    if not insert_result.data:
        return _error_response("Failed to save escalation: no data returned", status_code=500)

    return {
        "status": "ok",
        "escalation_id": insert_result.data[0]["id"],
    }


@app.post("/api/py/business-profile")
def upsert_business_profile(body: BusinessProfileRequest):
    if supabase is None:
        return _error_response(
            "Supabase is not configured — check SUPABASE_URL and SUPABASE_SERVICE_KEY",
            status_code=500,
        )

    business_id = body.business_id.strip()
    if not business_id:
        return _error_response("business_id is required")

    row = {
        "id": business_id,
        "name": body.name,
        "description": body.description,
        "tone": body.tone,
    }

    try:
        result = supabase.table("businesses").upsert(row).execute()
    except Exception as exc:
        return _error_response(f"Failed to save business profile: {exc}", status_code=500)

    if not result.data:
        return _error_response(
            "Failed to save business profile: no data returned", status_code=500
        )

    return {"status": "ok", "profile": result.data[0]}


@app.get("/api/py/business-profile/{business_id}")
def get_business_profile(business_id: str):
    if supabase is None:
        return _error_response(
            "Supabase is not configured — check SUPABASE_URL and SUPABASE_SERVICE_KEY",
            status_code=500,
        )

    try:
        result = (
            supabase.table("businesses")
            .select("id, name, description, tone")
            .eq("id", business_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        return _error_response(f"Failed to load business profile: {exc}", status_code=500)

    if not result.data:
        return {
            "business_id": business_id,
            "name": "",
            "description": "",
            "tone": DEFAULT_BUSINESS_TONE,
            "exists": False,
        }

    row = result.data[0]
    return {
        "business_id": business_id,
        "name": row.get("name") or "",
        "description": row.get("description") or "",
        "tone": row.get("tone") or DEFAULT_BUSINESS_TONE,
        "exists": True,
    }
