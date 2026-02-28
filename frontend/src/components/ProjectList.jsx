import { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ChatIcon from "@mui/icons-material/Chat";
import { useGetProjects } from "../hooks/useGetProjects";
import { useDeleteProject } from "../hooks/useCreateProject";
import { MODEL_LABELS } from "../constants";

export default function ProjectList({ onSelectProject, onCreateNew }) {
  const { data: projects = [], isLoading, isError } = useGetProjects();
  const { mutate: deleteProject, isPending: isDeleting } = useDeleteProject();

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" mt={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return (
      <Typography color="error" mt={2}>
        Failed to load projects. Make sure the backend is running.
      </Typography>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5" fontWeight={700}>
          Projects
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onCreateNew}
        >
          New Project
        </Button>
      </Box>

      {projects.length === 0 ? (
        <Card variant="outlined">
          <CardContent>
            <Typography color="text.secondary" textAlign="center">
              No projects yet. Create your first one!
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <List disablePadding>
          {projects.map((project) => (
            <Card key={project.id} variant="outlined" sx={{ mb: 1 }}>
              <ListItem
                secondaryAction={
                  <Box>
                    <IconButton
                      edge="end"
                      aria-label="chat"
                      onClick={() => onSelectProject(project)}
                      color="primary"
                    >
                      <ChatIcon />
                    </IconButton>
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => deleteProject(project.id)}
                      disabled={isDeleting}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText
                  primary={project.name}
                  secondary={
                    <Chip
                      label={MODEL_LABELS[project.model] ?? project.model}
                      size="small"
                      variant="outlined"
                      sx={{ mt: 0.5 }}
                    />
                  }
                />
              </ListItem>
            </Card>
          ))}
        </List>
      )}
    </Box>
  );
}
