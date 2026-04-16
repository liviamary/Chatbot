# Backend chatbot setup

This backend reads all supported files from the `backend` folder (`.docx`, `.pdf`, `.txt`, `.md`), creates a local no-download retrieval index, retrieves relevant document chunks, and serves the chat UI with Groq-backed answers.

## 1) Install Python dependencies

```bash
pip install -r requirements.txt
```

## 2) Configure Groq

The default mode is now `GENERATION_BACKEND=groq`, which is the best fit for public deployment.

Create a Groq API key, then set:

```bash
set GROQ_API_KEY=your_groq_api_key
set GROQ_MODEL=llama-3.1-8b-instant
```

Optional variables:
- `GROQ_API_URL` default: `https://api.groq.com/openai/v1/chat/completions`
- `MAX_ANSWER_TOKENS` default: `1000`
- `STREAM_WORD_DELAY` default: `0.018`

If you want fallback modes, you can still use:
- `GENERATION_BACKEND=fast-natural`
- `GENERATION_BACKEND=extractive`
- `GENERATION_BACKEND=ollama`

## 3) Optional: Run a local LLM with Ollama

If you want fully local generation instead of Groq, install Ollama and pull a model:

```bash
ollama pull llama3.2:1b
```

The backend uses:
- `GROQ_API_KEY` for hosted generation with Groq
- `GROQ_MODEL` (default: `llama-3.1-8b-instant`)
- `OLLAMA_URL` (default: `http://127.0.0.1:11434/api/chat`)
- `OLLAMA_MODEL` (default: `llama3.2:1b`)
- `GENERATION_BACKEND` (default: `groq`; set to `ollama`, `fast-natural`, or `extractive` if needed)
- `STREAM_WORD_DELAY` (default: `0.018`, used to pace fast answers word by word)

If a detail is not found in the retrieved document context, the assistant responds politely and frames it as a possible future enhancement.

## 4) Start backend API

```bash
python app.py
```

Server URL: `http://127.0.0.1:5000`

Streaming chat endpoint: `http://127.0.0.1:5000/chat/stream`

Health check: `http://127.0.0.1:5000/health`

For production deployment, use:

```bash
gunicorn app:app
```

## 5) Start your frontend

Open `http://127.0.0.1:5000` in a browser.

## Notes

- Add more documents directly to this same `backend` folder; they will be loaded automatically at startup.
- The assistant keeps short chat history per conversation so follow-up questions work better.
- Retrieval works locally by default and does not need Hugging Face downloads. If you want to use sentence-transformers later, install it and start the backend with `EMBEDDING_BACKEND=sentence-transformers`.
- The frontend now uses same-origin API calls, which means one deployed Flask app can serve both the UI and API for phone users.
