# ArtHub 网页端 COS 版

这是现有 ArtHub 网页查看器的静态部署包。网页端当前主要提供 NIKKE，并保留棕色尘埃2入口；不包含 Mod 页面、Mod 资源、雀魂页面或静态图库。

## 已完成

- NIKKE 普通版 Spine 动态查看器。
- 棕色尘埃2入口保留，后续继续完善。
- BD2 Mod、NIKKE Mod、雀魂和图库不进入网页入口、网页索引或 COS 上传清单。
- 小型索引放在网站包内；Spine、贴图从腾讯 COS 按需读取。
- COS 地址已写入 `arthub-cos-config.js`。

## 部署

1. 把整个 `web-cos` 文件夹发布到 GitHub Pages 或其他静态网站，不能只上传 `index.html`。
2. 按 `cos-upload-manifest.json` 中每个 `sources[].assets[]` 的远程前缀上传对应本地目录，目录结构和文件名保持不变。
3. 在 COS 配置 CORS：允许网站域名，方法至少为 GET、HEAD、OPTIONS；测试阶段可暂时使用 `*`。
4. 先上传一个 NIKKE Spine 资源目录测试，再批量上传全部资源。

COS 只负责资源，网页代码可以放在 GitHub Pages；不要把 SecretId/SecretKey 写进网页。
