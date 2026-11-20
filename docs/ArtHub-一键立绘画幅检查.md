# 一键检查立绘画幅

新立绘登记到资源库后，双击站点目录里的 `一键修复立绘画幅.cmd`。工具读取当前全站目录，打开资源，逐动作检查画幅和边缘。运行结束会打开报告。

已有扫描结果时，把报告文件夹或里面的 `summary.json` 拖到这个脚本上。程序会重跑报告里的动作和阶段，同一资源只打开一次。

工具优先连接当前本地预览站点。没有预览站点时会临时启动本站，并按现有配置读取资源。资源需要能在本地查看器里加载。

工具通过贴图和网格定位 Live2D 的外围矩形遮罩，并分别尝试按遮罩取景、适当放宽画幅、保留原镜头角度。程序比较同一姿态裁切前后的画面，检查主体保留率、边缘和遮罩切换。新规则通过桌面、手机竖屏和图片、视频取景复测后才写入。每套共用取景还会在浏览器内编码并解码一份 PNG 和一小段视频。

通过的动作共用同一套取景时会合并登记到 `auto-scene-apertures.mjs`。刷新本地页面可查看效果，报告旁保存上一版规则。原始资源保持只读，验证时的图片和视频留在浏览器内存中。

报告会记录纯色边、黑角、无可见画面和加载失败。近似矩形的背景露边时，程序会尝试用原图层的四个角跟踪镜头，再检查裁切后是否完整保留主体、填满画幅。带透明轮廓的立绘沿用原画面。当前自动写入支持碧蓝航线 Live2D 的可验证遮罩和背景取景。

碧蓝航线的逐动作扫描也会检查半透明的矩形遮罩和动作开头的转场。把这份报告拖给脚本复检时，程序会对照遮罩开合前后的画面，并复查桌面、竖屏和导出画幅。

棕色尘埃 2 的场景可以把经过复核的矩形取景登记在 `bd2/scene-camera-frames.json`，按资源和动作记录。主查看器、PNG 和视频共用这个画幅。优先使用提取到的原始镜头，有分层画面但缺镜头时，沿原场景多帧取有效内框，再核对桌面、竖屏和导出。

本机需要 Node.js 和 Playwright。工具能使用 Codex 已安装的 Playwright，以及 Chrome 或 Edge。

```powershell
node scripts/repair-portrait-frames.cjs --scan-only
node scripts/repair-portrait-frames.cjs --dry-run --from-report="上次报告目录"
node scripts/repair-portrait-frames.cjs --from-report="上次报告目录"
node scripts/repair-portrait-frames.cjs --games=azur --ids=u2501_2
node scripts/repair-portrait-frames.cjs --url=http://127.0.0.1:55431
```

如需接着上次的报告目录检查，使用相同筛选条件并加上 `--resume` 和 `--report-dir=报告目录`。
