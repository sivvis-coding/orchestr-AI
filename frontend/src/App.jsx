import { useState } from "react";
import {
  Box,
  Container,
  CssBaseline,
  Dialog,
  DialogContent,
  Paper,
  ThemeProvider,
  createTheme,
} from "@mui/material";
import ProjectList from "./components/ProjectList";
import ProjectForm from "./components/ProjectForm";
import ProjectDetail from "./components/ProjectDetail";
import ChatWindow from "./components/ChatWindow";

const theme = createTheme({
  palette: {
    primary: { main: "#1976d2" },
    secondary: { main: "#7c4dff" },
  },
  shape: { borderRadius: 12 },
});

function App() {
  const [view, setView] = useState("list"); // "list" | "detail" | "chat"
  const [showForm, setShowForm] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  const handleOpenProject = (project) => {
    setSelectedProject(project);
    setView("detail");
  };

  const handleSelectProject = (project) => {
    setSelectedProject(project);
    setView("chat");
  };

  const handleFormSuccess = () => {
    setShowForm(false);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container
        maxWidth="md"
        sx={{
          py: 4,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {view === "list" ? (
          <>
            <ProjectList
              onSelectProject={handleSelectProject}
              onOpenProject={handleOpenProject}
              onCreateNew={() => setShowForm(true)}
            />
            <Dialog
              open={showForm}
              onClose={() => setShowForm(false)}
              fullWidth
              maxWidth="sm"
            >
              <DialogContent>
                <ProjectForm
                  onSuccess={handleFormSuccess}
                  onCancel={() => setShowForm(false)}
                />
              </DialogContent>
            </Dialog>
          </>
        ) : view === "detail" ? (
          <ProjectDetail
            projectId={selectedProject?.id}
            onBack={() => setView("list")}
            onChat={() => setView("chat")}
          />
        ) : (
          <Paper
            variant="outlined"
            sx={{
              flexGrow: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <ChatWindow
              project={selectedProject}
              onBack={() => setView("list")}
            />
          </Paper>
        )}
      </Container>
    </ThemeProvider>
  );
}

export default App;
