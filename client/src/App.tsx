import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import DesignPlanning from "./pages/DesignPlanning";
import DesignTools from "./pages/DesignTools";
import ConstructionDocs from "./pages/ConstructionDocs";
import Procurement from "./pages/Procurement";
import Assets from "./pages/Assets";
import Standards from "./pages/Standards";
import AiTools from "./pages/AiTools";
import Integrations from "./pages/Integrations";
import Workflows from "./pages/Workflows";
import AdminTeam from "./pages/AdminTeam";
import AdminApiKeys from "./pages/AdminApiKeys";
import AdminSettings from "./pages/AdminSettings";
import AdminCaseSources from "./pages/AdminCaseSources";
import MeetingMinutes from "./pages/MeetingMinutes";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/projects" component={Projects} />
        <Route path="/projects/:id" component={ProjectDetail} />
        <Route path="/design/planning" component={DesignPlanning} />
        <Route path="/design/tools" component={DesignTools} />
        <Route path="/construction/docs" component={ConstructionDocs} />
        <Route path="/construction/procurement" component={Procurement} />
        <Route path="/assets" component={Assets} />
        <Route path="/standards" component={Standards} />
        <Route path="/ai-tools" component={AiTools} />
        <Route path="/integrations" component={Integrations} />
        <Route path="/meeting" component={MeetingMinutes} />
        <Route path="/workflows" component={Workflows} />
        <Route path="/admin/team" component={AdminTeam} />
        <Route path="/admin/api-keys" component={AdminApiKeys} />
        <Route path="/admin/case-sources" component={AdminCaseSources} />
        <Route path="/admin/settings" component={AdminSettings} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
