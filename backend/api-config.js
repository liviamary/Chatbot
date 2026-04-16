(function() {
    "use strict";

    const STORAGE_KEY = "backendBaseUrl";
    const QUERY_PARAM_KEY = "backend";
    const DEFAULT_BACKEND_URLS = [
        "http://127.0.0.1:5000",
        "http://localhost:5000"
    ];

    const state = {
        baseUrl: "",
        health: null,
        hasResolved: false,
        resolvingPromise: null,
        listeners: new Set()
    };

    function normalizeBaseUrl(value) {
        const trimmed = String(value || "").trim();
        if (!trimmed) {
            return "";
        }

        try {
            const parsed = new URL(trimmed, window.location.href);
            if (!/^https?:$/i.test(parsed.protocol)) {
                return "";
            }
            return parsed.origin.replace(/\/+$/, "");
        } catch (_error) {
            return "";
        }
    }

    function getConfiguredCandidates() {
        const candidates = [];
        const searchParams = new URLSearchParams(window.location.search);
        const queryValue = normalizeBaseUrl(searchParams.get(QUERY_PARAM_KEY));

        if (queryValue) {
            try {
                window.localStorage.setItem(STORAGE_KEY, queryValue);
            } catch (_error) {
                // Ignore storage access issues and keep going.
            }
        }

        const storedValue = (() => {
            try {
                return normalizeBaseUrl(window.localStorage.getItem(STORAGE_KEY));
            } catch (_error) {
                return "";
            }
        })();

        const currentOrigin = /^https?:$/i.test(window.location.protocol)
            ? normalizeBaseUrl(window.location.origin)
            : "";

        [queryValue, storedValue, currentOrigin, ...DEFAULT_BACKEND_URLS].forEach((candidate) => {
            const normalized = normalizeBaseUrl(candidate);
            if (normalized && !candidates.includes(normalized)) {
                candidates.push(normalized);
            }
        });

        return candidates;
    }

    async function probeBackend(baseUrl) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 2500);

        try {
            const response = await fetch(`${baseUrl}/health`, {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                },
                signal: controller.signal
            });

            if (!response.ok) {
                return null;
            }

            const payload = await response.json().catch(() => null);
            if (!payload || payload.status !== "ok") {
                return null;
            }

            return {
                baseUrl,
                health: payload
            };
        } catch (_error) {
            return null;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    function emitStatus(connected) {
        const snapshot = {
            connected,
            baseUrl: state.baseUrl,
            health: state.health
        };

        state.listeners.forEach((listener) => {
            try {
                listener(snapshot);
            } catch (_error) {
                // Keep other listeners alive.
            }
        });
    }

    async function resolveBaseUrl(options = {}) {
        const { force = false } = options;

        if (!force && state.baseUrl) {
            return state.baseUrl;
        }

        if (!force && state.resolvingPromise) {
            return state.resolvingPromise;
        }

        state.resolvingPromise = (async () => {
            const candidates = getConfiguredCandidates();

            for (const candidate of candidates) {
                const match = await probeBackend(candidate);
                if (!match) {
                    continue;
                }

                state.baseUrl = match.baseUrl;
                state.health = match.health;
                state.hasResolved = true;

                try {
                    window.localStorage.setItem(STORAGE_KEY, state.baseUrl);
                } catch (_error) {
                    // Ignore storage access issues and keep going.
                }

                emitStatus(true);
                return state.baseUrl;
            }

            state.baseUrl = "";
            state.health = null;
            state.hasResolved = true;
            emitStatus(false);
            return "";
        })();

        try {
            return await state.resolvingPromise;
        } finally {
            state.resolvingPromise = null;
        }
    }

    function subscribeStatus(listener) {
        if (typeof listener !== "function") {
            return function noop() {};
        }

        state.listeners.add(listener);

        if (state.hasResolved) {
            listener({
                connected: Boolean(state.baseUrl),
                baseUrl: state.baseUrl,
                health: state.health
            });
        }

        return () => {
            state.listeners.delete(listener);
        };
    }

    window.AppApi = {
        resolveBaseUrl,
        subscribeStatus,
        getLastBaseUrl() {
            return state.baseUrl;
        },
        getLastHealth() {
            return state.health;
        }
    };
})();
