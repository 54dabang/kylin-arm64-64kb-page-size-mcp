import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  rootDir,
  chartsDir: path.resolve(process.env.CHARTS_DIR || path.join(rootDir, "charts")),
  host: process.env.HOST || "0.0.0.0",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "",
  defaultPort: Number.parseInt(process.env.PORT || "7003", 10),
  rsvgConvertBin: process.env.RSVG_CONVERT_BIN || "rsvg-convert",
  renderZoom: Number.parseFloat(process.env.RENDER_ZOOM || "2"),
  fontFamily:
    process.env.ECHARTS_FONT_FAMILY ||
    "Noto Sans CJK SC, Noto Sans CJK, WenQuanYi Micro Hei, Microsoft YaHei, PingFang SC, Arial, sans-serif",
};
