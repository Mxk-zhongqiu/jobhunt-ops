# Cloudflare Tunnel + Access 配置指南（AI Agent 远程模式）

> 版本：v1.0（2026-08-21）· 配套：《远程访问计划》§2.2（概述，本地私有文档）→ 本文是**详细分步执行版**
> 目标：把本机 DSH GUI（`http://127.0.0.1:3080`，无登录认证）安全暴露到公网，手机浏览器访问 `https://ai.<你的域名>` 即可给 AI 下指令干活
> ⚠️ 安全前提（远程访问计划红线）：**DSH GUI 绝不裸奔公网**——本文每一步都围绕"Tunnel 加密 + Access 身份认证"展开，两者缺一不可
> ⏱ 预计耗时：30–45 分钟（需电脑 + 手机配合，可在 ToDesk 远程下分步做）

---

## 0. 前置条件（先确认再开始）

| 项 | 要求 | 检查 |
|---|---|---|
| Cloudflare 账号 | 免费注册即可（dashboard.cloudflare.com） | ☐ |
| 域名 | 有一个域名且 **DNS 已托管在 Cloudflare**（Zone 状态 Active） | ☐ |
| 电脑 | 本机（jobhunt-ops 所在电脑），保持接通电源+联网 | ☐ |
| 手机 | 待会用于验证 Access 登录 | ☐ |

> 没有域名？Cloudflare Tunnel 也支持 `trycloudflare.com` 临时域名，但**不能配 Access 策略、域名随机变动**，只适合 5 分钟测试，不适合长期 AI Agent 模式。正式用必须有托管域名。

---

## 1. 安装 cloudflared（Windows）

方式 A（推荐，winget）：
```powershell
winget install cloudflare.cloudflared
```
方式 B（官网下载）：https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ → Windows 64-bit → 解压后把 `cloudflared.exe` 放到 `C:\cloudflared\` 并加入 PATH。

验证安装：
```powershell
cloudflared --version
```

---

## 2. 登录授权 + 创建隧道

```powershell
cloudflared tunnel login
```
- 会自动打开浏览器 → 选择你的 Cloudflare 账号 → 选择托管了域名的 Zone → Authorize。
- 完成后会在 `C:\Users\<你的用户名>\.cloudflared\cert.pem` 生成证书。

创建隧道（隧道名自定，如 `jobhunt`）：
```powershell
cloudflared tunnel create jobhunt
```
- 输出里会有 `Tunnel ID`（一段 UUID）和凭据文件路径 `C:\Users\<你的用户名>\.cloudflared\<Tunnel-ID>.json`，**记下 Tunnel ID**。

---

## 3. 写配置文件 config.yml

编辑 `C:\Users\<你的用户名>\.cloudflared\config.yml`：

```yaml
tunnel: <Tunnel-ID>                      # 第 2 步得到的 UUID
credentials-file: C:\Users\<你的用户名>\.cloudflared\<Tunnel-ID>.json

ingress:
  - hostname: ai.<你的域名>              # 示例：ai.example.com
    service: http://127.0.0.1:3080       # DSH GUI 本机端口，勿改
  - service: http_status:404             # 兜底：其他域名一律 404
```

> 只映射 `ai.<你的域名>` 一个子域；不要用 `*.你的域名` 泛解析。

---

## 4. 先前台测试（确认通了再服务化）

```powershell
cloudflared tunnel run jobhunt
```
- 保持窗口运行，另开终端做第 5 步（DNS 路由）。

## 5. DNS 路由（把子域指到隧道）

```powershell
cloudflared tunnel route dns jobhunt ai.<你的域名>
```
- 这条命令会自动在 Cloudflare DNS 里加一条 CNAME（`ai.<你的域名>` → `<Tunnel-ID>.cfargotunnel.com`，代理模式橙色云朵）。
- 到 Cloudflare 控制台 → DNS → Records 确认该记录存在且 Proxy status = **Proxied**。

手机/电脑浏览器访问 `https://ai.<你的域名>`：
- 能看到 DSH GUI 页面 = Tunnel 已通（此刻**先别用**，还没加认证，先关掉或继续下一步，别把地址发给任何人）。
- 打不开 → 检查：cloudflared 窗口日志有无 error、DNS 是否生效（`ping ai.<你的域名>` 或在线 DNS 查询）。

## 6. 加 Cloudflare Access 认证（关键安全步骤）

> 目的：只有**你的邮箱**能进，其他人访问一律被拦。

1. Cloudflare 控制台 → **Zero Trust**（左侧菜单）→ 首次进入会要选团队名/套餐（免费版即可）。
2. 左侧 **Access → Applications → Add an application**。
3. 类型选 **Self-hosted**，填：
   - Application domain：`ai.<你的域名>`（保持默认 Path 为 `/`）
   - Session duration：建议 24h（手机端免频繁登录）
4. 下一步 **Add a policy**：
   - Policy name：`only-me`
   - Action：**Allow**
   - Configure rules → Include → **Emails** → 填你自己的登录邮箱
5. Save → Application 创建完成。

验证：
- 用**手机流量**（关 WiFi）访问 `https://ai.<你的域名>` → 应跳转到 Cloudflare Access 登录页 → 邮箱验证码/免密登录 → 进入 DSH GUI。
- 用另一个邮箱/隐身窗口测试 → 应被拒（Access 拒绝页）。

## 7. 服务化（开机自启，防电脑重启后断线）

> 你在医院，电脑可能被家人重启/断电——隧道必须自动恢复。

```powershell
# 管理员 PowerShell
cloudflared service install
```
- 之后 `cloudflared` 作为 Windows 服务运行，开机自动启动、断线自动重连。
- 手动控制：
  ```powershell
  sc.exe start cloudflared      # 启动服务
  sc.exe stop cloudflared       # 停止服务
  ```
- 日志：`C:\Users\<你的用户名>\.cloudflared\` 或事件查看器 → Windows 日志 → 应用程序（来源 cloudflared）。

> 装服务前**先停掉第 4 步前台运行的 cloudflared**（Ctrl+C），否则端口/凭据冲突。

---

## 8. 日常使用（手机端）

- 浏览器打开 `https://ai.<你的域名>` → Access 登录（会话 24h）→ 进入 DSH GUI → 正常给 AI 下指令。
- 电脑端无感知：隧道只做端口转发，不占资源（<50MB 内存）。
- 流量：手机浏览器访问 DSH GUI 是轻量页面，一个月几百 MB 内，手机流量够用。

---

## 9. 应急与回滚

| 场景 | 操作 |
|---|---|
| 不想用了 / 怕暴露 | 停服务：`sc.exe stop cloudflared`；或 Cloudflare 控制台删 Access 应用（立即阻断访问） |
| 临时彻底关闭公网 | Zero Trust → Access → Applications → 删除该应用 + 控制台删掉 `ai.<你的域名>` 的 DNS 记录（或把 Proxy 改灰云） |
| 隧道连不上 | 先 `sc.exe stop cloudflared` 再 `sc.exe start cloudflared`；看事件查看器日志 |
| cloudflared 版本过旧 | `winget upgrade cloudflare.cloudflared` 后重启服务 |
| 换电脑/重装 | 重新 `cloudflared tunnel login` + `cloudflared tunnel run jobhunt`（隧道凭据在 .cloudflared 目录，备份它） |
| 域名被占用/子域冲突 | 换一个子域（如 `agent.<你的域名>`），改 config.yml + 重新 route dns |

---

## 10. 安全自查清单（配完必过）

- [ ] `ai.<你的域名>` 未登录时访问 → Access 登录页（不是 DSH 页面）✅
- [ ] 非本人邮箱访问 → 被拒 ✅
- [ ] DNS 记录为 Proxied（橙色云朵），源站 IP 不暴露 ✅
- [ ] 手机流量（非 WiFi）能正常进入 DSH GUI ✅
- [ ] 电脑重启后（或手动重启服务后）隧道自动恢复 ✅
- [ ] 地址只存在自己手机/备忘录，**不发给任何人** ✅

---

## 附：常见问题

- **Q：没有域名能用吗？** 临时测试可用 `cloudflared tunnel --url http://127.0.0.1:3080`（trycloudflare 临时域名），但无 Access 认证、域名随机，**正式使用必须有托管域名**。
- **Q：Access 免费吗？** 免费版支持 50 个用户以内的 Access 策略，个人用完全够。
- **Q：手机进 DSH GUI 卡？** 多为手机流量网络问题，页面是轻量的；也可在电脑端 ToDesk 确认 DSH 是否正常运行（`npm run ai:proxy` + DSH 服务）。
- **Q：多个端口也要暴露？** 在 config.yml ingress 里加一条 `- hostname: xxx.<你的域名> / service: http://127.0.0.1:<端口>`，并在 Access 里给新子域加应用。

*指南按 2026-08 Cloudflare 控制台路径编写，界面若改版以控制台实际为准；操作前提见《远程访问计划》§2.2（本地私有文档）。*
