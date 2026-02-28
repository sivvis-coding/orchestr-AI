import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { useValidateKey } from "../hooks/useValidateKey";
import { useCreateProject } from "../hooks/useCreateProject";
import { GEMINI_MODELS } from "../constants";

const MODELS = GEMINI_MODELS;

export default function ProjectForm({ onSuccess, onCancel }) {
  const [form, setForm] = useState({
    name: "",
    model: "gemini-2.5-flash",
    api_key: "",
    system_prompt: "",
    context_data: "",
  });
  const [keyValidated, setKeyValidated] = useState(false);

  const {
    mutate: validateKey,
    isPending: isValidating,
    data: validationResult,
    reset: resetValidation,
  } = useValidateKey();

  const { mutate: createProject, isPending: isCreating } = useCreateProject({
    onSuccess,
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === "api_key" || name === "model") {
      setKeyValidated(false);
      resetValidation();
    }
  };

  const handleValidate = () => {
    validateKey(
      { api_key: form.api_key, model: form.model },
      {
        onSuccess: (data) => {
          setKeyValidated(data.valid);
        },
      }
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createProject(form);
  };

  const canSubmit = form.name && form.api_key && keyValidated && !isCreating;

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Typography variant="h6" mb={2} fontWeight={700}>
        New Project
      </Typography>

      <Stack spacing={2}>
        <TextField
          label="Project Name"
          name="name"
          value={form.name}
          onChange={handleChange}
          required
          fullWidth
        />

        <FormControl fullWidth>
          <InputLabel id="model-label">Model</InputLabel>
          <Select
            labelId="model-label"
            name="model"
            value={form.model}
            label="Model"
            onChange={handleChange}
          >
            {MODELS.map((m) => (
              <MenuItem key={m.value} value={m.value}>
                {m.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box>
          <TextField
            label="Gemini API Key"
            name="api_key"
            value={form.api_key}
            onChange={handleChange}
            required
            fullWidth
            type="password"
            InputProps={{
              endAdornment: keyValidated ? (
                <CheckCircleIcon color="success" />
              ) : validationResult && !validationResult.valid ? (
                <ErrorIcon color="error" />
              ) : null,
            }}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={handleValidate}
            disabled={!form.api_key || isValidating}
            sx={{ mt: 1 }}
          >
            {isValidating ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
            Validate Key
          </Button>
          {validationResult && (
            <Alert
              severity={validationResult.valid ? "success" : "error"}
              sx={{ mt: 1 }}
              icon={validationResult.valid ? <CheckCircleIcon /> : <ErrorIcon />}
            >
              {validationResult.message}
            </Alert>
          )}
        </Box>

        <TextField
          label="System Prompt"
          name="system_prompt"
          value={form.system_prompt}
          onChange={handleChange}
          multiline
          rows={3}
          fullWidth
          placeholder="You are a helpful assistant…"
        />

        <TextField
          label="Context Data"
          name="context_data"
          value={form.context_data}
          onChange={handleChange}
          multiline
          rows={4}
          fullWidth
          placeholder="Paste or type context data here…"
        />

        <Box display="flex" gap={1} justifyContent="flex-end">
          <Button variant="text" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!canSubmit}
          >
            {isCreating ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
            Create Project
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
