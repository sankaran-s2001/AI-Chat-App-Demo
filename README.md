# Nobeth Chat Demo — Student Learning Guide & Web Application

Welcome to the **Nobeth Chat Demo**! This application was created by **Nobeth Analytics Institute** as a teaching demo to show students how modern, production-grade AI chatbots are built, styled, and connected. 

Instead of hiding the complexity behind pre-packaged libraries, this codebase uses standard Python (**FastAPI**), vanilla **HTML5 / CSS3**, and plain **JavaScript** so you can learn every mechanism line-by-line.

---

## 💡 Core AI Concepts Explained

To understand how this chatbot works, let's look at the underlying systems:

### 1. How AI Inference Works (API vs. Local)
* **What is Inference?** Inference is the process of feeding a prompt (your question) into a trained Artificial Intelligence model (a Neural Network) and having it compute and output a response.
* **Why use an API?** Running large AI models like *Llama 3.3 70B* locally requires massive graphics cards (GPUs) and gigabytes of RAM. Instead, we use the **Groq Cloud API**. The user inputs a message, our backend sends it to Groq's high-speed server farm, and Groq returns the result in milliseconds.

### 2. How Token Streaming Works
* **Traditional Method:** The server waits for the AI model to finish writing its entire response, and then sends it all at once. This makes the user wait seconds staring at a blank screen.
* **Streaming Method:** As soon as the AI generates a single word (a **token**), it is immediately pushed to the user. We use **Server-Sent Events (SSE)** via FastAPI's `StreamingResponse`. The frontend reads the stream chunk-by-chunk using a JavaScript `ReadableStream` reader, drawing words on the screen as they are generated.

### 3. How Conversation Memory works
* **API is Stateless:** The Groq API has no memory. If you ask "What is my name?" followed by "My name is John", the API will not know who you are in the next request unless we feed it the past messages.
* **History Mapping:** The backend keeps an in-memory dictionary mapping a unique `session_id` to a list of messages:
  ```python
  conversation_histories = {
      "session_12345": [
          {"role": "user", "content": "My name is John."},
          {"role": "assistant", "content": "Nice to meet you, John!"}
      ]
  }
  ```
* **Context Capping:** Large histories slow down the model and cost more. We cap the memory to the **last 20 messages** (`history[-20:]`) to keep the chatbot fast and efficient.

### 4. How Multi-Session works
* The sidebar allows students to open multiple distinct chat sessions. 
* The JavaScript file stores all active sessions in memory. When a session is selected, JavaScript clears the screen and redraws only the messages associated with that active `session_id`.
* Clicking the deletion (`×`) button alerts the backend to delete that session's memory dictionary on the server.

### 5. How Multimodal Vision Works
* **MIME/Base64 Conversion:** Web browsers cannot directly send image files inside plain JSON text. The frontend reads the image file using `FileReader` and encodes it into a **Base64 string** (a long text string representing binary image data).
* **Vision Payload:** The backend receives this string and wraps it in a standard message format:
  ```json
  {
    "type": "image_url",
    "image_url": {
      "url": "data:image/jpeg;base64,RAW_BASE64_STRING_HERE"
    }
  }
  ```

### 6. How Smart Routing & Fallbacks work
* Different AI models are optimized for different tasks. Our backend routes your prompt dynamically based on the inputs:
  1. **Text Queries:** Routed to `llama-3.3-70b-versatile` (Primary: Meta's latest, most accurate 70B model, featuring no annoying thinking blocks) and falls back to `openai/gpt-oss-120b` if busy.
  2. **Image Queries:** Routed to `meta-llama/llama-4-scout-17b-16e-instruct` (Primary Vision model) and falls back to `qwen/qwen3.6-27b`.
* If a model fails (e.g. rate limit exceeded), a `try-except` loop immediately catches the error and retries the request using the next fallback model in the list.

---

## 🛠️ Project Directory Structure

Here is how the project files are organized:

```text
ai_chat_fastapi_app/
│
├── .env                  # Private file containing API keys (Never push to GitHub!)
├── .gitignore            # Tells Git which files to ignore (like .env and python venv)
├── app.py                # Main backend server (FastAPI, API routing, fallbacks, memory)
├── requirements.txt      # List of Python libraries required for the project
├── README.md             # This educational documentation file
│
├── static/               # Frontend asset folder (served statically by FastAPI)
│   ├── script.js         # Frontend logic (State management, base64 reader, stream decoder)
│   └── style.css         # UI Styling (Flexbox container layout, hover animations, bubbles)
│
└── templates/            # HTML folder
    └── index.html        # Main page UI structure (Sidebar list, chat window, inputs)
```

---

## 🔄 Code Flow Diagram

Below is the visual workflow of how a request travels through the system:

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

## 💻 Code walkthrough: Key Files & Functions

### 1. The Backend (`app.py`)
* **`ChatRequest` (Pydantic Model):** Defines the data shape expected from the client (e.g. `session_id`, `prompt`, `image_base64`, `max_tokens`).
* **`app.mount("/static", ...)`**: Tells FastAPI to serve files inside the `/static` folder (like CSS and JS) directly to the browser.
* **`@app.post("/ask")`**: The primary endpoint. It checks if there is an image, loads the session's conversation history, determines the model list, and yields a `StreamingResponse` using an asynchronous generator.

### 2. The HTML Structure (`templates/index.html`)
* **Sidebar Panel:** Holds the button `+ New Chat` and a container `<div id="sessionsList">` where JavaScript inserts active session items dynamically.
* **Chat Panel:** Houses `<div class="chat-box" id="chatBox">` to display message bubbles, and `<div class="input-area">` containing:
  * A hidden `<input type="file">` triggered visually by clicking the picture icon (`🖼️`).
  * A text input box.
  * An "Ask" button.

### 3. The Styling (`static/style.css`)
* Uses **CSS Flexbox** (`display: flex`) to stretch the sidebar to the left and push the chat area to fill the remaining screen space.
* Styles message bubbles using class tags `.user` (blue, right-aligned) and `.bot` (white, left-aligned).
* **`.thinking-block`:** Styles the reasoning thoughts from fallback reasoning models, formatting them with a light-gray background, a green left border (`border-left: 3px solid #10a37f`), and a monospace font.

### 4. The Client Logic (`static/script.js`)
* **`createNewSession()`**: Generates a timestamp-based ID and registers a new chat session.
* **`handleImageSelect()`**: Uses `FileReader()` to read an uploaded file and convert it into a Base64 string for transmission.
* **`askQuestion()`**: Uses the JavaScript `fetch` API to POST data, and starts a `while (true)` loop using `reader.read()`. It decodes the text chunks and renders them immediately inside the chat window.
* **`formatText()`**: A simple markdown parser that converts newlines `\n` to `<br>` and extracts `<think>...</think>` tags, wrapping them inside the styled `.thinking-block` class.

---

## 🚀 Setup & Installation Guide

### 1. Clone & Set Up Directory
Open your terminal (PowerShell, Command Prompt, or terminal) and navigate to the project directory:
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

To help students learn the terminology, here is a glossary of the AI concepts and technology stack components used in this project:

### 1. AI Terminology
* **LLM (Large Language Model):** A type of AI trained on massive text datasets to understand and generate human-like language (e.g., Llama 3.3, Qwen 3.6).
* **Inference:** The phase where the AI model is actively running and generating an output (response) for a given input (prompt).
* **Token:** The basic unit of data processed by LLMs. A token can be a single character, a word, or part of a word. Roughly 100 tokens equals 75 words.
* **System Prompt:** A set of background instructions given to the AI model before the conversation starts to define its behavior, tone, and rules (e.g., telling the model to be concise).
* **Base64 Encoding:** A method used to convert binary data (like an image file) into a text string of ASCII characters, allowing it to be safely sent inside a JSON payload over HTTP.
* **Multimodal (Vision):** The ability of an AI model to process multiple types of inputs (such as both text questions and images).
* **Fallback / Failover:** A safety mechanism where the system automatically switches to an alternative model if the primary model fails or reaches its API rate limits.
* **Context Window / Memory Capping:** The maximum number of tokens a model can remember in a single session. Capping history prevents exceeding these limits and keeps requests fast.

### 2. Technology Stack & Purpose
* **FastAPI:** A modern, high-performance web framework for Python used to build our backend endpoints (`/`, `/ask`, `/clear`) with automatic data validation.
* **Uvicorn:** A lightning-fast ASGI (Asynchronous Server Gateway Interface) web server implementation used to run and serve our FastAPI application.
* **Pydantic:** A Python data validation library used by FastAPI to enforce data types (e.g., ensuring `session_id` and `prompt` are valid strings).
* **Jinja2:** A templating engine for Python used to load and render the HTML templates (like passing server variables to `index.html`).
* **python-dotenv:** A utility library that reads key-value pairs from a `.env` file and loads them into environment variables to securely store secrets like your `GROQ_API_KEY`.
* **Groq Python SDK:** The official programming toolkit provided by Groq to easily connect our Python backend to Groq's high-speed LPU (Language Processing Unit) cloud API.
* **JavaScript Fetch API:** The modern browser feature used to send asynchronous HTTP requests (like sending chat queries via POST) to the server without reloading the web page.
* **Async Generators (`async def` / `yield`):** Python functions that output values one by one over time, allowing the backend to stream tokens to the frontend as they are generated by the AI.

