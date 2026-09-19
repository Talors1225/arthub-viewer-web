# ArtHub 网页查看器

在线地址：[打开查看器](https://talors1225.github.io/arthub-viewer-web/)

源码仓库：[GitHub](https://github.com/Talors1225/arthub-viewer-web)

这是公开的网页查看器代码。网页代码和小型索引放在 GitHub，大型 Spine 和贴图从腾讯云 COS 按需读取。

## 直接使用

打开上面的在线地址，选择 NIKKE、雀魂麻将或棕色尘埃2即可查看；当前主要测试 NIKKE 的缩略图和按需加载效果。

如果页面能打开但资源为空，通常是 COS 资源还没有上传完成，或者 COS 还没有配置跨域读取。

## 网页端内容

- 棕色尘埃2 Spine 动态查看器
- NIKKE 普通版 Spine 动态查看器
- 雀魂麻将 Spine / Live2D 查看器
- 静态图库暂不发布
- 网页端不包含 BD2 Mod 或 NIKKE Mod

## COS 目录

COS 中需要保持以下远程目录，目录名和层级不能改变：

| 远程目录 | 用途 |
| --- | --- |
| `bd2/spine/` | 棕色尘埃2动态资源 |
| `nikki/spine_carved/` | NIKKE普通版动态资源 |
| `majsoul/assets_raw/` | 雀魂动态资源 |
| `majsoul/web_illustrations/` | 雀魂网页插图 |

COS 跨域建议设置为：

- 来源：`https://talors1225.github.io`
- 方法：`GET`、`HEAD`、`OPTIONS`
- 请求头：`*`

## 自己部署

1. 把本目录内容放进 GitHub 仓库根目录。
2. 打开仓库的 **Settings → Pages**。
3. 选择 **Deploy from a branch**，分支选择 `main`，目录选择 `/(root)`。
4. 保存后等待 GitHub 发布，网址格式为 `https://用户名.github.io/仓库名/`。

不要把 COS SecretId 或 SecretKey 写进网页或 GitHub 仓库。游戏素材版权归原权利人所有，公开展示前请确认你拥有相应授权。
