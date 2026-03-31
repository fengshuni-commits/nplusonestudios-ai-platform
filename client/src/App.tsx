import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import DesignPlanning from "./pages/DesignPlanning";
import DesignTools from "./pages/DesignTools";
import ConstructionDocs from "./pages/ConstructionDocs";
import Procurement from "./pages/Procurement";
import Assets from "./pages/Assets";
import Standards from "./pages/Standards";
import Integrations from "./pages/Integrations";
import Workflows from "./pages/Workflows";
import AdminTeam from "./pages/AdminTeam";
import AiToolsManagement from "./pages/AiToolsManagement";
import AiToolStats from "./pages/AiToolStats";
import AdminSettings from "./pages/AdminSettings";
import AdminCaseSources from "./pages/AdminCaseSources";
import AdminFeedback from "./pages/AdminFeedback";
import MeetingMinutes from "./pages/MeetingMinutes";
import HistoryPage from "./pages/History";
import MediaXiaohongshu from "./pages/MediaXiaohongshu";
import MediaWechat from "./pages/MediaWechat";
import MediaInstagram from "./pages/MediaInstagram";
import PendingApproval from "./pages/PendingApproval";
import Home from "./pages/Home";
import DesignBrief from "./pages/DesignBrief";
import PresentationPage from "./pages/Presentation";
import ColorPlan from "./pages/ColorPlan";
import DesignAnalysis from "./pages/DesignAnalysis";
import MediaLayout from "./pages/MediaLayout";
import MediaPortfolio from "./pages/MediaPortfolio";
import VideoGeneration from "./pages/VideoGeneration";
import OpenClawIntegration from "./pages/OpenClawIntegration";
import ApiDocs from "./pages/ApiDocs";

function Router() {
  return (
    <Switch>
      {/* 等待审批页面（不需要 DashboardLayout） */}
      <Route path="/pending-approval" component={PendingApproval} />
      {/* 公开 API 文档（不需要登录） */}
      <Route path="/api-docs" component={ApiDocs} />

      {/* 主应用（带 DashboardLayout） */}
      <Route>
    <DashboardLayout>
      <Switch>
        {/* Home dashboard */}
        <Route path="/" component={Home} />

        {/* 设计板块 */}
        <Route path="/design/planning" component={DesignPlanning} />
        <Route path="/design/tools" component={DesignTools} />
        <Route path="/design/video" component={VideoGeneration} />
        <Route path="/design/color-plan" component={ColorPlan} />
        <Route path="/design/presentation" component={PresentationPage} />
        <Route path="/openclaw" component={OpenClawIntegration} />

        {/* 营建板块 */}
        <Route path="/construction/docs" component={ConstructionDocs} />
        <Route path="/construction/procurement" component={Procurement} />

        {/* 项目管理板块 */}
        <Route path="/projects" component={Projects} />
        <Route path="/projects/:id" component={ProjectDetail} />
        <Route path="/meeting" component={MeetingMinutes} />
        <Route path="/design/brief" component={DesignBrief} />
        <Route path="/design/analysis" component={DesignAnalysis} />

        {/* 媒体板块 */}
        <Route path="/media/xiaohongshu" component={MediaXiaohongshu} />
        <Route path="/media/wechat" component={MediaWechat} />
        <Route path="/media/instagram" component={MediaInstagram} />
        <Route path="/media/layout" component={MediaLayout} />
        <Route path="/media/portfolio" component={MediaPortfolio} />

        {/* 历史板块 */}
        <Route path="/history" component={HistoryPage} />

        {/* 管理板块（管理员） */}
        <Route path="/standards" component={Standards} />
        <Route path="/assets" component={Assets} />
        <Route path="/integrations" component={Integrations} />
        <Route path="/workflows" component={Workflows} />
        <Route path="/admin/team" component={AdminTeam} />
        <Route path="/admin/ai-tools" component={AiToolsManagement} />
        <Route path="/admin/ai-stats" component={AiToolStats} />
        <Route path="/admin/case-sources" component={AdminCaseSources} />
        <Route path="/admin/settings" component={AdminSettings} />
        <Route path="/admin/feedback" component={AdminFeedback} />

        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
      </Route>
    </Switch>
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
