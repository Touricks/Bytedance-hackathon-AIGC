import { Avatar, Box, Button, Stack, Typography } from "@mui/material";
import { BarChart3, FileVideo, Sparkles } from "lucide-react";

export type DashboardView = "diagnosis" | "videos";

interface DashboardSidebarProps {
  activeView: DashboardView;
  userName: string;
  onViewChange: (view: DashboardView) => void;
}

const navItems = [
  { id: "diagnosis" as const, label: "分析诊断", icon: BarChart3 },
  { id: "videos" as const, label: "视频列表", icon: FileVideo },
];

export function DashboardSidebar({
  activeView,
  userName,
  onViewChange,
}: DashboardSidebarProps) {
  return (
    <Box
      component="aside"
      sx={{
        width: 240,
        flex: "0 0 240px",
        minHeight: "100vh",
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
        <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.main" }}>
          <Sparkles size={17} />
        </Avatar>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          DaiReel
        </Typography>
      </Stack>

      <Stack component="nav" spacing={1} aria-label="数据看板导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeView;
          return (
            <Button
              key={item.id}
              type="button"
              variant={active ? "contained" : "text"}
              color={active ? "primary" : "inherit"}
              startIcon={<Icon size={17} />}
              onClick={() => onViewChange(item.id)}
              sx={{ justifyContent: "flex-start", borderRadius: 1.5 }}
            >
              {item.label}
            </Button>
          );
        })}
      </Stack>

      <Stack direction="row" spacing={1.25} sx={{ mt: "auto", alignItems: "center" }}>
        <Avatar sx={{ width: 34, height: 34 }}>{userName.slice(0, 1)}</Avatar>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {userName}
        </Typography>
      </Stack>
    </Box>
  );
}
