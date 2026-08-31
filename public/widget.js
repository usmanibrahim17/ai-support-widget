(function () {
  "use strict";

  var CURRENT_SCRIPT =
    document.currentScript ||
    document.querySelector('script[src*="widget.js"]');
  var BUSINESS_ID = CURRENT_SCRIPT
    ? CURRENT_SCRIPT.getAttribute("data-business-id")
    : null;

  // The API and the widget are served from the same domain (single Vercel
  // project), so the API base URL is derived from wherever this script
  // itself was loaded from — not hardcoded. That makes the same widget.js
  // file correct in local dev, preview deployments, and production alike,
  // with nothing to remember to update after deploying.
  function getApiBaseUrl() {
    if (CURRENT_SCRIPT && CURRENT_SCRIPT.src) {
      try {
        return new URL(CURRENT_SCRIPT.src).origin;
      } catch (e) {
        // fall through to the fallback below
      }
    }
    // Last resort: only reached if the widget's own <script> tag couldn't
    // be located at all (e.g. injected without a src attribute). This is
    // NOT safe to rely on for real embeds, since it resolves to whatever
    // page happens to be hosting the widget, not our API's domain.
    console.warn(
      "[widget] Could not determine API base URL from the widget's own " +
        "script tag; falling back to the current page's origin, which is " +
        "likely wrong for a third-party embed."
    );
    return window.location.origin;
  }

  var API_BASE_URL = getApiBaseUrl();

  var EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        if (key === "style") {
          Object.assign(node.style, props[key]);
        } else if (key === "text") {
          node.textContent = props[key];
        } else {
          node.setAttribute(key, props[key]);
        }
      });
    }
    (children || []).forEach(function (child) {
      node.appendChild(child);
    });
    return node;
  }

  function init() {
    var host = document.createElement("div");
    host.id = "support-chat-widget-host";
    document.body.appendChild(host);

    // Shadow DOM keeps the host page's CSS out of the widget, and keeps
    // the widget's CSS from leaking into the host page.
    var shadow = host.attachShadow({ mode: "open" });

    var style = document.createElement("style");
    style.textContent = [
      ":host { all: initial; }",
      "* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }",
      ".scw-bubble {",
      "  position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px;",
      "  border-radius: 50%; background: #111827; color: #fff; border: none;",
      "  font-size: 26px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.25);",
      "  display: flex; align-items: center; justify-content: center; z-index: 2147483000;",
      "}",
      ".scw-bubble:hover { background: #1f2937; }",
      ".scw-panel {",
      "  position: fixed; bottom: 88px; right: 20px; width: 320px; max-width: calc(100vw - 40px);",
      "  height: 440px; max-height: calc(100vh - 120px); background: #fff; border-radius: 12px;",
      "  box-shadow: 0 8px 30px rgba(0,0,0,0.25); display: flex; flex-direction: column;",
      "  overflow: hidden; z-index: 2147483000;",
      "}",
      ".scw-header {",
      "  background: #111827; color: #fff; padding: 12px 16px; font-size: 15px; font-weight: 600;",
      "}",
      ".scw-messages {",
      "  flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px;",
      "  background: #f9fafb;",
      "}",
      ".scw-msg {",
      "  max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.4;",
      "  white-space: pre-wrap; word-wrap: break-word;",
      "}",
      ".scw-msg-user { align-self: flex-end; background: #111827; color: #fff; border-bottom-right-radius: 2px; }",
      ".scw-msg-bot { align-self: flex-start; background: #e5e7eb; color: #111827; border-bottom-left-radius: 2px; }",
      ".scw-msg-error { align-self: flex-start; background: #fee2e2; color: #991b1b; }",
      ".scw-typing { align-self: flex-start; font-size: 12px; color: #6b7280; padding: 4px 12px; }",
      ".scw-input-row {",
      "  display: flex; gap: 6px; padding: 10px; border-top: 1px solid #e5e7eb; background: #fff;",
      "}",
      ".scw-input {",
      "  flex: 1; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; outline: none;",
      "}",
      ".scw-input:focus { border-color: #111827; }",
      ".scw-send {",
      "  background: #111827; color: #fff; border: none; border-radius: 8px; padding: 0 14px;",
      "  font-size: 13px; cursor: pointer;",
      "}",
      ".scw-send:disabled { opacity: 0.5; cursor: not-allowed; }",
      ".scw-escalate {",
      "  align-self: flex-start; max-width: 90%; background: #fff; border: 1px solid #d1d5db;",
      "  border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 6px;",
      "}",
      ".scw-escalate-label { font-size: 12px; color: #374151; }",
      ".scw-escalate-row { display: flex; gap: 6px; }",
      ".scw-escalate-input {",
      "  flex: 1; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; outline: none;",
      "}",
      ".scw-escalate-submit {",
      "  background: #111827; color: #fff; border: none; border-radius: 6px; padding: 0 10px; font-size: 12px; cursor: pointer;",
      "}",
      ".scw-escalate-error { font-size: 11px; color: #991b1b; }",
      ".scw-escalate-success { font-size: 12px; color: #065f46; }",
      ".scw-hidden { display: none !important; }",
    ].join("\n");
    shadow.appendChild(style);

    var bubble = el("button", {
      class: "scw-bubble",
      type: "button",
      "aria-label": "Open chat",
      text: "💬",
    });

    var messagesEl = el("div", { class: "scw-messages" });

    var input = el("input", {
      class: "scw-input",
      type: "text",
      placeholder: "Type a message...",
    });
    var sendButton = el("button", {
      class: "scw-send",
      type: "button",
      text: "Send",
    });

    var panel = el("div", { class: "scw-panel scw-hidden" }, [
      el("div", { class: "scw-header", text: "Chat with us" }),
      messagesEl,
      el("div", { class: "scw-input-row" }, [input, sendButton]),
    ]);

    shadow.appendChild(panel);
    shadow.appendChild(bubble);

    var isOpen = false;
    function setOpen(open) {
      isOpen = open;
      panel.classList.toggle("scw-hidden", !open);
      if (open) {
        input.focus();
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

    bubble.addEventListener("click", function () {
      setOpen(!isOpen);
    });

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addMessage(text, kind) {
      var bubbleEl = el("div", {
        class: "scw-msg " + kind,
        text: text,
      });
      messagesEl.appendChild(bubbleEl);
      scrollToBottom();
      return bubbleEl;
    }

    function addEscalationForm(chatLogId) {
      var emailInput = el("input", {
        class: "scw-escalate-input",
        type: "email",
        placeholder: "you@example.com",
      });
      var submitButton = el("button", {
        class: "scw-escalate-submit",
        type: "button",
        text: "Send",
      });
      var errorEl = el("div", { class: "scw-escalate-error scw-hidden" });

      var container = el("div", { class: "scw-escalate" }, [
        el("div", {
          class: "scw-escalate-label",
          text: "Want a human to follow up? Leave your email:",
        }),
        el("div", { class: "scw-escalate-row" }, [emailInput, submitButton]),
        errorEl,
      ]);

      function showError(message) {
        errorEl.textContent = message;
        errorEl.classList.remove("scw-hidden");
      }

      submitButton.addEventListener("click", function () {
        var email = emailInput.value.trim();
        errorEl.classList.add("scw-hidden");

        if (!EMAIL_PATTERN.test(email)) {
          showError("Please enter a valid email address.");
          return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Sending...";

        fetch(API_BASE_URL + "/api/py/escalate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            business_id: BUSINESS_ID,
            chat_log_id: chatLogId,
            visitor_email: email,
          }),
        })
          .then(function (response) {
            return response.json().then(function (data) {
              if (!response.ok || data.status === "error") {
                throw new Error(data.message || "Failed to submit email");
              }
              return data;
            });
          })
          .then(function () {
            container.innerHTML = "";
            container.appendChild(
              el("div", {
                class: "scw-escalate-success",
                text: "Thanks! We'll be in touch by email shortly.",
              })
            );
            scrollToBottom();
          })
          .catch(function (error) {
            submitButton.disabled = false;
            submitButton.textContent = "Send";
            showError(error.message || "Something went wrong. Please try again.");
          });
      });

      messagesEl.appendChild(container);
      scrollToBottom();
    }

    // Conversation history for this page load only — not persisted across
    // refreshes.
    var conversationHistory = [];

    function sendMessage() {
      var question = input.value.trim();
      if (!question) {
        return;
      }

      addMessage(question, "scw-msg-user");
      input.value = "";
      input.disabled = true;
      sendButton.disabled = true;

      var typingEl = el("div", { class: "scw-typing", text: "Typing..." });
      messagesEl.appendChild(typingEl);
      scrollToBottom();

      var historyForRequest = conversationHistory.slice();

      fetch(API_BASE_URL + "/api/py/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question,
          business_id: BUSINESS_ID,
          history: historyForRequest,
        }),
      })
        .then(function (response) {
          return response.json().then(function (data) {
            if (!response.ok || data.status === "error") {
              throw new Error(data.message || "Something went wrong.");
            }
            return data;
          });
        })
        .then(function (data) {
          typingEl.remove();
          addMessage(data.answer, "scw-msg-bot");
          conversationHistory.push({ role: "user", content: question });
          conversationHistory.push({ role: "assistant", content: data.answer });
          if (data.escalate) {
            addEscalationForm(data.chat_log_id);
          }
        })
        .catch(function (error) {
          typingEl.remove();
          addMessage(
            error.message || "Something went wrong. Please try again.",
            "scw-msg-error"
          );
        })
        .finally(function () {
          input.disabled = false;
          sendButton.disabled = false;
          input.focus();
        });
    }

    sendButton.addEventListener("click", sendMessage);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        sendMessage();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
