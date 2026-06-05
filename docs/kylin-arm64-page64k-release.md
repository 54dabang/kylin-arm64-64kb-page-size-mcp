# Kylin ARM64 64K Page-Size Release

本项目的目标运行路径是：

```text
ECharts SVG SSR -> rsvg-convert PNG -> /charts static URL -> MCP SSE JSON text
```

项目没有依赖 `mcp-echarts` npm 包本身，也没有依赖 `@napi-rs/canvas` 或 `canvas`。这是为了避开 Kylin ARM64 + 64KB `PAGE_SIZE` 下常见的 npm 预编译原生包 4K 对齐问题。

## 强制基础镜像和系统依赖

最终 Kylin Dockerfile 固定使用：

```dockerfile
FROM kylin-server-arm64:v10
```

系统依赖必须先安装：

```dockerfile
RUN yum update -y && \
    yum install -y \
      nodejs \
      npm \
      gcc \
      gcc-c++ \
      make \
      pkgconfig \
      cairo-devel \
      libjpeg-turbo-devel \
      libpng-devel \
      pango-devel \
      giflib-devel \
      librsvg2-devel \
      librsvg2-tools \
      fontconfig \
      wqy-microhei-fonts && \
    yum clean all

ENV npm_config_build_from_source=true \
    npm_config_canvas_build_from_source=true \
    npm_config_foreground_scripts=true
```

当前业务路径仍然不调用 `canvas`。PNG 输出只走 ECharts SVG SSR 和系统 `rsvg-convert`。

## 推荐打包方式

最准的方式是在真实或同族 Kylin ARM64 64K 页面大小机器上注册 GitHub self-hosted runner，并添加标签：

```text
self-hosted
Linux
ARM64
page64k
```

目标机检查：

```bash
uname -m
getconf PAGE_SIZE
docker version
```

要求：

```text
aarch64
65536
```

确保 runner 的 Docker 环境能访问 `kylin-server-arm64:v10` 后，在 GitHub Actions 里手动运行：

```text
.github/workflows/release-kylin-arm64-page64k.yml
```

Release 产物：

```text
kylin-offline-mcp-echarts-<tag>-linux-arm64-page64k.tar.gz
kylin-offline-mcp-echarts-<tag>-linux-arm64-page64k.tar.gz.sha256
```

## GitHub 托管 ARM64 Runner

`.github/workflows/release-kylin-arm64.yml` 使用 `ubuntu-24.04-arm`。这是原生 ARM64 runner，可以打出 `linux/arm64` 镜像 tar，但 GitHub 托管 runner 不能指定 64K 页面大小。

这条路径适合先做 ARM64 架构打包验证。最终面向 Kylin 64K 生产环境发布时，仍建议使用 `release-kylin-arm64-page64k.yml`。

## 目标机加载

```bash
docker load -i kylin-offline-mcp-echarts-v0.1.0-page64k-linux-arm64-page64k.tar.gz
docker image inspect kylin-offline-mcp-echarts:v0.1.0-page64k-arm64-page64k --format '{{.Os}}/{{.Architecture}}'
docker run -d --name kylin-offline-mcp-echarts \
  -p 7003:7003 \
  -v "$PWD/charts:/app/charts" \
  kylin-offline-mcp-echarts:v0.1.0-page64k-arm64-page64k
curl http://127.0.0.1:7003/health
```

MCP SSE 地址：

```text
http://127.0.0.1:7003/sse
```

## Release 下载链接模板

GitHub:

```text
https://github.com/<owner>/<repo>/releases/download/<tag>/kylin-offline-mcp-echarts-<tag>-linux-arm64-page64k.tar.gz
```

Gitproxy:

```text
https://gh.llkk.cc/https://github.com/<owner>/<repo>/releases/download/<tag>/kylin-offline-mcp-echarts-<tag>-linux-arm64-page64k.tar.gz
```

## 运行时验证

```bash
getconf PAGE_SIZE
docker exec kylin-offline-mcp-echarts node -e "const p=require('/app/package-lock.json'); const s=JSON.stringify(p); console.log({hasNapiCanvas:s.includes('@napi-rs/canvas'), hasCanvasPackage:s.includes('node_modules/canvas')})"
docker exec kylin-offline-mcp-echarts rsvg-convert --version
curl http://127.0.0.1:7003/health
```

期望：

```text
PAGE_SIZE = 65536
hasNapiCanvas = false
hasCanvasPackage = false
renderer = echarts-svg-ssr+rsvg-convert
canvas = false
```
