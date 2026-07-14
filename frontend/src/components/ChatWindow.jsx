import { useState, useRef, useEffect } from "react";
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  Paper,
  Slider,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import PersonIcon from "@mui/icons-material/Person";
import BugReportIcon from "@mui/icons-material/BugReport";
import YardIcon from "@mui/icons-material/Yard";
import SourceIcon from "@mui/icons-material/FindInPage";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useGetChatHistory,
  useSendMessage,
  useClearHistory,
  useRagDebug,
} from "../hooks/useSendMessage";

function getErrorMessage(error) {
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail;
  if (status === 429)
    return (
      detail ??
      "Límite de peticiones a Gemini alcanzado. Espera un momento y vuelve a intentarlo."
    );
  if (status === 502)
    return detail ?? "Error al conectar con la API de Gemini.";
  return detail ?? error?.message ?? "Ha ocurrido un error inesperado.";
}

export default function ChatWindow({ project, onBack }) {
  const [input, setInput] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [ragData, setRagData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [minScore, setMinScore] = useState(0.7);
  const [sourcesMap, setSourcesMap] = useState({});
  const bottomRef = useRef(null);

  const { data: history = [], isLoading } = useGetChatHistory(project?.id);
  const { mutate: sendMessage, isPending: isSending } = useSendMessage({
    onError: (err) => setErrorMsg(getErrorMessage(err)),
    onSuccess: (data) => {
      if (data.sources?.length && data.message?.id) {
        setSourcesMap((prev) => ({
          ...prev,
          [data.message.id]: data.sources,
        }));
      }
    },
  });
  const { mutate: clearHistory, isPending: isClearing } = useClearHistory();
  const { mutate: fetchRagDebug, isPending: isDebugging } = useRagDebug({
    onSuccess: (data) => setRagData(data),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    const message = input.trim();
    setInput("");
    sendMessage({ project_id: project.id, message, min_score: minScore });
  };

  const handleTestRagOnly = () => {
    if (!input.trim() || isDebugging) return;
    fetchRagDebug({ projectId: project.id, query: input.trim(), minScore });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleDebug = () => {
    setDebugMode((v) => !v);
    if (debugMode) setRagData(null);
  };

  return (
    <Box display="flex" height="100%" overflow="hidden">
      {/* ── Main chat column ── */}
      <Box display="flex" flexDirection="column" flexGrow={1} minWidth={0}>
        {/* Header */}
        <Box
          display="flex"
          alignItems="center"
          gap={1}
          p={2}
          borderBottom="1px solid"
          borderColor="divider"
        >
          <IconButton onClick={onBack} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" fontWeight={700} flexGrow={1}>
            {project.name}
          </Typography>
          <Tooltip
            title={debugMode ? "Hide RAG debug panel" : "Show RAG debug panel"}
          >
            <IconButton
              onClick={toggleDebug}
              size="small"
              color={debugMode ? "warning" : "default"}
            >
              <BugReportIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Clear history">
            <IconButton
              onClick={() => clearHistory(project.id)}
              disabled={isClearing || history.length === 0}
              color="error"
              size="small"
            >
              <DeleteSweepIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Messages */}
        <Box flexGrow={1} overflow="auto" p={2}>
          {isLoading ? (
            <Box display="flex" justifyContent="center" mt={4}>
              <CircularProgress />
            </Box>
          ) : history.length === 0 ? (
            <Typography color="text.secondary" textAlign="center" mt={4}>
              No messages yet. Say hello!
            </Typography>
          ) : (
            <Stack spacing={2}>
              {history.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  sources={sourcesMap[msg.id]}
                />
              ))}
            </Stack>
          )}
          <div ref={bottomRef} />
        </Box>

        {/* Input */}
        <Divider />
        <Box p={2}>
          {/* Relevance threshold slider */}
          <Box display="flex" alignItems="center" gap={2} mb={1}>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
              Umbral relevancia
            </Typography>
            <Slider
              value={minScore}
              onChange={(_, v) => setMinScore(v)}
              min={0}
              max={1}
              step={0.05}
              size="small"
              valueLabelDisplay="auto"
              sx={{ flexGrow: 1, maxWidth: 200 }}
            />
            <Typography variant="caption" fontWeight={700} sx={{ minWidth: 32, textAlign: "right" }}>
              {minScore.toFixed(2)}
            </Typography>
          </Box>
          <Box display="flex" gap={1} alignItems="flex-end">
            <TextField
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
              multiline
              maxRows={4}
              fullWidth
              size="small"
              disabled={isSending}
            />
            {debugMode && (
              <Tooltip title="Test RAG sin llamar a Gemini">
                <span>
                  <IconButton
                    onClick={handleTestRagOnly}
                    disabled={!input.trim() || isDebugging}
                    color="warning"
                    sx={{ mb: 0.5 }}
                  >
                    {isDebugging ? (
                      <CircularProgress size={20} color="warning" />
                    ) : (
                      <BugReportIcon />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            )}
            <Tooltip title="Enviar a Gemini">
              <span>
                <IconButton
                  onClick={handleSend}
                  disabled={!input.trim() || isSending}
                  color="primary"
                  sx={{ mb: 0.5 }}
                >
                  {isSending ? <CircularProgress size={20} /> : <SendIcon />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* ── RAG debug panel ── */}
      {debugMode && (
        <Box
          sx={{
            width: 380,
            flexShrink: 0,
            borderLeft: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            bgcolor: "grey.50",
          }}
        >
          {/* Panel header */}
          <Box px={2} py={1.5} borderBottom="1px solid" borderColor="divider">
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <BugReportIcon fontSize="small" color="warning" />
              <Typography variant="subtitle2" fontWeight={700}>
                RAG Debug
              </Typography>
              {isDebugging && (
                <CircularProgress size={14} sx={{ ml: "auto" }} />
              )}
            </Box>
            {/* Standalone RAG query — does NOT call Gemini */}
            <RagQueryInput projectId={project.id} onResult={setRagData} minScore={minScore} />
          </Box>

          <Box flexGrow={1} overflow="auto" p={1.5}>
            {!ragData && !isDebugging && (
              <Typography variant="caption" color="text.secondary">
                Send a message to see which chunks are retrieved.
              </Typography>
            )}
            {ragData && <RagDebugPanel data={ragData} />}
          </Box>
        </Box>
      )}

      <Snackbar
        open={!!errorMsg}
        autoHideDuration={6000}
        onClose={() => setErrorMsg("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="error"
          onClose={() => setErrorMsg("")}
          sx={{ width: "100%" }}
        >
          {errorMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function RagQueryInput({ projectId, onResult, minScore }) {
  const [query, setQuery] = useState("");
  const { mutate: fetchRag, isPending } = useRagDebug({
    onSuccess: onResult,
  });

  const handleTest = () => {
    if (!query.trim() || isPending) return;
    fetchRag({ projectId, query: query.trim(), minScore });
  };

  return (
    <Box display="flex" gap={0.5} alignItems="center">
      <TextField
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleTest();
          }
        }}
        placeholder="Probar query sin Gemini…"
        size="small"
        fullWidth
        sx={{ "& .MuiInputBase-input": { fontSize: 12 } }}
      />
      <Tooltip title="Lanzar consulta RAG">
        <span>
          <IconButton
            onClick={handleTest}
            disabled={!query.trim() || isPending}
            size="small"
            color="warning"
          >
            {isPending ? (
              <CircularProgress size={16} color="warning" />
            ) : (
              <YardIcon fontSize="small" />
            )}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}

function RagDebugPanel({ data }) {
  return (
    <Stack spacing={1.5}>
      {/* Query */}
      <Box
        sx={{
          bgcolor: "warning.50",
          border: "1px solid",
          borderColor: "warning.200",
          borderRadius: 1,
          px: 1.5,
          py: 1,
        }}
      >
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          QUERY
        </Typography>
        <Typography variant="body2" sx={{ wordBreak: "break-word", mt: 0.25 }}>
          {data.query}
        </Typography>
      </Box>

      {/* Summary row */}
      <Box display="flex" flexWrap="wrap" gap={0.5} alignItems="center">
        <Chip
          label={`${data.total_chunks_retrieved} chunks`}
          size="small"
          color="primary"
          variant="outlined"
        />
        <Chip
          label={`min score ${data.min_score_threshold}`}
          size="small"
          variant="outlined"
        />
      </Box>

      {/* SQLite direct lookup */}
      <Box
        sx={{
          bgcolor: data.csv_row_match ? "success.50" : "grey.100",
          border: "1px solid",
          borderColor: data.csv_row_match ? "success.300" : "grey.300",
          borderRadius: 1,
          px: 1.5,
          py: 1,
        }}
      >
        <Typography
          variant="caption"
          fontWeight={600}
          color={data.csv_row_match ? "success.800" : "text.secondary"}
        >
          SQLite MATCH
        </Typography>
        {data.csv_row_match ? (
          <Typography
            variant="caption"
            sx={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              display: "block",
              mt: 0.5,
            }}
          >
            {data.csv_row_match}
          </Typography>
        ) : (
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mt: 0.25 }}
          >
            No direct row match found
          </Typography>
        )}
      </Box>

      {data.total_chunks_retrieved === 0 && (
        <Typography variant="body2" color="text.secondary">
          No chunks exceeded the minimum score threshold.
        </Typography>
      )}

      {data.chunks.map((chunk, i) => (
        <RagChunkCard key={i} chunk={chunk} rank={i + 1} />
      ))}
    </Stack>
  );
}

function RagChunkCard({ chunk, rank }) {
  const [expanded, setExpanded] = useState(false);
  const scoreColor =
    chunk.score >= 0.6 ? "success" : chunk.score >= 0.4 ? "warning" : "default";

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        fontSize: 12,
        cursor: "pointer",
        "&:hover": { bgcolor: "grey.100" },
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      <Box display="flex" alignItems="center" gap={0.75} mb={0.5}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ minWidth: 18 }}
        >
          #{rank}
        </Typography>
        <Chip
          label={chunk.score.toFixed(3)}
          size="small"
          color={scoreColor}
          sx={{ height: 18, fontSize: 11 }}
        />
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flexGrow: 1,
          }}
        >
          {chunk.filename}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          chunk#{chunk.chunk_index}
        </Typography>
      </Box>
      <Collapse in={expanded} collapsedSize={40}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            display: "block",
          }}
        >
          {chunk.content}
        </Typography>
        {chunk.full_row && (
          <Box
            sx={{
              mt: 1,
              pt: 1,
              borderTop: "1px dashed",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="caption"
              fontWeight={600}
              color="success.700"
              display="block"
              mb={0.25}
            >
              Full SQLite row:
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                display: "block",
              }}
            >
              {chunk.full_row}
            </Typography>
          </Box>
        )}
      </Collapse>
      {!expanded && (
        <Typography
          variant="caption"
          color="primary"
          sx={{ display: "block", mt: 0.25 }}
        >
          click to expand
        </Typography>
      )}
    </Paper>
  );
}

function MessageBubble({ message, sources }) {
  const isUser = message.role === "user";
  return (
    <Box
      display="flex"
      justifyContent={isUser ? "flex-end" : "flex-start"}
      gap={1}
    >
      {!isUser && (
        <Avatar sx={{ bgcolor: "primary.main", width: 32, height: 32 }}>
          <SmartToyIcon fontSize="small" />
        </Avatar>
      )}
      <Box sx={{ maxWidth: "75%" }}>
        <Paper
          elevation={0}
          sx={{
            px: 2,
            py: 1,
            bgcolor: isUser ? "primary.main" : "grey.100",
            color: isUser ? "primary.contrastText" : "text.primary",
            borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
            wordBreak: "break-word",
            "& p": { margin: 0 },
            "& p + p": { mt: 1 },
            "& ul, & ol": { pl: 2.5, my: 0.5 },
            "& li": { mb: 0.25 },
            "& h1, & h2, & h3, & h4": { mt: 1, mb: 0.5, fontWeight: 700 },
            "& code": {
              fontFamily: "monospace",
              fontSize: "0.82em",
              bgcolor: isUser ? "rgba(255,255,255,0.2)" : "grey.200",
              px: 0.5,
              borderRadius: 0.5,
            },
            "& pre": {
              bgcolor: isUser ? "rgba(0,0,0,0.25)" : "grey.200",
              p: 1.5,
              borderRadius: 1,
              overflowX: "auto",
              my: 0.75,
              "& code": { bgcolor: "transparent", p: 0 },
            },
            "& table": { borderCollapse: "collapse", width: "100%", my: 0.75 },
            "& th, & td": {
              border: "1px solid",
              borderColor: "divider",
              px: 1,
              py: 0.5,
              fontSize: "0.82em",
            },
            "& th": { fontWeight: 700 },
            "& blockquote": {
              borderLeft: "3px solid",
              borderColor: "divider",
              pl: 1.5,
              ml: 0,
              my: 0.5,
              color: "text.secondary",
            },
            "& hr": { my: 1, borderColor: "divider" },
            "& a": { color: isUser ? "inherit" : "primary.main" },
          }}
        >
          {isUser ? (
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              {message.content}
            </Typography>
          ) : (
            <Typography variant="body2" component="div">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </Typography>
          )}
        </Paper>
        {/* Source references */}
        {!isUser && sources?.length > 0 && (
          <SourcesPanel sources={sources} />
        )}
      </Box>
      {isUser && (
        <Avatar sx={{ bgcolor: "secondary.main", width: 32, height: 32 }}>
          <PersonIcon fontSize="small" />
        </Avatar>
      )}
    </Box>
  );
}

function SourcesPanel({ sources }) {
  const [expanded, setExpanded] = useState(false);

  // Deduplicate by document_id + row_key (or chunk_index)
  const uniqueSources = sources.reduce((acc, src) => {
    const key = src.row_key
      ? `${src.document_id}-${src.row_key}`
      : `${src.document_id}-chunk${src.chunk_index}`;
    if (!acc.find((s) => (s.row_key ? `${s.document_id}-${s.row_key}` : `${s.document_id}-chunk${s.chunk_index}`) === key)) {
      acc.push(src);
    }
    return acc;
  }, []);

  return (
    <Box mt={0.5}>
      <Box
        display="flex"
        alignItems="center"
        gap={0.5}
        sx={{ cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <SourceIcon sx={{ fontSize: 14, color: "text.secondary" }} />
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {uniqueSources.length} fuente{uniqueSources.length !== 1 ? "s" : ""} referenciada{uniqueSources.length !== 1 ? "s" : ""}
        </Typography>
      </Box>
      <Collapse in={expanded}>
        <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
          {uniqueSources.map((src, i) => (
            <Chip
              key={i}
              size="small"
              variant="outlined"
              color="info"
              label={
                src.row_key
                  ? `${src.filename} → ${src.row_key} (${(src.score * 100).toFixed(0)}%)`
                  : `${src.filename} #${src.chunk_index} (${(src.score * 100).toFixed(0)}%)`
              }
              sx={{ fontSize: 11, height: 22 }}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
