# Backend chatbot setup

This backend reads all supported files from the `backend` folder (`.docx`, `.pdf`, `.txt`, `.md`), creates a local no-download retrieval index, retrieves relevant document chunks, and streams fast natural answers back to the chat UI.

## 1) Install Python dependencies

```bash
pip install -r requirements.txt
```

## 2) Optional: Run a local LLM with Ollama

The default mode is `GENERATION_BACKEND=fast-natural`, which gives quick consultant-style answers without waiting for a local LLM. If you want fully generative wording, install Ollama and pull a model:

```bash
ollama pull llama3.2:1b
```

The backend uses:
- `OLLAMA_URL` (default: `http://127.0.0.1:11434/api/chat`)
- `OLLAMA_MODEL` (default: `llama3.2:1b`)
- `GENERATION_BACKEND` (default: `fast-natural`; set to `ollama` for slower generative answers or `extractive` for raw document snippets)
- `STREAM_WORD_DELAY` (default: `0.018`, used to pace fast answers word by word)

If a detail is not found in the retrieved document context, the assistant responds politely and frames it as a possible future enhancement.

## 3) Start backend API

```bash
python app.py
```

Server URL: `http://127.0.0.1:5000`

Streaming chat endpoint: `http://127.0.0.1:5000/chat/stream`

## 4) Start your frontend

Open `index.html` from the project root in a browser.

## Notes

- Add more documents directly to this same `backend` folder; they will be loaded automatically at startup.
- The assistant keeps short chat history per conversation so follow-up questions work better.
- Retrieval works locally by default and does not need Hugging Face downloads. If you want to use sentence-transformers later, install it and start the backend with `EMBEDDING_BACKEND=sentence-transformers`.
