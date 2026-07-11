---
name: disk-scan
description: 只读扫描 macOS 磁盘占用，专门拆解储存面板里笼统的 "System Data" 分类：Docker、Xcode 缓存（DerivedData / iOS DeviceSupport / CoreSimulator）、包管理器缓存（npm/yarn/pnpm/homebrew）、~/Library/Caches 与 ~/Library/Logs、iOS 本地备份、Time Machine 本地快照、休眠镜像、/private/var/folders 临时文件、各 App 的 Application Support 目录、容器/沙箱工具（Apple container / colima / lima），产出按大小排序的汇总表并逐项给出是否可清理的判断。绝不删除或修改任何文件，只做统计。Use when asked to "扫描硬盘"、"磁盘占用"、"System Data 都是什么"、"清理空间前先看看占用"、"disk usage"、"scan disk"、"check disk space"。
license: MIT
compatibility: macOS（依赖 du / df / tmutil 等系统自带命令）。纯只读，不需要额外依赖或权限提升。
metadata:
  author: zilin
  version: "1.0"
  source: 抽取自一次真实的 "System Data 142G 占用排查" 会话
---

对 macOS 磁盘占用做一次**只读**排查，专门解决储存面板里 "System Data" 这类笼统分类看不出具体是什么占用的问题。**只统计，不清理**——清理是独立的、需要逐项确认的后续步骤，本 skill 本身不执行任何删除/移动操作。

## 执行步骤

1. 运行本 skill 目录下的扫描脚本（纯只读，只用 `du` / `df` / `tmutil listlocalsnapshots` 等命令）：

   ```bash
   bash ./scripts/scan.sh
   ```

   脚本路径全部基于 `$HOME`，任意 macOS 账户下直接跑即可；某个目录不存在时会输出 `(不存在)`，属于正常情况，跳过即可。

2. 把输出整理成一张按大小降序的表格（只列 1G 以上的项，避免噪音），每行包含：
   - 大小
   - 路径
   - 一句话说明这是什么（例如「Xcode 连接过的设备调试符号文件」「pnpm 全局包存储」「浏览器缓存」）

3. 对每个大户给出简要判断：
   - **可安全清理**：缓存类、可重建的数据（如 npm/pnpm 缓存、Xcode DerivedData），说明清理后的代价（比如下次装包会变慢）
   - **系统托管、不建议手动动**：如 sleepimage（休眠镜像，大小约等于内存容量）
   - **需要用户自行确认内容**：`~/Library/Containers`、各 App 的 `Application Support` 目录体积大但内容复杂（可能是正经数据），不要笼统建议删除

4. **不要在本 skill 内执行任何清理命令。** 如果用户看完汇总后要求清理某几项，把清理当作独立操作处理：说明具体会删什么、是否可恢复，逐项确认后再执行。

## 扫描覆盖范围

`scripts/scan.sh` 统计以下 10 类：

1. Docker 占用（`docker system df`，未安装则跳过）
2. Xcode 相关缓存（DerivedData / iOS DeviceSupport / Archives / CoreSimulator）
3. 包管理器缓存（npm / yarn / pnpm / homebrew）
4. `~/Library/Caches` 子目录 Top 20 + `~/Library/Logs`
5. iOS 设备本地备份（`~/Library/Application Support/MobileSync/Backup`）
6. Time Machine 本地快照
7. 休眠镜像（`/private/var/vm/sleepimage`）
8. `/private/var/folders` 临时文件总大小
9. 各 App 的 `Application Support` 目录 Top 15
10. 容器/沙箱工具（Apple container / `~/Library/Containers` / colima / lima）
