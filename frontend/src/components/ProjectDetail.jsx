import { useState, useEffect, useRef, memo, useCallback } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChatIcon from "@mui/icons-material/Chat";
import SaveIcon from "@mui/icons-material/Save";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DeleteIcon from "@mui/icons-material/Delete";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import { useGetProject } from "../hooks/useGetProjects";
import { useUpdateProject } from "../hooks/useCreateProject";
import {
  useGetDocuments,
  useUploadDocument,
  useDeleteDocument,
} from "../hooks/useDocuments";
import { MODEL_LABELS } from "../constants";

// ---------------------------------------------------------------------------
// Memoised documents panel — never re-renders while the user is typing
// ---------------------------------------------------------------------------
const DocumentsPanel = memo(function DocumentsPanel({ projectId, onSnack }) {
  const { data: documents = [], isLoading: docsLoading } =
    useGetDocuments(projectId);
  const {
    mutate: uploadDoc,
    isPending: isUploading,
    error: uploadError,
  } = useUploadDocument(projectId);
  const { mutate: deleteDoc, isPending: isDeleting } =
    useDeleteDocument(projectId);

  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    files.forEach((file) =>
      uploadDoc(file, {
        onSuccess: () => onSnack(`"${file.name}" processed and indexed`),
      }),
    );
    e.target.value = "";
  };

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <Card variant="outlined">
      <CardContent>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="flex-start"
          mb={1}
        >
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              Knowledge Base (RAG)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Files are chunked and embedded automatically. The 6 most relevant
              chunks are retrieved and injected as context for every message you
              send.
            </Typography>
          </Box>
          <Button
            component="label"
            variant="outlined"
            size="small"
            startIcon={
              isUploading ? <CircularProgress size={16} /> : <UploadFileIcon />
            }
            disabled={isUploading}
            sx={{ ml: 2, whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {isUploading ? "Indexing…" : "Upload Files"}
            <input
              ref={fileInputRef}
              type="file"
              hidden
              multiple
              accept=".txt,.md,.csv,.json,.yaml,.yml,.html,.xml,.log,.py,.js,.ts,.java,.cs,.cpp,.c,.go,.rs,.toml,.ini,.cfg"
              onChange={handleFileChange}
            />
          </Button>
        </Box>

        {isUploading && <LinearProgress sx={{ mb: 1 }} />}

        {uploadError && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {uploadError.response?.data?.detail ??
              "Upload failed. Check the file format."}
          </Alert>
        )}

        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          mb={1.5}
        >
          Supported: .txt, .md, .csv, .json, .yaml, .log, .py, .js, .ts, .java,
          .cs, .cpp, .go, .rs — max 50 MB per file
        </Typography>

        <Divider />

        {docsLoading ? (
          <Box display="flex" justifyContent="center" py={2}>
            <CircularProgress size={24} />
          </Box>
        ) : documents.length === 0 ? (
          <Typography
            color="text.secondary"
            textAlign="center"
            py={3}
            variant="body2"
          >
            No documents yet. Upload files to enable RAG retrieval.
          </Typography>
        ) : (
          <List disablePadding>
            {documents.map((doc) => (
              <ListItem
                key={doc.id}
                disableGutters
                divider
                secondaryAction={
                  <Tooltip title="Delete document">
                    <IconButton
                      edge="end"
                      size="small"
                      color="error"
                      disabled={isDeleting}
                      onClick={() => deleteDoc(doc.id)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <InsertDriveFileIcon fontSize="small" color="action" />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography variant="body2" fontWeight={500} noWrap>
                      {doc.filename}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {doc.chunk_count} chunks · indexed{" "}
                      {formatDate(doc.created_at)}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ProjectDetail({ projectId, onBack, onChat }) {
  const { data: project, isLoading: projectLoading } = useGetProject(projectId);
  const {
    mutate: updateProject,
    isPending: isSaving,
    isSuccess: saved,
    isError: saveError,
  } = useUpdateProject();

  // Uncontrolled ref for the textarea — zero re-renders while typing
  const promptRef = useRef(null);
  const [dirty, setDirty] = useState(false);
  const [snackOpen, setSnackOpen] = useState(false);
  const [snackMsg, setSnackMsg] = useState("");

  // Populate the textarea once the project loads (without touching state)
  useEffect(() => {
    if (project && promptRef.current) {
      promptRef.current.value = project.system_prompt ?? "";
      setDirty(false);
    }
  }, [project]);

  useEffect(() => {
    if (saved) {
      setSnackMsg("Project saved successfully");
      setSnackOpen(true);
      setDirty(false);
    }
  }, [saved]);

  const handleSave = () => {
    updateProject({
      id: projectId,
      data: { system_prompt: promptRef.current?.value ?? "" },
    });
  };

  // Stable callback so DocumentsPanel never re-renders due to this prop
  const handleSnack = useCallback((msg) => {
    setSnackMsg(msg);
    setSnackOpen(true);
  }, []);

  if (projectLoading) {
    return (
      <Box display="flex" justifyContent="center" mt={6}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* ── Header ── */}
      <Box display="flex" alignItems="center" gap={1} mb={3}>
        <Tooltip title="Back to projects">
          <IconButton onClick={onBack} sx={{ mr: 0.5 }}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Box flex={1} minWidth={0}>
          <Typography variant="h5" fontWeight={700} noWrap>
            {project?.name}
          </Typography>
          <Chip
            label={MODEL_LABELS[project?.model] ?? project?.model}
            size="small"
            variant="outlined"
            sx={{ mt: 0.5 }}
          />
        </Box>
        <Button variant="contained" startIcon={<ChatIcon />} onClick={onChat}>
          Open Chat
        </Button>
      </Box>

      <Stack spacing={3}>
        {/* ── System Prompt ── */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={0.5}>
              System Prompt
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Defines the AI's behaviour and role for this project.
            </Typography>
            {/* Uncontrolled textarea: no state update on every keystroke */}
            <TextField
              inputRef={promptRef}
              defaultValue={project?.system_prompt ?? ""}
              onChange={() => !dirty && setDirty(true)}
              multiline
              rows={6}
              fullWidth
              placeholder="You are a helpful assistant…"
            />
            <Box display="flex" justifyContent="flex-end" mt={2}>
              {saveError && (
                <Alert severity="error" sx={{ mr: 2, flex: 1, py: 0 }}>
                  Failed to save. Please try again.
                </Alert>
              )}
              <Button
                variant="contained"
                startIcon={
                  isSaving ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <SaveIcon />
                  )
                }
                onClick={handleSave}
                disabled={!dirty || isSaving}
              >
                Save
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* ── RAG Documents (memoised, never re-renders during typing) ── */}
        <DocumentsPanel projectId={projectId} onSnack={handleSnack} />
      </Stack>

      <Snackbar
        open={snackOpen}
        autoHideDuration={4000}
        onClose={() => setSnackOpen(false)}
        message={snackMsg}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
