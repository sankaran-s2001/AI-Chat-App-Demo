import os
from fastapi import FastAPI, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from groq import Groq

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="AI Chat Demo")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Initialize client as None; it will be configured safely
client = None

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(request, "index.html", {"request": request})

@app.get("/ask")
def ask(
    prompt: str = Query(..., description="Ask your question"),
    max_tokens: int = Query(100, description="Maximum output tokens")
):
    global client
    api_key = os.environ.get("GROQ_API_KEY")

    # Check if the API key is configured
    if not api_key or api_key == "your_groq_api_key_here":
        return {
            "question": prompt,
            "answer": "Error: GROQ_API_KEY is not configured. Please set your API key in the .env file."
        }

    # Lazy-initialize client to prevent startup failure if key is added later
    if not client:
        try:
            client = Groq(api_key=api_key)
        except Exception as e:
            return {
                "question": prompt,
                "answer": f"Error: Failed to initialize Groq client: {str(e)}"
            }

    # Perform API completion request with error handling
    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "user", "content": prompt}
            ],
            model="llama-3.1-8b-instant",
            max_tokens=max_tokens,
        )
        answer = chat_completion.choices[0].message.content.strip()
    except Exception as e:
        answer = f"Error: Failed to generate response from Groq. Details: {str(e)}"

    return {
        "question": prompt,
        "answer": answer
    }
