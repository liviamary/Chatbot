(function() {
    "use strict";

    const API_BASE_URL = window.location.origin;
    const POLL_REFRESH_MS = 8000;
    const POLL_USER_KEY = "pollUserId";
    const POLL_DRAFT_KEY = "pollDraftQuestion";

    const pollUserId = getPollUserId();
    let currentPoll = null;
    let isSubmitting = false;
    let refreshTimer = null;
    const activeVoteIds = new Set();

    function getPollUserId() {
        let userId = localStorage.getItem(POLL_USER_KEY);
        if (!userId) {
            userId = `poll-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            localStorage.setItem(POLL_USER_KEY, userId);
        }
        return userId;
    }

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    function showToast(message, duration = 2200) {
        const toast = document.getElementById("pollToast");
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

    function formatRelativeTime(secondsSinceEpoch) {
        const created = new Date(secondsSinceEpoch * 1000);
        const diffMs = Date.now() - created.getTime();
        const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

        if (diffMinutes < 60) {
            return `${diffMinutes} min ago`;
        }

        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) {
            return `${diffHours} hr ago`;
        }

        const diffDays = Math.round(diffHours / 24);
        return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    }

    function unwrapPollPayload(payload) {
        return payload && payload.poll ? payload.poll : payload;
    }

    async function fetchPollState() {
        const response = await fetch(`${API_BASE_URL}/poll/questions?user_id=${encodeURIComponent(pollUserId)}`);
        if (!response.ok) {
            throw new Error("Unable to load poll questions.");
        }

        currentPoll = unwrapPollPayload(await response.json());
        renderPoll();
    }

    async function submitQuestion(event) {
        event.preventDefault();

        if (isSubmitting) {
            return;
        }

        const nameInput = document.getElementById("pollNameInput");
        const questionInput = document.getElementById("pollQuestionInput");
        const submitButton = document.getElementById("pollSubmitBtn");
        const text = questionInput ? questionInput.value.trim() : "";
        const author = nameInput ? nameInput.value.trim() : "";

        if (!text) {
            showToast("Add a question first.");
            return;
        }

        isSubmitting = true;
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Submitting...";
        }

        try {
            const response = await fetch(`${API_BASE_URL}/poll/questions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text,
                    author,
                    user_id: pollUserId
                })
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => ({}));
                throw new Error(errorPayload.error || "Unable to submit the question.");
            }

            const payload = await response.json();
            currentPoll = unwrapPollPayload(payload);
            if (questionInput) {
                questionInput.value = "";
            }
            updateCharCount();
            renderPoll();

            if (payload.action === "merged_vote") {
                showToast("That question is already on the board, so your vote was added.");
            } else if (payload.action === "duplicate") {
                showToast("That question is already on the board.");
            } else {
                showToast("Question submitted to the live board.");
            }
        } catch (error) {
            showToast(error.message || "Something went wrong.");
        } finally {
            isSubmitting = false;
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Submit";
            }
        }
    }

    async function toggleVote(questionId) {
        if (activeVoteIds.has(questionId)) {
            return;
        }

        activeVoteIds.add(questionId);

        try {
            const response = await fetch(`${API_BASE_URL}/poll/questions/${encodeURIComponent(questionId)}/vote`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    user_id: pollUserId
                })
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => ({}));
                throw new Error(errorPayload.error || "Unable to register the vote.");
            }

            currentPoll = unwrapPollPayload(await response.json());
            renderPoll();
        } catch (error) {
            showToast(error.message || "Unable to update the vote.");
        } finally {
            activeVoteIds.delete(questionId);
        }
    }

    function updateCharCount() {
        const questionInput = document.getElementById("pollQuestionInput");
        const charCount = document.getElementById("pollCharCount");
        if (!questionInput || !charCount) {
            return;
        }

        charCount.textContent = `${questionInput.value.length} / 280`;
    }

    function applyQueuedPollDraft() {
        const questionInput = document.getElementById("pollQuestionInput");
        const draft = sessionStorage.getItem(POLL_DRAFT_KEY);
        if (!questionInput || !draft) {
            return;
        }

        questionInput.value = draft;
        sessionStorage.removeItem(POLL_DRAFT_KEY);
        updateCharCount();
        questionInput.focus();
        questionInput.setSelectionRange(questionInput.value.length, questionInput.value.length);
        showToast("Question added to the poll form. Click Submit when you're ready.");
    }

    function createQuestionCard(question, options = {}) {
        const { rank = null, top = false } = options;
        const card = document.createElement("article");
        card.className = `question-card${top ? " top-question" : ""}`;

        const author = question.author || "Anonymous";
        const rankMarkup = rank ? `<span class="question-rank">#${rank}</span>` : "";
        const buttonLabel = question.has_voted ? "Voted" : "Vote";

        card.innerHTML = `
            <div class="question-head">
                <div class="question-meta">
                    <span class="question-author">${escapeHtml(author)}</span>
                    <span class="question-time">${formatRelativeTime(question.created_at)}</span>
                </div>
                ${rankMarkup}
            </div>
            <p class="question-text">${escapeHtml(question.text)}</p>
            <div class="question-actions">
                <div class="question-votes">${question.vote_count} vote${question.vote_count === 1 ? "" : "s"}</div>
                <button class="vote-btn${question.has_voted ? " voted" : ""}" type="button">${buttonLabel}</button>
            </div>
        `;

        const button = card.querySelector(".vote-btn");
        if (button) {
            button.addEventListener("click", () => toggleVote(question.id));
        }

        return card;
    }

    function renderStats(stats) {
        document.getElementById("pollStatQuestions").textContent = stats.question_count ?? 0;
        document.getElementById("pollStatVotes").textContent = stats.vote_count ?? 0;
        document.getElementById("pollStatPeople").textContent = stats.participant_count ?? 0;
    }

    function renderTopQuestions(questions) {
        const topList = document.getElementById("pollTopList");
        if (!topList) {
            return;
        }

        topList.innerHTML = "";

        if (!questions.length) {
            topList.innerHTML = `<div class="empty-state">Top-voted questions will appear here as the audience starts voting.</div>`;
            return;
        }

        questions.slice(0, 5).forEach((question, index) => {
            topList.appendChild(createQuestionCard(question, { rank: index + 1, top: true }));
        });
    }

    function renderAllQuestions(questions) {
        const questionList = document.getElementById("pollQuestionsList");
        const meta = document.getElementById("pollQuestionMeta");
        if (!questionList || !meta) {
            return;
        }

        questionList.innerHTML = "";
        meta.textContent = `${questions.length} question${questions.length === 1 ? "" : "s"} in the room`;

        if (!questions.length) {
            questionList.innerHTML = `<div class="empty-state">No audience questions yet. Submit the first one to start the board.</div>`;
            return;
        }

        questions.forEach((question) => {
            questionList.appendChild(createQuestionCard(question));
        });
    }

    function renderPoll() {
        if (!currentPoll) {
            return;
        }

        renderStats(currentPoll.stats || {});
        renderTopQuestions(currentPoll.questions || []);
        renderAllQuestions(currentPoll.questions || []);
    }

    function startAutoRefresh() {
        refreshTimer = window.setInterval(() => {
            fetchPollState().catch(() => {});
        }, POLL_REFRESH_MS);
    }

    function init() {
        const pollForm = document.getElementById("pollForm");
        const questionInput = document.getElementById("pollQuestionInput");

        if (pollForm) {
            pollForm.addEventListener("submit", submitQuestion);
        }

        if (questionInput) {
            questionInput.addEventListener("input", updateCharCount);
        }

        updateCharCount();
        applyQueuedPollDraft();
        fetchPollState().catch(() => {
            showToast("Unable to load the live poll board.");
        });
        startAutoRefresh();
    }

    window.addEventListener("beforeunload", () => {
        if (refreshTimer) {
            window.clearInterval(refreshTimer);
        }
    });

    init();
})();
