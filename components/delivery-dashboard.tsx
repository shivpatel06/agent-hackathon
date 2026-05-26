"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";

type HydratedOrder = {
  order_id: string;
  item: string;
  item_value: number;
  delivery_window: string;
  days_since_last_scan: number;
  tracking_checks_today: number;
  is_overdue: boolean;
  days_overdue: number;
  customer: { name: string; phone: string; ltv: number };
  carrier: { name: string; on_time_rate: number };
  weather: { forecast: string; severity: string };
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  reasons: string[];
  triggers_call: boolean;
};

const RUN_PROMPT =
  "Find every flagged Wayfair order, assess each, open the right resolution, and log every outreach. Then give me a one-paragraph summary.";

function levelColor(level: HydratedOrder["risk_level"]) {
  switch (level) {
    case "critical":
      return "bg-red-500";
    case "high":
      return "bg-orange-500";
    case "medium":
      return "bg-yellow-500";
    default:
      return "bg-zinc-500";
  }
}

function OrderCard({ order }: { order: HydratedOrder }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-zinc-500">{order.order_id}</div>
          <div className="mt-0.5 text-base font-semibold text-white">
            {order.customer.name}
          </div>
          <div className="text-sm text-zinc-400">
            {order.item} · ${order.item_value.toLocaleString()}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${levelColor(order.risk_level)}`}
            />
            <span className="text-xl font-semibold text-white tabular-nums">
              {order.risk_score}
            </span>
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
            {order.risk_level}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-400">
        <div>
          <div className="text-zinc-500">Carrier</div>
          <div className="text-zinc-200">
            {order.carrier.name} ({Math.round(order.carrier.on_time_rate * 100)}%)
          </div>
        </div>
        <div>
          <div className="text-zinc-500">Window</div>
          <div className="text-zinc-200">{order.delivery_window}</div>
        </div>
        <div>
          <div className="text-zinc-500">Last scan</div>
          <div className="text-zinc-200">
            {order.days_since_last_scan}d ago
            {order.is_overdue ? ` · ${order.days_overdue}d overdue` : ""}
          </div>
        </div>
        <div>
          <div className="text-zinc-500">LTV / Weather</div>
          <div className="text-zinc-200">
            ${order.customer.ltv.toLocaleString()} · {order.weather.severity}
          </div>
        </div>
      </div>

      {order.reasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-zinc-400">
          {order.reasons.slice(0, 3).map((r) => (
            <li key={r}>· {r}</li>
          ))}
        </ul>
      )}

      {order.triggers_call && (
        <div className="mt-3 inline-flex items-center rounded-full border border-[#FF5C28]/40 bg-[rgb(255_92_40/0.12)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#FF5C28]">
          Triggers outreach
        </div>
      )}
    </div>
  );
}

function MessagePart({
  part,
}: {
  part: UIMessage["parts"][number];
}) {
  if (part.type === "text") {
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">
        {part.text}
      </p>
    );
  }
  if (part.type.startsWith("tool-")) {
    const label = part.type.replace("tool-", "");
    const state = "state" in part ? part.state : "unknown";
    const input = "input" in part ? part.input : undefined;
    return (
      <div className="mt-2 rounded-lg border border-[#FF5C28]/30 bg-[rgb(255_92_40/0.10)] px-3 py-2 text-xs">
        <div className="font-medium text-[#FF5C28]">{label}</div>
        <div className="mt-0.5 text-zinc-400">
          {state === "input-available" && "calling…"}
          {state === "output-available" && "done"}
          {state === "output-error" && "error"}
        </div>
        {input && Object.keys(input).length > 0 && (
          <pre className="mt-1 overflow-x-auto text-[11px] text-zinc-400">
            {JSON.stringify(input, null, 0)}
          </pre>
        )}
      </div>
    );
  }
  return null;
}

export function DeliveryDashboard() {
  const [orders, setOrders] = useState<HydratedOrder[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((d) => setOrders(d.orders))
      .catch((e) => setOrdersError(String(e)));
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { mode: "agent" },
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const isBusy = status === "streaming" || status === "submitted";

  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  function runMonitoring() {
    if (isBusy) return;
    sendMessage({ parts: [{ type: "text", text: RUN_PROMPT }] });
  }

  const flaggedCount = orders?.filter((o) => o.triggers_call).length ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[#FF5C28]">
              Wayfair · Proactive Delivery
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
              Monitoring Dashboard
            </h1>
          </div>
          <div className="text-right text-sm">
            <div className="text-zinc-400">
              <span className="text-white">{orders?.length ?? "—"}</span>{" "}
              monitored ·{" "}
              <span className="text-[#FF5C28]">{flaggedCount}</span> flagged
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-2">
        <section className="flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-400">
              Monitored Orders
            </h2>
            <button
              type="button"
              onClick={() =>
                fetch("/api/orders")
                  .then((r) => r.json())
                  .then((d) => setOrders(d.orders))
              }
              className="text-xs text-zinc-500 hover:text-[#FF5C28]"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-3">
            {ordersError && (
              <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-400">
                {ordersError}
              </div>
            )}
            {!orders && !ordersError && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-500">
                Loading orders…
              </div>
            )}
            {orders?.map((o) => <OrderCard key={o.order_id} order={o} />)}
          </div>
        </section>

        <section className="flex min-h-[480px] flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-400">
              Agent
            </h2>
            {isBusy ? (
              <button
                type="button"
                onClick={() => stop()}
                className="rounded-full border border-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300 hover:border-[#FF5C28]"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={runMonitoring}
                className="rounded-full bg-[#FF5C28] px-3 py-1 text-xs font-medium text-black hover:bg-[#ff7347]"
              >
                Run monitoring
              </button>
            )}
          </div>

          <div
            ref={streamRef}
            className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
          >
            {messages.length === 0 && (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center text-zinc-500">
                <p className="text-base text-zinc-300">
                  Press <span className="text-[#FF5C28]">Run monitoring</span>
                </p>
                <p className="mt-2 max-w-sm text-xs text-zinc-500">
                  The agent will scan flagged orders, assess each, open the right
                  resolution per scenario, and log every outreach.
                </p>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl px-3 py-2 ${
                  m.role === "user"
                    ? "border border-zinc-800 bg-zinc-900"
                    : "border border-zinc-800 bg-black"
                }`}
              >
                <div
                  className={`mb-1 text-[10px] font-medium uppercase tracking-wider ${
                    m.role === "user" ? "text-zinc-500" : "text-[#FF5C28]"
                  }`}
                >
                  {m.role === "user" ? "Operator" : "Agent"}
                </div>
                {m.parts.map((p, i) => (
                  <MessagePart key={`${m.id}-${i}`} part={p} />
                ))}
              </div>
            ))}

            {isBusy && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#FF5C28]" />
                agent running…
              </div>
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-400">
              {error.message}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
