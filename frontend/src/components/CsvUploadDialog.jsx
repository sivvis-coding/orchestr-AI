import { useState, useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { documentsApi } from "../api";
import { useUploadDocument } from "../hooks/useDocuments";

export default function CsvUploadDialog({
  open,
  file,
  projectId,
  onClose,
  onSuccess,
}) {
  const [columns, setColumns] = useState([]);
  const [idColumn, setIdColumn] = useState("");
  const [indexColumns, setIndexColumns] = useState([]);
  const [loadingCols, setLoadingCols] = useState(false);
  const [colError, setColError] = useState(null);

  const {
    mutate: uploadDoc,
    isPending: isUploading,
    error: uploadError,
  } = useUploadDocument(projectId);

  // Fetch columns from the backend whenever the dialog opens with a new file
  useEffect(() => {
    if (!open || !file) return;
    setColumns([]);
    setIdColumn("");
    setIndexColumns([]);
    setColError(null);
    setLoadingCols(true);
    documentsApi
      .getCsvColumns(projectId, file)
      .then((data) => setColumns(data.columns))
      .catch(() =>
        setColError("Could not read CSV columns. Check the file format."),
      )
      .finally(() => setLoadingCols(false));
  }, [open, file, projectId]);

  const toggleIndexColumn = (col, checked) => {
    setIndexColumns((prev) =>
      checked ? [...prev, col] : prev.filter((c) => c !== col),
    );
  };

  const handleUpload = () => {
    uploadDoc(
      { file, csvConfig: { idColumn, indexColumns } },
      {
        onSuccess: () => {
          onSuccess(file.name);
          onClose();
        },
      },
    );
  };

  const canUpload = idColumn && indexColumns.length > 0 && !loadingCols;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure CSV Import</DialogTitle>

      <DialogContent dividers>
        {loadingCols && <LinearProgress sx={{ mb: 2 }} />}

        {colError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {colError}
          </Alert>
        )}

        {uploadError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {uploadError.response?.data?.detail ?? "Upload failed."}
          </Alert>
        )}

        {!loadingCols && columns.length > 0 && (
          <>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              File: <strong>{file?.name}</strong> — {columns.length} column
              {columns.length !== 1 ? "s" : ""} detected
            </Typography>

            <Divider sx={{ my: 1.5 }} />

            <FormControl fullWidth margin="normal" required>
              <InputLabel id="id-col-label">
                ID column (unique row identifier)
              </InputLabel>
              <Select
                labelId="id-col-label"
                value={idColumn}
                label="ID column (unique row identifier)"
                onChange={(e) => setIdColumn(e.target.value)}
              >
                {columns.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                Used to look up the full row when a match is found.
              </FormHelperText>
            </FormControl>

            <Box mt={2}>
              <Typography variant="body2" fontWeight={500} gutterBottom>
                Columns to index for semantic search{" "}
                <Typography
                  component="span"
                  variant="body2"
                  color="text.secondary"
                >
                  (select at least one)
                </Typography>
              </Typography>
              <FormGroup>
                {columns.map((c) => (
                  <FormControlLabel
                    key={c}
                    control={
                      <Checkbox
                        size="small"
                        checked={indexColumns.includes(c)}
                        onChange={(e) => toggleIndexColumn(c, e.target.checked)}
                      />
                    }
                    label={<Typography variant="body2">{c}</Typography>}
                  />
                ))}
              </FormGroup>
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isUploading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleUpload}
          disabled={!canUpload || isUploading}
          startIcon={
            isUploading ? <CircularProgress size={16} /> : <UploadFileIcon />
          }
        >
          {isUploading ? "Indexing…" : "Upload & Index"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
