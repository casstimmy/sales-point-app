import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCommentDots, faPaperPlane, faTimes } from "@fortawesome/free-solid-svg-icons";

const BOT_NAME = "POS Help";

const QUICK_PROMPTS = [
  "How do I sync pending transactions?",
  "How do I refund and print a receipt?",
  "Login keeps failing. What should I check?",
  "How do I change system scale/zoom?",
];

const firstMessage = {
  role: "bot",
  text: "I can help with login, till operations, refunds, printing, and syncing offline transactions.",
};

const getBotReply = (question) => {
  const q = String(question || "").toLowerCase();

  if (q.includes("sync") || q.includes("offline") || q.includes("pending transaction")) {
    return {
      text: "Use `Sync Transactions` in the sidebar when online. If a sale happened offline, it queues automatically and syncs once connection is restored.",
    };
  }

  if (q.includes("refund") || q.includes("print")) {
    return {
      text: "Open `ORDERS > COMPLETE`, select the transaction, then use `Refund` or `Print` in the actions panel.",
    };
  }

  if (q.includes("login") || q.includes("passcode") || q.includes("pin")) {
    return {
      text: "Check staff, location, and a 4-digit passcode. If online login fails, cached offline login can still work when data was synced before.",
    };
  }

  if (q.includes("scale") || q.includes("zoom")) {
    return {
      text: "Go to `Settings > System Scale`. Use the slider or +/- buttons, then save. The whole POS UI updates like browser zoom.",
    };
  }

  if (q.includes("till")) {
    return {
      text: "Open Till before taking payments. Close Till from Sidebar `Admin > Close Till` after reconciling tender counts.",
    };
  }

  return {
    text: "Ask me about login, till close, refunds, printing, sync, or settings. I can guide you step-by-step.",
  };
};

export default function HelpChatBot() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([firstMessage]);

  const openWithTopic = useCallback((topic) => {
    setIsOpen(true);
    if (!topic) return;
    const topicPrompt = `Help: ${topic}`;
    setMessages((prev) => {
      if (prev.some((m) => m.text === topicPrompt)) return prev;
      return [...prev, { role: "user", text: topicPrompt }, { role: "bot", text: getBotReply(topicPrompt).text }];
    });
  }, []);

  useEffect(() => {
    const onHelpOpen = (event) => {
      openWithTopic(event?.detail?.topic || "");
    };
    window.addEventListener("help:open", onHelpOpen);
    return () => window.removeEventListener("help:open", onHelpOpen);
  }, [openWithTopic]);

  const sendMessage = useCallback((rawText) => {
    const text = String(rawText || "").trim();
    if (!text) return;
    const reply = getBotReply(text);
    setMessages((prev) => [...prev, { role: "user", text }, { role: "bot", text: reply.text }]);
    setInput("");
  }, []);

  const promptButtons = useMemo(() => QUICK_PROMPTS, []);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[80] w-[92vw] max-w-sm rounded-xl border border-cyan-200 bg-white shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-cyan-700 text-white">
        <div className="flex items-center gap-2 text-sm font-bold">
          <FontAwesomeIcon icon={faCommentDots} className="w-4 h-4" />
          {BOT_NAME}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="text-[11px] bg-cyan-600 hover:bg-cyan-500 px-2 py-1 rounded"
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-7 h-7 rounded hover:bg-white/20"
            aria-label="Close help"
          >
            <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto p-3 space-y-2 bg-slate-50">
        {messages.map((msg, index) => (
          <div
            key={`${msg.role}-${index}`}
            className={`text-sm rounded-lg px-3 py-2 ${
              msg.role === "user"
                ? "bg-cyan-600 text-white ml-6"
                : "bg-white border border-slate-200 text-slate-700 mr-6"
            }`}
          >
            {msg.text}
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 p-2 bg-white">
        <div className="flex flex-wrap gap-1 mb-2">
          {promptButtons.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => sendMessage(prompt)}
              className="text-[11px] px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200"
            >
              {prompt}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage(input);
            }}
            placeholder="Ask for help..."
            className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200"
          />
          <button
            type="button"
            onClick={() => sendMessage(input)}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded"
            aria-label="Send help message"
          >
            <FontAwesomeIcon icon={faPaperPlane} className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
