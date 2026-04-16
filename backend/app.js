(function() {
    "use strict";

    const POLL_DRAFT_KEY = "pollDraftQuestion";
    const FOLLOW_UP_SUGGESTIONS = [
        "Explain the architecture in detail",
        "What is EOS and what does it do?",
        "How many AI agents are there and what do they handle?",
        "What are the business outcomes?",
        "How does SAP integration work?"
    ];

    let conversationId = sessionStorage.getItem("conversationId");
    if (!conversationId) {
        conversationId = createConversationId();
        sessionStorage.setItem("conversationId", conversationId);
    }

    let isResponding = false;
    let lastUserQuestion = "";
    let latestBotMessage = null;
    let hasShownBackendOfflineToast = false;

    function createConversationId() {
        return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    function normalizeMessage(text) {
        return (text || "").replace(/\r\n/g, "\n").trim();
    }

    function formatMessage(text) {
        const normalized = normalizeMessage(text);
        if (!normalized) {
            return "";
        }

        const lines = normalized.split("\n");
        const blocks = [];
        let paragraph = [];
        let bullets = [];

        function flushParagraph() {
            if (!paragraph.length) {
                return;
            }
            blocks.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
            paragraph = [];
        }

        function flushBullets() {
            if (!bullets.length) {
                return;
            }
            const items = bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
            blocks.push(`<ul>${items}</ul>`);
            bullets = [];
        }

        lines.forEach((line) => {
            const trimmed = line.trim();

            if (!trimmed) {
                flushParagraph();
                flushBullets();
                return;
            }

            if (/^[-*]\s+/.test(trimmed)) {
                flushParagraph();
                bullets.push(trimmed.replace(/^[-*]\s+/, ""));
                return;
            }

            if (/^\d+\.\s+/.test(trimmed)) {
                flushParagraph();
                bullets.push(trimmed.replace(/^\d+\.\s+/, ""));
                return;
            }

            flushBullets();
            paragraph.push(trimmed);
        });

        flushParagraph();
        flushBullets();

        return blocks.join("");
    }

    function getCurrentTime() {
        return new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function showToast(message, duration = 2200, toastId = "appToast") {
        const toast = document.getElementById(toastId);
        if (!toast) {
            return;
        }

        toast.textContent = message;
        toast.classList.add("show");

        window.clearTimeout(showToast.timeoutId);
        showToast.timeoutId = window.setTimeout(() => {
            toast.classList.remove("show");
        }, duration);
    }

    function setBackendStatus(connected, baseUrl = "") {
        const label = connected ? "Backend online" : "Backend offline";

        document.querySelectorAll("[data-backend-status]").forEach((element) => {
            element.dataset.status = connected ? "online" : "offline";
            element.textContent = label;
            element.title = connected && baseUrl
                ? `Connected to ${baseUrl}`
                : "Start the Flask backend on http://127.0.0.1:5000 or open the UI from the backend server.";
        });
    }

    async function getApiBaseUrl() {
        if (!window.AppApi || typeof window.AppApi.resolveBaseUrl !== "function") {
            return "";
        }

        const baseUrl = await window.AppApi.resolveBaseUrl();
        setBackendStatus(Boolean(baseUrl), baseUrl);
        return baseUrl;
    }

    function initBackendStatus() {
        if (!window.AppApi) {
            setBackendStatus(false);
            return;
        }

        window.AppApi.subscribeStatus(({ connected, baseUrl }) => {
            setBackendStatus(connected, baseUrl);

            if (!connected && !hasShownBackendOfflineToast) {
                hasShownBackendOfflineToast = true;
                showToast("Backend offline. Start Flask on http://127.0.0.1:5000 or open the app through the backend server.", 4200);
            }
        });

        getApiBaseUrl().catch(() => {
            setBackendStatus(false);
        });
    }

    function scrollToBottom(container) {
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    function setRespondingState(active) {
        isResponding = active;

        const input = document.getElementById("messageInput");
        const sendButton = document.getElementById("sendBtn");

        if (input) {
            input.disabled = active;
        }

        if (sendButton) {
            sendButton.disabled = active;
            sendButton.textContent = active ? "Thinking..." : "Send";
        }
    }

    function toggleEmptyState() {
        const chat = document.getElementById("chatMessages");
        const emptyState = document.getElementById("chatEmptyState");
        if (!chat || !emptyState) {
            return;
        }

        emptyState.style.display = chat.children.length ? "none" : "grid";
    }

    function hideFollowUps() {
        document.querySelectorAll(".message-followups").forEach((element) => element.remove());
    }

    function showFollowUps() {
        if (!latestBotMessage) {
            return;
        }

        const existing = latestBotMessage.querySelector(".message-followups");
        if (existing) {
            existing.remove();
        }

        const wrap = document.createElement("div");
        wrap.className = "message-followups";

        FOLLOW_UP_SUGGESTIONS.forEach((prompt) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "message-followup-chip";
            chip.textContent = prompt;
            chip.addEventListener("click", () => {
                handleSendMessage(prompt);
            });
            wrap.appendChild(chip);
        });

        latestBotMessage.appendChild(wrap);
    }

    function createMessageMeta(type) {
        const meta = document.createElement("div");
        meta.className = "message-meta";
        meta.textContent = type === "user" ? `You - ${getCurrentTime()}` : `Assistant - ${getCurrentTime()}`;
        return meta;
    }

    function raiseQuestionToPoll(questionText) {
        const normalized = (questionText || "").trim();
        if (!normalized) {
            showToast("Ask or type a question first.");
            return false;
        }

        sessionStorage.setItem(POLL_DRAFT_KEY, normalized);
        return true;
    }

    function createRaisePollCta(questionText) {
        const cta = document.createElement("div");
        cta.className = "message-poll-cta";

        const label = document.createElement("span");
        label.textContent = "Want to raise this question in poll?";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary-btn message-poll-btn";
        button.textContent = "Raise To Poll";
        button.addEventListener("click", () => {
            button.disabled = true;
            button.textContent = "Opening...";

            try {
                const queued = raiseQuestionToPoll(questionText);
                if (!queued) {
                    return;
                }
                window.location.href = "poll.html";
            } finally {
                button.disabled = false;
                button.textContent = "Raise To Poll";
            }
        });

        cta.appendChild(label);
        cta.appendChild(button);
        return cta;
    }

    function addMessageToChat(container, text, type) {
        if (!container) {
            return null;
        }

        const message = document.createElement("article");
        message.className = `message ${type}`;

        const bubble = document.createElement("div");
        bubble.className = "message-bubble";
        bubble.innerHTML = formatMessage(text);

        message.appendChild(bubble);
        message.appendChild(createMessageMeta(type));

        if (type === "bot" && lastUserQuestion) {
            message.appendChild(createRaisePollCta(lastUserQuestion));
            latestBotMessage = message;
        }

        container.appendChild(message);

        toggleEmptyState();
        scrollToBottom(container);
        return bubble;
    }

    function showTyping(container) {
        if (!container) {
            return;
        }

        const message = document.createElement("article");
        message.className = "message bot";
        message.id = "typingIndicator";
        message.innerHTML = `
            <div class="message-bubble">
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
            <div class="message-meta">Assistant is responding...</div>
        `;

        container.appendChild(message);
        toggleEmptyState();
        scrollToBottom(container);
    }

    function removeTyping() {
        const typing = document.getElementById("typingIndicator");
        if (typing) {
            typing.remove();
        }
        toggleEmptyState();
    }

    async function streamRagResponse(question, onUpdate) {
        try {
            const apiBaseUrl = await getApiBaseUrl();
            if (!apiBaseUrl) {
                throw new Error("Backend unavailable.");
            }

            const response = await fetch(`${apiBaseUrl}/chat/stream`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: question,
                    conversation_id: conversationId
                })
            });

            if (!response.ok || !response.body) {
                throw new Error("Unable to stream a response.");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    break;
                }

                fullText += decoder.decode(value, { stream: true });
                onUpdate(fullText);
            }

            return fullText;
        } catch (error) {
            const fallback = "I couldn't connect to the chatbot service right now. Please try again in a few seconds.";
            onUpdate(fallback);
            return fallback;
        }
    }

    async function handleSendMessage(messageOverride) {
        const input = document.getElementById("messageInput");
        const chat = document.getElementById("chatMessages");
        if (!input || !chat || isResponding) {
            return;
        }

        const message = (messageOverride ?? input.value).trim();
        if (!message) {
            showToast("Type a question first.");
            return;
        }

        lastUserQuestion = message;
        hideFollowUps();
        addMessageToChat(chat, message, "user");
        input.value = "";

        setRespondingState(true);
        showTyping(chat);
        const botBubble = addMessageToChat(chat, "", "bot");

        await streamRagResponse(message, (partialAnswer) => {
            removeTyping();
            if (botBubble) {
                botBubble.innerHTML = formatMessage(partialAnswer);
                scrollToBottom(chat);
            }
        });

        removeTyping();
        setRespondingState(false);
        showFollowUps();
        input.focus();
    }

    function launchChat(promptText) {
        const prompt = (promptText || "").trim();
        if (!prompt) {
            showToast("Add a question to continue.");
            return;
        }

        sessionStorage.setItem("initialMessage", prompt);
        window.location.href = "chat.html";
    }

    function initLandingPage() {
        const launchForm = document.getElementById("launchForm");
        const launchInput = document.getElementById("launchInput");

        if (launchForm && launchInput) {
            launchForm.addEventListener("submit", (event) => {
                event.preventDefault();
                launchChat(launchInput.value);
            });

            launchInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    launchChat(launchInput.value);
                }
            });
        }

        document.querySelectorAll(".js-launch-prompt").forEach((button) => {
            button.addEventListener("click", () => {
                const prompt = button.dataset.prompt || button.textContent;
                launchChat(prompt);
            });
        });
    }

    function initChatPage() {
        const input = document.getElementById("messageInput");
        const sendButton = document.getElementById("sendBtn");
        const newChatButton = document.getElementById("newChatBtn");
        const chat = document.getElementById("chatMessages");
        const initialMessage = sessionStorage.getItem("initialMessage");

        if (sendButton) {
            sendButton.addEventListener("click", () => handleSendMessage());
        }

        if (input) {
            input.addEventListener("keydown", (event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSendMessage();
                }
            });
        }

        if (newChatButton) {
            newChatButton.addEventListener("click", () => {
                conversationId = createConversationId();
                sessionStorage.setItem("conversationId", conversationId);
                sessionStorage.removeItem("initialMessage");
                lastUserQuestion = "";
                latestBotMessage = null;
                if (chat) {
                    chat.innerHTML = "";
                }
                hideFollowUps();
                toggleEmptyState();
                if (input) {
                    input.value = "";
                    input.focus();
                }
                showToast("Started a new chat.");
            });
        }

        document.querySelectorAll(".js-chat-prompt").forEach((button) => {
            button.addEventListener("click", () => {
                const prompt = button.dataset.reply || button.textContent;
                if (input) {
                    input.value = prompt;
                }
                handleSendMessage(prompt);
            });
        });

        toggleEmptyState();

        if (initialMessage) {
            sessionStorage.removeItem("initialMessage");
            handleSendMessage(initialMessage);
        }
    }

    function init() {
        initBackendStatus();

        if (document.getElementById("launchForm")) {
            initLandingPage();
        }

        if (document.getElementById("chatMessages")) {
            initChatPage();
        }
    }

    init();
})();
