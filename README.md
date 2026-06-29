# AI Chat FastAPI App (Groq Cloud Version)

A production-ready, lightweight ChatGPT-style web interface built with FastAPI and powered by **Groq Cloud API** (`llama-3.1-8b-instant`). 

This version uses serverless inference, reducing the server's memory footprint to <100MB RAM, making it fast and deployable on the **Render Free Tier**.

---

## Architecture Overview
* **Backend:** FastAPI (Python 3.10+) serving routes and handling API requests.
* **Frontend:** Vanilla HTML5, CSS3, and JavaScript with active chat logs and a history sidebar.
* **AI Engine:** Groq SDK utilizing `llama-3.1-8b-instant` for sub-second, highly coherent responses.
* **Configuration:** Environment variables managed via `python-dotenv`.

---

## Local Installation Guide

### 1. Clone the repository
```bash
git clone <your-repository-url>
cd ai_chat_fastapi_app
```

### 2. Create and Activate Virtual Environment
```bash
# Create venv
python -m venv venv

# Activate on Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# Activate on macOS/Linux
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Create a `.env` file in the root of the project:
```env
GROQ_API_KEY=your_groq_api_key_here
```
*(Note: Get your free API key from [console.groq.com](https://console.groq.com)).*

### 5. Run the Application
```bash
uvicorn app:app --reload
```
Open your browser and navigate to `http://127.0.0.1:8000`.

---

## Render Deployment Settings

To deploy this web service on Render:

1. **Service Type:** Web Service
2. **Environment:** Python
3. **Build Command:** `pip install -r requirements.txt`
4. **Start Command:** `uvicorn app:app --host 0.0.0.0 --port $PORT`
5. **Environment Variables:**
   * Add key `GROQ_API_KEY` with your actual Groq API key value.
