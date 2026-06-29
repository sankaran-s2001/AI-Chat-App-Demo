import os
import asyncio
from fastapi import FastAPI, Request, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse, Response
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from groq import Groq
from pydantic import BaseModel

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="AI Chat Demo")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Initialize client
client = None

# Simple in-memory storage mapping session_id (str) to a list of messages.
# Each message is a dict: {"role": "user"|"assistant", "content": str | list}
conversation_histories = {}

class ChatRequest(BaseModel):
    session_id: str
    prompt: str
    image_base64: str | None = None
    max_tokens: int = 2048

class ClearRequest(BaseModel):
    session_id: str


async def stream_chat(session_id: str, prompt: str, image_base64: str, max_tokens: int):
    """
    Asynchronous generator that handles client setup, conversation history,
    image formatting (multimodal), model fallback, and streams tokens.
    """
    global client
    api_key = os.environ.get("GROQ_API_KEY")

    # 1. Verification: Is the API key configured?
    if not api_key or api_key == "your_groq_api_key_here":
        yield "Error: GROQ_API_KEY is not configured. Please set your API key in the .env file."
        return

    # 2. Setup: Lazy-initialize the Groq SDK client
    if not client:
        try:
            client = Groq(api_key=api_key)
        except Exception as e:
            yield f"Error: Failed to initialize Groq client: {str(e)}"
            return

    # 3. Retrieve or initialize conversation memory for this session
    history = conversation_histories.setdefault(session_id, [])

    # 4. Format User Message Content
    # If an image is present, we format it as a multimodal block (list of content elements).
    # Otherwise, it remains a standard string content block.
    if image_base64:
        user_content = [
            {"type": "text", "text": prompt},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{image_base64}"
                }
            }
        ]
    else:
        user_content = prompt

    # 5. Create temporary history list for this request (to avoid mutating it until we succeed)
    system_instruction = {
        "role": "system",
        "content": (
            "You are a helpful assistant. Provide clean, structured, accurate, "
            "and simple responses. Keep your answers direct and concise."
        )
    }
    request_messages = [system_instruction] + list(history)
    request_messages.append({"role": "user", "content": user_content})

    # List of models to try in sequence for fallback logic
    # Tuple represents: (model_id, supports_vision)
    if image_base64:
        models_to_try = [
            ("meta-llama/llama-4-scout-17b-16e-instruct", True),  # Primary Vision
            ("qwen/qwen3.6-27b", True)                            # Fallback Vision
        ]
    else:
        models_to_try = [
            ("llama-3.3-70b-versatile", False),                   # Primary Text (direct response)
            ("openai/gpt-oss-120b", False),                       # Fallback Text (high capacity)
            ("llama-3.1-8b-instant", False)                       # Secondary Text fallback
        ]

    completion = None
    used_model = None

    # 6. Fallback Loop: Iterate through models until one succeeds
    for model_name, supports_vision in models_to_try:
        # If model doesn't support vision but user uploaded an image,
        # we strip the image block to prevent API failure, adapting to text-only mode.
        current_messages = []
        if image_base64 and not supports_vision:
            for msg in request_messages:
                if isinstance(msg["content"], list):
                    text_part = next((item["text"] for item in msg["content"] if item["type"] == "text"), "")
                    current_messages.append({
                        "role": msg["role"], 
                        "content": f"[Image stripped for fallback model] {text_part}"
                    })
                else:
                    current_messages.append(msg)
        else:
            current_messages = request_messages

        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=current_messages,
                max_tokens=max_tokens,
                stream=True
            )
            used_model = model_name
            break  # Success! We have initialized a stream.
        except Exception as e:
            print(f"Warning: Model {model_name} failed. Attempting fallback... Error details: {str(e)}")
            continue

    if not completion:
        yield "Error: All models in the fallback queue failed to respond. Please check your network and API status."
        return

    # Yield a special token to tell the frontend which model was selected
    yield f"[[MODEL:{used_model}]]"

    full_response = ""
    try:
        # Yield tokens in real-time
        for chunk in completion:
            content = chunk.choices[0].delta.content
            if content:
                full_response += content
                yield content
                await asyncio.sleep(0.01) # Cooperate with the event loop
    except Exception as e:
        yield f"\n[Stream interrupted: {str(e)}]"
        return

    # 7. Successful Completion: Save both user and assistant turns to memory
    history.append({"role": "user", "content": user_content})
    history.append({"role": "assistant", "content": full_response})

    # Cap memory history size to the last 20 messages to keep contexts within boundaries
    if len(history) > 20:
        conversation_histories[session_id] = history[-20:]


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(request, "index.html", {"request": request})


@app.post("/ask")
async def ask(request: ChatRequest):
    """
    POST endpoint that receives the prompt, session information, and optional image
    data, returning a chunked token stream.
    """
    return StreamingResponse(
        stream_chat(
            session_id=request.session_id,
            prompt=request.prompt,
            image_base64=request.image_base64,
            max_tokens=request.max_tokens
        ),
        media_type="text/event-stream"
    )


@app.post("/clear")
def clear_session(request: ClearRequest):
    """
    Clears the stored conversation history memory for a given session.
    """
    if request.session_id in conversation_histories:
        conversation_histories[request.session_id] = []
    return {"status": "success", "session_id": request.session_id}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """
    Speech-to-Text endpoint using Groq's Whisper model.
    Transcribes audio files uploaded from client-side microphone.
    """
    global client
    api_key = os.environ.get("GROQ_API_KEY")
    if not client:
        if not api_key:
            raise HTTPException(status_code=500, detail="Groq API key not set.")
        client = Groq(api_key=api_key)

    try:
        file_bytes = await file.read()
        transcription = client.audio.transcriptions.create(
            file=(file.filename or "audio.webm", file_bytes),
            model="whisper-large-v3-turbo"
        )
        return {"text": transcription.text}
    except Exception as e:
        print(f"Transcription Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/speak")
async def speak(text: str):
    """
    Text-to-Speech fallback endpoint using Groq's Orpheus model.
    Generates and returns WAV audio bytes.
    """
    global client
    api_key = os.environ.get("GROQ_API_KEY")
    if not client:
        if not api_key:
            raise HTTPException(status_code=500, detail="Groq API key not set.")
        client = Groq(api_key=api_key)

    try:
        response = client.audio.speech.create(
            model="canopylabs/orpheus-v1-english",
            voice="dan",
            input=text,
            response_format="wav"
        )
        return Response(content=response.content, media_type="audio/wav")
    except Exception as e:
        print(f"TTS Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

