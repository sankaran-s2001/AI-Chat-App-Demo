# 🎨 Nobeth Chat Demo — Student Learning Guide

[![Python](https://img.shields.io/badge/Python-3.11+-blue?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Groq Cloud](https://img.shields.io/badge/Groq-LPU_Cloud-orange?style=for-the-badge)](https://groq.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

Welcome to the **Nobeth Chat Demo**! This application was created by **Nobeth Analytics Institute** as a teaching demo to show students how modern, production-grade AI chatbots are built, styled, and connected.

Rather than hiding complexity behind complex frameworks, this codebase uses **pure Python (FastAPI)**, **vanilla HTML5/CSS3**, and **plain JavaScript** so you can learn every single mechanism line-by-line.

---

## 💡 Core AI Concepts Explained

To understand how this chatbot works under the hood, read through these concepts:

> [!NOTE]  
> **1. How AI Inference Works (API vs. Local)**
> * **What is Inference?** The phase where the AI model runs and computes a response for your question.
> * **Why use an API?** Running models like *Llama 3.3 70B* locally requires expensive graphics cards (GPUs). Instead, we call the **Groq Cloud API**. The user sends a prompt, the backend forwards it to Groq's high-speed servers, and Groq returns the result in milliseconds.

> [!TIP]  
> **2. How Token Streaming Works**
> * **Standard Response:** The server waits for the model to finish writing its entire answer, making the user wait staring at a blank screen.
> * **Streaming Response:** As soon as the AI generates a single word (**token**), it is immediately pushed to the user. We use **Server-Sent Events (SSE)** via FastAPI's `StreamingResponse`. The frontend reads the stream chunk-by-chunk using a JavaScript `ReadableStream` reader, drawing words instantly.

> [!IMPORTANT]  
> **3. How Conversation Memory Works**
> * **State-Free API:** The Groq API has no memory of past turns. To have a conversation, the backend must feed the model the entire history of past messages (`role: "user" | "assistant"`) in every request.
> * **Context Capping:** Large histories slow down the model and increase token costs. We cap the memory to the **last 20 messages** (`history[-20:]`) to keep the chatbot fast and cost-effective.

> [!NOTE]  
> **4. How Multi-Session Works**
> * The sidebar allows students to open multiple distinct chat sessions. 
* The JavaScript file stores all active sessions in memory. When a session is selected, JavaScript clears the chat viewport and redraws only the messages associated with that active `session_id`.
* Clicking the deletion (`×`) button alerts the backend to delete that session's memory dictionary on the server.

> [!IMPORTANT]  
> **5. How Multimodal Vision Works**
> * **Base64 Conversion:** Web browsers cannot directly send image files inside plain JSON text. The frontend reads the image file using `FileReader` and encodes it into a **Base64 string** (a long text string representing binary image data).
> * **Vision Payload:** The backend receives this string and wraps it in a standard message format:
>   `{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,RAW_STRING"}}`

> [!TIP]  
> **6. How Smart Routing & Fallbacks Work**
> * **Smart Routing:** The backend routes your prompt dynamically based on inputs:
>   * **Text-only:** Routed to `llama-3.3-70b-versatile` (Primary: Meta's latest, most accurate 70B model, featuring no annoying thinking blocks) and falls back to `openai/gpt-oss-120b` if busy.
>   * **Image upload:** Routed to `meta-llama/llama-4-scout-17b-16e-instruct` (Primary Vision model) and falls back to `qwen/qwen3.6-27b`.
* If a model fails (e.g., rate limit exceeded), a `try-except` loop immediately catches the error and retries the request using the next fallback model in the list.

> [!NOTE]  
> **7. How Audio Input (Speech-to-Text) Works**
> * **Microphone Capture:** The frontend uses the browser's native `MediaRecorder` API to capture microphone inputs as audio chunks, combining them into a WebM blob.
> * **Interactive Visual Cues:** When recording begins, the interface dynamically applies three states:
>   1. The microphone icon changes to a red recording dot (`🔴`).
>   2. The text input placeholder changes to `"🎙️ Listening... Click 🔴 to Stop & Transcribe"`.
>   3. The text input box border glows with a red pulsing animation.
> * **Whisper Transcription:** Stopping the recording uploads the blob via a POST request to `/transcribe`. The backend calls Groq's high-speed **Whisper Large v3 Turbo** API to convert the spoken audio into text and populates the text field.

> [!TIP]  
> **8. How Audio Output (Text-to-Speech) Works**
> * **Hybrid Architecture (Option A + B):** To speak assistant responses, the app implements a primary/fallback voice pipeline:
>   * **Primary (Option A - Web Speech API):** Uses browser-native `speechSynthesis` to speak text instantly, locally, and for free, saving server resources.
>   * **Fallback (Option B - Groq Orpheus API):** If browser-native synthesis fails, it queries the backend `/speak` endpoint which calls Groq's **Orpheus English TTS** (`canopylabs/orpheus-v1-english`) model to generate and stream back WAV audio bytes.
> * **Reasoning Filtering:** Before speaking, the text is cleaned using regular expressions to strip out `<think>` reasoning tags, ensuring the user only hears the actual final answer.

---

## 🛠️ Project Directory Structure

| File / Folder | Type | Purpose |
| :--- | :--- | :--- |
| **`app.py`** | Python Server | Main backend (FastAPI, API routing, fallback logic, session memory) |
| **`static/script.js`** | JavaScript | Client-side engine (State management, base64 reader, stream decoder) |
| **`static/style.css`** | CSS Stylesheet | UI design (Flexbox layout, bubble alignment, styled thinking blocks) |
| **`templates/index.html`** | HTML Template | UI structure (Sidebar list, chat window, file attachment triggers) |
| **`requirements.txt`** | Text File | List of Python dependencies (FastAPI, Groq, dotenv) |
| **`.env`** | Config File | Private key storage (Contains `GROQ_API_KEY`, ignored by Git) |
| **`.gitignore`** | Config File | Directs Git to ignore virtual environments and `.env` files |

---

## 🔄 Request Workflow Diagram

```text
  [ Frontend User Interface ] 
        │
        │ 1. User types query (and optionally attaches an image)
        ▼
  [ static/script.js ]  ──(Converts image to Base64 text)
        │
        │ 2. Sends POST request to /ask with session_id
        ▼
  [ app.py (FastAPI Endpoint: /ask) ]
        │
        │ 3. Retrieves message history for session_id from memory
        ▼
  [ Smart Routing Queue ]
        ├── If Image -> Try [Llama 4 Scout] ──(Fallback)──> [Qwen 3.6]
        └── If Text  -> Try [Llama 3.3 70B] ──(Fallback)──> [GPT OSS 120B]
        │
        │ 4. Calls Groq API with stream=True
        ▼
  [ Groq Cloud Service ]
        │
        │ 5. Yields tokens (word chunks) in real-time
        ▼
  [ app.py (StreamingResponse) ]
        │
        │ 6. Streams chunks back to client
        ▼
  [ static/script.js (Stream Reader) ]
        │
        │ 7. Decodes tokens, parses <think> tags, and draws bubbles in UI
        ▼
  [ User views response ]
```

---

## 💻 Code Walkthrough: Key Files & Functions

### 1. The Backend (`app.py`)
* **`ChatRequest` (Pydantic Model):** Defines the data shape expected from the client (e.g., `session_id`, `prompt`, `image_base64`, `max_tokens`).
* **`app.mount("/static", ...)`**: Tells FastAPI to serve files inside the `/static` folder (like CSS and JS) directly to the browser.
* **`@app.post("/ask")`**: The primary endpoint. It checks if there is an image, loads the session's conversation history, determines the model list, and yields a `StreamingResponse` using an asynchronous generator.
* **`@app.post("/transcribe")`**: Receives browser-recorded audio file bytes (`.webm` or `.wav`) and forwards them to Groq's high-speed Whisper Large v3 Turbo model, returning the transcribed text.
* **`@app.get("/speak")`**: Receives text and uses Groq's `canopylabs/orpheus-v1-english` (voice: `dan`) to synthesize WAV audio bytes as an API fallback.

### 2. The HTML Structure (`templates/index.html`)
* **Sidebar Panel:** Holds the button `+ New Chat` and a container `<div id="sessionsList">` where JavaScript inserts active session items dynamically.
* **Chat Panel:** Houses `<div class="chat-box" id="chatBox">` to display message bubbles, and `<div class="input-area">` containing:
  * A hidden `<input type="file">` triggered visually by clicking the picture icon (`🖼️`).
  * A microphone button (`🎤`) that toggles audio recording.
  * A text input box.
  * An "Ask" button.

### 3. The Styling (`static/style.css`)
* Uses **CSS Flexbox** (`display: flex`) to stretch the sidebar to the left and push the chat area to fill the remaining screen space.
* Styles message bubbles using class tags `.user` (blue, right-aligned) and `.bot` (white, left-aligned).
* **`.thinking-block`:** Styles the reasoning thoughts from fallback reasoning models, formatting them with a light-gray background, a green left border (`border-left: 3px solid #10a37f`), and a monospace font.
* **`.mic-btn.recording`:** Defines a glowing pulse animation (`@keyframes mic-pulse`) that blinks red when recording is in progress.
* **`.speak-btn`:** Inline speaker icon style that appears next to model badges and grows slightly on hover.

### 4. The Client Logic (`static/script.js`)
* **`createNewSession()`**: Generates a timestamp-based ID and registers a new chat session.
* **`handleImageSelect()`**: Uses `FileReader()` to read an uploaded file and convert it into a Base64 string for transmission.
* **`askQuestion()`**: Uses the JavaScript `fetch` API to POST data, and starts a `while (true)` loop using `reader.read()`. It decodes the text chunks and renders them immediately inside the chat window.
* **`formatText()`**: A simple markdown parser that converts newlines `\n` to `<br>` and extracts `<think>...</think>` tags, wrapping them inside the styled `.thinking-block` class.
* **`toggleRecording()`**: Uses browser `MediaRecorder` to capture audio inputs from the microphone, packaging the recorded stream chunks and uploading them to the `/transcribe` endpoint.
* **`speakMessage()`**: Reads out the AI responses. Uses client-side Web Speech API (`speechSynthesis`) as a primary route, and falls back to fetching audio streams from the `/speak` endpoint if SpeechSynthesis is unsupported or errors. Strip `<think>` tags so thinking steps are not read aloud.

---

## 🚀 Setup & Installation Guide

### 1. Clone & Set Up Directory
Open your terminal and navigate to the project directory:
```bash
cd "G:\Nobeth Analytics\Projects\fastapi_app\ai_chat_fastapi_app_with_yml\ai_chat_fastapi_app"
```

### 2. Activate the Virtual Environment
We use a standard Python Virtual Environment (`venv`) to keep our project dependencies isolated.
```powershell
# On Windows (PowerShell):
& ..\chat_app\Scripts\Activate.ps1

# On macOS/Linux:
source ../chat_app/bin/activate
```

### 3. Install Requirements
Install the required packages listed in `requirements.txt`:
```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Create a file named `.env` in the root of the project (if it doesn't already exist) and insert your Groq API key:
```env
GROQ_API_KEY=your_actual_groq_api_key_here
```
*(Get a free key from the [Groq Console](https://console.groq.com)).*

### 5. Run the Server
Run the local development server:
```bash
uvicorn app:app --reload
```
Open your web browser and go to: **`http://127.0.0.1:8000`**

---

## ☁️ Production Deployment on Render

This application is fully optimized to run on the **Render Free Tier** (consuming less than 100MB of RAM).

### Deployment Settings:
1. **Service Type:** Web Service
2. **Runtime:** Python
3. **Build Command:** `pip install -r requirements.txt`
4. **Start Command:** `uvicorn app:app --host 0.0.0.0 --port $PORT`
5. **Environment Variables:** Under settings, click "Add Environment Variable", and add:
   * **Key:** `GROQ_API_KEY`
   * **Value:** *(your actual Groq API key)*

---

## 📖 Glossary of Terms & Tech Stack

### 1. AI Terminology Glossary
| Term | Simple Definition | Role in Project |
| :--- | :--- | :--- |
| **LLM** | Large Language Model; AI trained on huge text datasets to write human-like text. | Generates answers to questions. |
| **Inference** | The phase where the AI model runs and computes a response. | Executed by Groq Cloud APIs. |
| **Token** | The basic unit of text (usually a word or word fragment). | The streaming chunks returned by the API. |
| **System Prompt** | Directives setting the behavior, tone, and rules for the model. | Sets response conciseness in `app.py`. |
| **Base64 Encoding** | Represents binary files (images) as plain text strings. | Encodes uploads for standard JSON API transfers. |
| **Multimodal** | AI capable of processing both text and image inputs. | Powered by Llama 4 Scout and Qwen 3.6. |
| **Fallback** | Auto-retry logic using backup models if the primary model fails. | Handled by a model-loop in the backend. |
| **Memory Capping** | Limit conversation history length to avoid slowdowns. | Capped at the last 20 messages in server RAM. |

### 2. Tech Stack Glossary
| Tech Component | What it is | Purpose in Nobeth Chat Demo |
| :--- | :--- | :--- |
| **FastAPI** | Modern, high-performance web framework. | Exposes API routes (`/`, `/ask`, `/clear`). |
| **Uvicorn** | High-performance ASGI web server. | Hosts and serves the application. |
| **Pydantic** | Python data validation library. | Sanitizes JSON structure properties on `/ask`. |
| **Jinja2** | HTML templating engine. | Dynamically links template layouts. |
| **python-dotenv** | Reads key-value pairs from `.env` files. | Safely stores local secrets like `GROQ_API_KEY`. |
| **Groq Python SDK** | official programming connector for Groq. | Handles stream requests to Groq APIs. |
| **Fetch API** | Asynchronous browser network helper. | Queries endpoints without page reloads. |
| **Async Generators** | Functions producing outputs over time using `yield`. | Feeds real-time streaming tokens. |
