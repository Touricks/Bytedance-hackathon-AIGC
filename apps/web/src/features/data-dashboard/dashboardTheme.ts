import { createTheme } from "@mui/material/styles";

/**
 * Dashboard-scoped MUI theme so the floating assistant (and any other MUI
 * surfaces inside the 分析诊断看板) resolve `primary` / `success` to the DaiReel
 * design palette instead of MUI's default blue/green. The rest of the dashboard
 * is plain HTML styled via `dataDashboard.css`.
 */
export const dashboardTheme = createTheme({
  palette: {
    primary: { main: "#6457E8", dark: "#564AD6", contrastText: "#ffffff" },
    success: { main: "#0FAE7E", dark: "#0C9A6F", contrastText: "#ffffff" },
    error: { main: "#F1556C" },
    background: { default: "#F3F4F8", paper: "#FFFFFF" },
    text: { primary: "#1E2230", secondary: "#5B6173" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily:
      '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Segoe UI",Roboto,Helvetica,Arial,sans-serif',
  },
});
