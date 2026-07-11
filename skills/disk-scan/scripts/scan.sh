#!/bin/bash
# 只读扫描脚本：统计常见 macOS "System Data" 占用大户，不修改/不删除任何文件。
set -u

hr() { printf '%s\n' "----------------------------------------"; }
section() { hr; echo "## $1"; hr; }

echo "扫描时间: $(date)"
echo "当前磁盘总览:"
df -H / 2>/dev/null
echo

section "1. Docker 占用 (若已安装)"
if command -v docker >/dev/null 2>&1; then
  docker system df 2>/dev/null || echo "docker 命令存在但守护进程可能未运行"
else
  echo "未安装 docker CLI"
fi

section "2. Xcode 相关缓存"
for d in \
  "$HOME/Library/Developer/Xcode/DerivedData" \
  "$HOME/Library/Developer/Xcode/iOS DeviceSupport" \
  "$HOME/Library/Developer/Xcode/Archives" \
  "$HOME/Library/Developer/CoreSimulator/Devices" \
  "$HOME/Library/Developer/CoreSimulator/Caches"
do
  if [ -d "$d" ]; then
    du -sh "$d" 2>/dev/null
  else
    echo "(不存在) $d"
  fi
done

section "3. 包管理器缓存 (npm/yarn/pnpm/homebrew)"
for d in \
  "$HOME/.npm" \
  "$HOME/.cache" \
  "$HOME/Library/Caches/Yarn" \
  "$HOME/Library/pnpm/store" \
  "$HOME/Library/Caches/Homebrew" \
  "/opt/homebrew/Caches" \
  "/usr/local/Caches"
do
  if [ -d "$d" ]; then
    du -sh "$d" 2>/dev/null
  else
    echo "(不存在) $d"
  fi
done

section "4. 用户级缓存 / 日志 (Top 20 子目录，按大小排序)"
if [ -d "$HOME/Library/Caches" ]; then
  echo "-- ~/Library/Caches 子目录 Top 20 --"
  du -sh "$HOME"/Library/Caches/* 2>/dev/null | sort -rh | head -20
fi
if [ -d "$HOME/Library/Logs" ]; then
  echo
  echo "-- ~/Library/Logs 大小 --"
  du -sh "$HOME/Library/Logs" 2>/dev/null
fi

section "5. iOS 设备本地备份"
BACKUP_DIR="$HOME/Library/Application Support/MobileSync/Backup"
if [ -d "$BACKUP_DIR" ]; then
  du -sh "$BACKUP_DIR" 2>/dev/null
  echo "各备份子目录:"
  du -sh "$BACKUP_DIR"/* 2>/dev/null
else
  echo "(不存在) $BACKUP_DIR"
fi

section "6. Time Machine 本地快照"
tmutil listlocalsnapshots / 2>/dev/null || echo "无法获取快照列表 (可能需要权限)"

section "7. 休眠镜像 (sleepimage)"
if [ -f "/private/var/vm/sleepimage" ]; then
  ls -lh /private/var/vm/sleepimage 2>/dev/null
else
  echo "(不存在或无权限查看) /private/var/vm/sleepimage"
fi

section "8. /private/var/folders 临时文件总大小"
du -sh /private/var/folders 2>/dev/null || echo "无权限或不存在"

section "9. 常见 App 数据目录 (聊天/浏览器/IDE 等，Top 15)"
if [ -d "$HOME/Library/Application Support" ]; then
  du -sh "$HOME"/Library/"Application Support"/* 2>/dev/null | sort -rh | head -15
fi

section "10. 容器化/沙箱工具 (Apple container, colima 等)"
for d in \
  "$HOME/.container" \
  "$HOME/Library/Containers" \
  "$HOME/.colima" \
  "$HOME/.lima"
do
  if [ -d "$d" ]; then
    du -sh "$d" 2>/dev/null
  else
    echo "(不存在) $d"
  fi
done

hr
echo "扫描完成。以上均为只读统计，未做任何修改或删除。"
