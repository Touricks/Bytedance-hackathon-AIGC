import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Avatar, Box, Chip, Fab, IconButton, InputBase, Paper, Typography } from "@mui/material";
import { Minus, Send, Sparkles } from "lucide-react";
import { classifyChip, resolveAssistantReply } from "./assistantReply.js";
import type { DashboardAssistantPreset } from "./dashboardTypes.js";

interface AssistantMessage {
  role: "ai" | "user";
  text: string;
  chips?: string[];
}

const HEAD_GRAD = "linear-gradient(110deg,#6A5CEB 0%,#8267F2 60%,#9B6FF0 100%)";
const AVA_GRAD = "linear-gradient(135deg,#7B6BF0,#5A4BDC)";

/** Render **bold** markdown spans and preserve blank lines, like the design `richLines`. */
function richLines(text: string) {
  return text.split("\n").map((line, lineIndex) => {
    const parts = line
      .split(/(\*\*[^*]+\*\*)/g)
      .filter(Boolean)
      .map((part, partIndex) =>
        part.startsWith("**") ? (
          <b key={partIndex}>{part.slice(2, -2)}</b>
        ) : (
          <Fragment key={partIndex}>{part}</Fragment>
        ),
      );
    return (
      <Box component="p" key={lineIndex} sx={{ m: 0, minHeight: line.trim() ? "auto" : "5px" }}>
        {parts}
      </Box>
    );
  });
}

/**
 * 创作助手 — a draggable MUI floating window (Paper + react-draggable) anchored at
 * the right 3/4 with a FAB launcher when minimized. Renders the panel directly on
 * the server and only engages dragging after mount (SSR / hydration safe).
 */
export function DashboardAssistant({
  presets,
  open,
  onOpenChange,
  onAction,
}: {
  presets: DashboardAssistantPreset[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: string) => void;
}) {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: "ai",
      text: "我是你的创作诊断助手。我会结合「推销手法 × 量化渠道」的发布数据，告诉你这条视频该换什么手法、去哪个渠道。试试下面的问题 👇",
      chips: presets.slice(0, 4).map((preset) => preset.question),
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [windowPosition, setWindowPosition] = useState<{ x: number; y: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, typing]);
  useEffect(() => {
    if (!open) setWindowPosition(null);
  }, [open]);

  function reply(question: string) {
    const answer = resolveAssistantReply(presets, question);
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { role: "ai", text: answer.text, chips: answer.chips }]);
    }, 650);
  }

  function send(question?: string) {
    const text = (question ?? input).trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    reply(text);
  }

  function handleChip(chip: string) {
    const action = classifyChip(chip);
    if (action === "send") {
      send(chip);
      return;
    }
    onAction(action);
  }

  function handleDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".dash-no-drag")) return;
    const node = nodeRef.current;
    if (!node || typeof window === "undefined") return;
    const rect = node.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = rect.left;
    const originY = rect.top;
    const maxX = Math.max(8, window.innerWidth - rect.width - 8);
    const maxY = Math.max(8, window.innerHeight - rect.height - 8);
    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));

    event.preventDefault();
    setWindowPosition({ x: originX, y: originY });

    const move = (moveEvent: PointerEvent) => {
      setWindowPosition({
        x: clamp(originX + moveEvent.clientX - startX, 8, maxX),
        y: clamp(originY + moveEvent.clientY - startY, 8, maxY),
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  if (!open) {
    return (
      <Fab
        variant="extended"
        onClick={() => onOpenChange(true)}
        sx={{
          position: "fixed",
          top: 128,
          right: 24,
          zIndex: 80,
          textTransform: "none",
          fontWeight: 600,
          gap: 1,
          color: "#fff",
          background: "linear-gradient(110deg,#6A5CEB,#8E6BF1)",
          boxShadow: "0 10px 28px rgba(90,75,220,.4)",
          "&:hover": {
            filter: "brightness(1.06)",
            background: "linear-gradient(110deg,#6A5CEB,#8E6BF1)",
          },
        }}
      >
        <Sparkles size={17} />
        创作助手
      </Fab>
    );
  }

  const avatar = (
    <Avatar sx={{ width: 24, height: 24, background: AVA_GRAD, color: "#fff" }}>
      <Sparkles size={13} />
    </Avatar>
  );

  const panel = (
    <Paper
      elevation={10}
      sx={{
        width: "100%",
        height: "min(556px, calc(100vh - 152px))",
        borderRadius: "16px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid #E4DEFA",
      }}
    >
      <Box
        className="dash-assistant-drag"
        onPointerDown={handleDragStart}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          px: 1.75,
          py: 1.5,
          background: HEAD_GRAD,
          color: "#fff",
          cursor: "grab",
          userSelect: "none",
          "&:active": { cursor: "grabbing" },
        }}
      >
        <Avatar sx={{ width: 28, height: 28, bgcolor: "rgba(255,255,255,.18)", color: "#fff" }}>
          <Sparkles size={15} />
        </Avatar>
        <Box sx={{ lineHeight: 1.25, display: "flex", alignItems: "center", gap: 0.75 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>创作助手</Typography>
          <Box
            component="span"
            sx={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.3px",
              px: 0.75,
              py: "1px",
              borderRadius: 999,
              bgcolor: "rgba(255,255,255,.2)",
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            演示功能
          </Box>
        </Box>
        <IconButton
          className="dash-no-drag"
          size="small"
          onClick={() => onOpenChange(false)}
          onPointerDown={(event) => event.stopPropagation()}
          title="收起"
          sx={{
            ml: "auto",
            color: "#fff",
            bgcolor: "rgba(255,255,255,.18)",
            width: 28,
            height: 28,
            borderRadius: "8px",
            "&:hover": { bgcolor: "rgba(255,255,255,.3)" },
          }}
        >
          <Minus size={16} />
        </IconButton>
      </Box>

      <Box
        ref={bodyRef}
        className="dash-no-drag"
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          p: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
          bgcolor: "#fff",
        }}
      >
        {messages.map((message, index) => (
          <Box
            key={index}
            sx={{
              display: "flex",
              gap: 1,
              flexDirection: message.role === "user" ? "row-reverse" : "row",
            }}
          >
            {message.role === "ai" ? avatar : null}
            <Box sx={{ maxWidth: "85%" }}>
              <Box
                sx={{
                  fontSize: 12.5,
                  lineHeight: 1.62,
                  borderRadius: "11px",
                  p: "9px 11px",
                  ...(message.role === "user"
                    ? { bgcolor: "#6457E8", color: "#fff", borderTopRightRadius: "4px" }
                    : { bgcolor: "#F5F6FA", color: "#1E2230", borderTopLeftRadius: "4px" }),
                  "& b": { color: message.role === "user" ? "#fff" : "#564AD6", fontWeight: 700 },
                }}
              >
                {richLines(message.text)}
              </Box>
              {message.chips && message.chips.length > 0 ? (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1 }}>
                  {message.chips.map((chip, chipIndex) => (
                    <Chip
                      className="dash-no-drag"
                      key={chipIndex}
                      label={chip}
                      size="small"
                      variant="outlined"
                      onClick={() => handleChip(chip)}
                      sx={{
                        borderColor: "#DCD7F7",
                        color: "#6457E8",
                        fontWeight: 600,
                        fontSize: 11.5,
                        height: 26,
                        bgcolor: "#fff",
                        "&:hover": { bgcolor: "#F5F3FF", borderColor: "#6457E8" },
                      }}
                    />
                  ))}
                </Box>
              ) : null}
            </Box>
          </Box>
        ))}
        {typing ? (
          <Box sx={{ display: "flex", gap: 1 }}>
            {avatar}
            <Box
              sx={{
                bgcolor: "#F5F6FA",
                borderRadius: "11px",
                p: "11px 12px",
                display: "flex",
                gap: 0.5,
                "@keyframes dashmblink": { "0%,60%,100%": { opacity: 0.3 }, "30%": { opacity: 1 } },
              }}
            >
              {[0, 1, 2].map((dot) => (
                <Box
                  key={dot}
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "#B7BCC9",
                    animation: "dashmblink 1.2s infinite",
                    animationDelay: `${dot * 0.2}s`,
                  }}
                />
              ))}
            </Box>
          </Box>
        ) : null}
      </Box>

      <Box
        className="dash-no-drag"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.25,
          py: 1,
          borderTop: "1px solid #F0F1F5",
        }}
      >
        <InputBase
          className="dash-no-drag"
          value={input}
          placeholder="问问这条视频该怎么改…"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") send();
          }}
          sx={{ flex: 1, fontSize: 13, "& input::placeholder": { color: "#B7BCC9", opacity: 1 } }}
        />
        <IconButton
          className="dash-no-drag"
          onClick={() => send()}
          disabled={!input.trim()}
          sx={{
            bgcolor: "#6457E8",
            color: "#fff",
            width: 34,
            height: 34,
            "&:hover": { bgcolor: "#564AD6" },
            "&.Mui-disabled": { bgcolor: "#D8DBE6", color: "#fff" },
          }}
        >
          <Send size={16} />
        </IconButton>
      </Box>
    </Paper>
  );

  const assistantWindow = (
    <div
      ref={nodeRef}
      style={{
        position: "fixed",
        zIndex: 80,
        width: 340,
        maxWidth: "calc(100vw - 32px)",
        ...(windowPosition
          ? { top: windowPosition.y, left: windowPosition.x }
          : { top: 128, right: 24 }),
      }}
    >
      {panel}
    </div>
  );

  return assistantWindow;
}
