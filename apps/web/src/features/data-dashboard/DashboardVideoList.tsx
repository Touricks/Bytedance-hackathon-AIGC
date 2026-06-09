import {
  Box,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { toAbsoluteAssetUrl } from "../../lib/api/client.js";
import type { DashboardVideoArtifact } from "../../lib/api/dashboardVideoArtifacts.js";
import type { DashboardAnalyticsSnapshot } from "./dashboardTypes.js";
import { factorLabels, formatDateTime, formatSeconds } from "./dashboardFormatters.js";
import { dashboardVideoPosterDataUrl } from "./dashboardVideoPoster.js";

export function DashboardVideoList({
  videos,
  snapshot,
  selectedVideoId,
  onSelectVideo,
}: {
  videos: DashboardVideoArtifact[];
  snapshot: DashboardAnalyticsSnapshot;
  selectedVideoId?: string | null;
  onSelectVideo?: (videoId: string) => void;
}) {
  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 900 }}>
          数据面板视频
        </Typography>
        <Typography variant="body2" color="text.secondary">
          已进入数据面板的视频信息
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
        {videos.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Typography color="text.secondary">暂无数据面板视频</Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>视频</TableCell>
                <TableCell>时长</TableCell>
                <TableCell>导入时间</TableCell>
                <TableCell>成片任务</TableCell>
                <TableCell>生成因子</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {videos.map((video) => {
                const labels = factorLabels(snapshot, video.creativeFactors);
                return (
                  <TableRow
                    key={video.id}
                    hover
                    selected={selectedVideoId === video.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => onSelectVideo?.(video.id)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      onSelectVideo?.(video.id);
                    }}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                        <Box
                          component="video"
                          src={toAbsoluteAssetUrl(video.localUrl)}
                          poster={dashboardVideoPosterDataUrl(video.id)}
                          muted
                          preload="none"
                          sx={{
                            width: 96,
                            aspectRatio: "16/9",
                            bgcolor: "action.hover",
                            borderRadius: 1,
                            objectFit: "cover",
                          }}
                        />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>
                            {video.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {video.width ?? "--"}×{video.height ?? "--"}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>{formatSeconds(video.durationSec)}</TableCell>
                    <TableCell>{formatDateTime(video.importedAt)}</TableCell>
                    <TableCell>{video.finalVideoJobId ?? "--"}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                        <Chip size="small" label={labels.productCategory.label} />
                        <Chip size="small" label={labels.dealType.label} />
                        <Chip size="small" label={labels.audience.label} />
                        <Chip size="small" label={labels.strategy.label} />
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
