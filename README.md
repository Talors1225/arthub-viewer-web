# ArtHub 网页查看器

这是 ArtHub 的公开网页端代码，可通过 GitHub Pages 在线访问。大型 Spine、贴图和图库文件不放在 GitHub，而是从腾讯云 COS 按需读取。

## 在线部署

1. 把本目录内容放进一个 GitHub 仓库的根目录。
2. 在仓库 **Settings → Pages** 中选择 **Deploy from a branch**，分支选择 `main`，目录选择 `/(root)`。
3. 保存后等待 GitHub 发布，网址通常是 `https://你的用户名.github.io/仓库名/`。

## COS 资源

COS 中需要保留以下远程目录：

- `bd2/spine/`
- `nikki/spine/`
- `majsoul/assets_raw/`
- `majsoul/web_illustrations/`
- `gallery/bd2/`
- `gallery/nikke/`
- `gallery/majsoul/`

网页代码公开，资源仍由 COS 提供。请不要把 COS SecretId 或 SecretKey 写进仓库。
