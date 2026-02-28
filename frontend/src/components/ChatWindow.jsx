import { useState, useRef, useEffect } from "react";
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
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
import { useGetChatHistory, useSendMessage, useClearHistory } from "../hooks/useSendMessage";

export default function ChatWindow({ project, onBack }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  const { data: history = [], isLoading } = useGetChatHistory(project?.id);
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const { mutate: clearHistory, isPending: isClearing } = useClearHistory();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    const message = input.trim();
    setInput("");
    sendMessage({ project_id: project.id, message });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box display="flex" flexDirection="column" height="100%">
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
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </Stack>
        )}
        <div ref={bottomRef} />
      </Box>

      {/* Input */}
      <Divider />
      <Box p={2} display="flex" gap={1} alignItems="flex-end">
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
        <IconButton
          onClick={handleSend}
          disabled={!input.trim() || isSending}
          color="primary"
          sx={{ mb: 0.5 }}
        >
          {isSending ? <CircularProgress size={20} /> : <SendIcon />}
        </IconButton>
      </Box>
    </Box>
  );
}

function MessageBubble({ message }) {
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
      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 1,
          maxWidth: "75%",
          bgcolor: isUser ? "primary.main" : "grey.100",
          color: isUser ? "primary.contrastText" : "text.primary",
          borderRadius: isUser
            ? "16px 16px 4px 16px"
            : "16px 16px 16px 4px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <Typography variant="body2">{message.content}</Typography>
      </Paper>
      {isUser && (
        <Avatar sx={{ bgcolor: "secondary.main", width: 32, height: 32 }}>
          <PersonIcon fontSize="small" />
        </Avatar>
      )}
    </Box>
  );
}
