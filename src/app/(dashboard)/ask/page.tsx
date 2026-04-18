"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Send, User, Bot, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "How much did I spend on dining out this month?",
  "What subscriptions could I cut?",
  "Top merchants this year",
  "How does this month compare to last month?",
];

function renderMarkdown(text: string): string {
  // Super-light markdown: bold, inline code, line breaks. Escapes HTML first.
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-[0.85em]">$1</code>')
    .replace(/\n/g, "<br />");
}

export default function AskPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setPending(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        throw new Error(errData.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { reply: string };
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      setMessages((prev) => prev.slice(0, -1));
      setInput(trimmed);
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function reset() {
    setMessages([]);
    setInput("");
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" /> Ask
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Ask anything about your spending. I can query transactions, categories, and subscriptions live.
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={reset}>
            <RefreshCcw className="w-3.5 h-3.5 mr-1.5" /> New chat
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto -mx-2 px-2 pb-2 space-y-4">
        {messages.length === 0 && (
          <div className="grid sm:grid-cols-2 gap-2 pt-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-left text-sm border border-gray-200 rounded-xl px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <Card
              className={`${
                m.role === "user"
                  ? "bg-indigo-600 text-white border-0 ml-10"
                  : "bg-white"
              } max-w-[80%]`}
            >
              <CardContent className="px-4 py-2.5">
                <div
                  className="text-sm leading-relaxed prose-sm"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                />
              </CardContent>
            </Card>
            {m.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-gray-500" />
              </div>
            )}
          </div>
        ))}

        {pending && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <Card className="bg-white max-w-[80%]">
              <CardContent className="px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
                  <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse [animation-delay:0.2s]" />
                  <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse [animation-delay:0.4s]" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your spending…"
          className="min-h-[48px] max-h-32 resize-none"
          disabled={pending}
        />
        <Button type="submit" disabled={!input.trim() || pending}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
