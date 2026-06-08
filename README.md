# Kylin Offline MCP ECharts

离线图表 MCP 服务，面向 Kylin ARM64 + 64KB `PAGE_SIZE`。它使用 Apache ECharts 的纯 JS SVG SSR 能力，再调用系统 `rsvg-convert` 生成 PNG，不走 `@napi-rs/canvas` / `canvas` PNG 渲染路径。

## 渲染链路

```text
MCP SSE tool call
  -> ECharts option
  -> echarts.init(null, theme, { renderer: "svg", ssr: true, width, height })
  -> chart.renderToSVGString()
  -> rsvg-convert --zoom 2 -f png -o chart.png chart.svg
  -> /charts/chart_xxx.png
  -> JSON text with chartUrl/imageFile/imageFormat/size
```

## 本机 Docker 测试

```bash
docker build -t kylin-offline-mcp-echarts:local .
docker run --rm -p 7003:7003 -v "$PWD/charts:/app/charts" kylin-offline-mcp-echarts:local
curl http://127.0.0.1:7003/health
```

SSE 地址：

```text
http://127.0.0.1:7003/sse
```

同一端口提供：

```text
/sse
/messages
/health
/charts
/api/tools/:toolName
```

## curl 直连 HTTP 测试

除了 MCP SSE 外，也支持直接通过 HTTP 调用图表工具，适合 `curl`、脚本和容器冒烟测试。

先检查服务：

```bash
curl http://127.0.0.1:7003/health
```

生成柱状图：

```bash
curl -X POST http://127.0.0.1:7003/api/tools/generate_bar_chart \
  -H 'Content-Type: application/json' \
  -d '{
    "data": [
      { "category": "类兴邦", "value": 9.70 },
      { "category": "肖棋元", "value": 8.52 },
      { "category": "刘晶晶", "value": 7.37 },
      { "category": "庄宇飞", "value": 6.97 },
      { "category": "张兆乾", "value": 6.41 },
      { "category": "彭子瑞", "value": 5.01 }
    ],
    "title": "报销金额排名前六名人员",
    "axisXTitle": "人员姓名",
    "axisYTitle": "报销金额(万元)"
  }'
```

成功时会直接返回：

```json
{
  "status": "success",
  "chartUrl": "/charts/generate_bar_chart_1780000000000_abcd1234ef.png",
  "imageFile": "/app/charts/generate_bar_chart_1780000000000_abcd1234ef.png",
  "imageFormat": "png",
  "size": {
    "width": 800,
    "height": 600,
    "bytes": 30000,
    "zoom": 2
  }
}
```

然后就可以直接访问图片：

```bash
curl -O http://127.0.0.1:7003/charts/<上一步返回的png文件名>
```

## 测试用例

工具：`generate_bar_chart`

```json
{
  "data": "[{\"category\": \"类兴邦\", \"value\": 9.70}, {\"category\": \"肖棋元\", \"value\": 8.52}, {\"category\": \"刘晶晶\", \"value\": 7.37}, {\"category\": \"庄宇飞\", \"value\": 6.97}, {\"category\": \"张兆乾\", \"value\": 6.41}, {\"category\": \"彭子瑞\", \"value\": 5.01}]",
  "title": "报销金额排名前六名人员",
  "axisXTitle": "人员姓名",
  "axisYTitle": "报销金额(万元)"
}
```

`data` 既支持数组，也支持上面这种 JSON 字符串。

成功返回文本内容类似：

```json
{
  "status": "success",
  "chartUrl": "/charts/generate_bar_chart_1780000000000_abcd1234ef.png",
  "imageFile": "/app/charts/generate_bar_chart_1780000000000_abcd1234ef.png",
  "imageFormat": "png",
  "size": {
    "width": 800,
    "height": 600,
    "bytes": 30000,
    "zoom": 2
  }
}
```

## Kylin ARM64 Release tar

GitHub Actions 工作流：

```text
.github/workflows/release-kylin-arm64.yml
.github/workflows/release-kylin-arm64-page64k.yml
```

`release-kylin-arm64.yml` 使用 GitHub 托管 `ubuntu-24.04-arm` runner 生成 `linux/arm64` tar。GitHub 官方文档列出的 ARM64 runner label 包括 `ubuntu-24.04-arm`，但托管 runner 不能指定 64K page-size 内核。

`release-kylin-arm64-page64k.yml` 用 `[self-hosted, Linux, ARM64, page64k]`，会先检查：

```bash
test "$(uname -m)" = "aarch64"
test "$(getconf PAGE_SIZE)" = "65536"
```

面向 Kylin ARM64 + 64KB `PAGE_SIZE` 的最终发布，推荐使用 self-hosted 64K runner workflow。

Kylin 打包默认参考 `54dabang/gpt-vis-mcp` 的 Kylin 基础镜像：

```dockerfile
ARG KYLIN_BASE_IMAGE=macrosan/kylin:v10-sp3-2403
FROM ${KYLIN_BASE_IMAGE}
```

GitHub Actions 的 `kylin_base_image` 输入可以覆盖为 `kylin-server-arm64:v10`。无论使用哪个 Kylin/vendor 基础镜像，都必须先通过 `yum` 安装 `nodejs`、`npm`、`gcc`、`gcc-c++`、`make`、`pkgconfig`、`cairo-devel`、`libjpeg-turbo-devel`、`libpng-devel`、`pango-devel`、`giflib-devel`、`librsvg2-devel`、`librsvg2-tools` 等系统依赖，再执行 `npm ci`。

手动运行时输入 tag，例如 `v0.1.0`。成功后 Release asset 名称：

```text
kylin-offline-mcp-echarts-v0.1.0-linux-arm64.tar.gz
```

下载链接模板：

```text
https://github.com/<owner>/<repo>/releases/download/v0.1.0/kylin-offline-mcp-echarts-v0.1.0-linux-arm64.tar.gz
https://gh.llkk.cc/https://github.com/<owner>/<repo>/releases/download/v0.1.0/kylin-offline-mcp-echarts-v0.1.0-linux-arm64.tar.gz
```

64K 自托管 runner 产物模板：

```text
https://github.com/<owner>/<repo>/releases/download/v0.1.0-page64k/kylin-offline-mcp-echarts-v0.1.0-page64k-linux-arm64-page64k.tar.gz
https://gh.llkk.cc/https://github.com/<owner>/<repo>/releases/download/v0.1.0-page64k/kylin-offline-mcp-echarts-v0.1.0-page64k-linux-arm64-page64k.tar.gz
```

目标机加载：

```bash
docker load -i kylin-offline-mcp-echarts-v0.1.0-linux-arm64.tar.gz
docker image inspect kylin-offline-mcp-echarts:v0.1.0-arm64 --format '{{.Os}}/{{.Architecture}}'
docker run -d --name kylin-offline-mcp-echarts -p 7003:7003 -v "$PWD/charts:/app/charts" kylin-offline-mcp-echarts:v0.1.0-arm64
```

64KB 页面大小最终仍建议在真实 Kylin ARM64 目标机上确认：

```bash
getconf PAGE_SIZE
docker exec kylin-offline-mcp-echarts rsvg-convert --version
curl http://127.0.0.1:7003/health
```

## 关键约束

本项目没有运行时依赖 `mcp-echarts` npm 包，因为 `mcp-echarts@0.7.1` 直接依赖 `@napi-rs/canvas`。这里保留兼容的工具定义和 ECharts option 生成方式，但渲染路径完全替换为 SVG SSR + 系统 `rsvg-convert`。

`Dockerfile.kylin` 仍设置 64K 链接和 npm 源码编译约束：

```dockerfile
ENV LDFLAGS="-Wl,-z,max-page-size=65536"
ENV npm_config_build_from_source=true
ENV npm_config_canvas_build_from_source=true
```

当前业务路径不调用 canvas，这两个环境变量是为了防止未来依赖变化时误拉 4KB page-size 预编译原生包。
