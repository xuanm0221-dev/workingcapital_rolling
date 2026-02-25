@echo off
chcp 65001
cd /d "d:\dashboard\재무제표(simu)"
git add -A
git status
git commit -m "feat: 전체 탭 MLB+MLB KIDS+DISCOVERY 집계, 전체 탭 수정 비활성화, ACC 범례/저장 버그 수정"
git push wc HEAD:main
echo Done
