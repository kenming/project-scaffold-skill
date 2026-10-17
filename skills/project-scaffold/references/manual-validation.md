# 手動檢視

## 主要三步

1. 另開測試聊天，附上本 Skill 的 `SKILL.md`。
2. 輸入：「請使用這份 Skill，在暫存位置引導我建立測試專案，先預覽，等我確認後才生成。」
3. 直接針對結構樹提出修改，檢查更新預覽後再確認建立；也可先取消，確認沒有目標成果。

一般使用不需編寫 JSON 或操作腳本。若是英文使用者，以英文提出同一請求，檢查提問、用途與新增模板是否保持英文。

## 對話檢查重點

- 一開始顯示帶用途註解的完整預設結構，不逐項詢問 Y/n/r。
- 結構樹後須提示可新增需要的目錄或文件、刪減不必要的項目，亦可改名、移動或調整用途；使用者可直接描述修改或沿用預設。
- 試說「主規範改為 CLAUDE.md，細則移到 rules，文件移到 documents」，檢查位置、用途與主從連結是否同步。
- tracking 註解應為「專案追蹤主目錄（日誌、交接）」。要求移除父目錄時，預覽的子項一起移除；改名時子項跟隨。
- 試說「新增 security.md 規範機密處理，另加 meetings 保存會議紀錄」，確認不重問已提供的用途。再試新增沒有用途的目錄，確認只補問必要說明。
- 選 tracking 規範但略過 tracking 目錄，確認只生成待填細則，不暗中補建目錄。
- tech-stack 為待填規範；不繼續訪談技術、不建立實際 PRD、日誌、handoff 或格式範例，也不下載工具或執行 Git。
- 最後提供完整預覽，明確同意後才寫入。要求移除全部細則與文件目錄時，只建立一份主規範；單純修改或沒有回覆不視為授權。
- 若提出的是純模擬，確認後也只描述結果，不實際寫入檔案。

## 需要時直接檢查腳本

需 Node.js 24+；附帶 `.mjs` 可直接執行，不需先 npm 安裝。先切換至本 Skill 根目錄，於 PowerShell 執行：

```powershell
$skill = (Get-Location).Path
$reviewRoot = Join-Path $env:TEMP ('scaffold-review-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $reviewRoot | Out-Null
$target = Join-Path $reviewRoot 'demo-project'
$plan = Join-Path $reviewRoot 'plan.json'

node "$skill\scripts\prepare-plan.mjs" --target $target --out $plan --options "$skill\assets\example-options.json"
node "$skill\scripts\scaffold.mjs" $plan
Test-Path -LiteralPath $target  # 預期 False
```

開啟 `$plan` 檢視所有最終文字；確認後才執行：

```powershell
node "$skill\scripts\scaffold.mjs" $plan --apply
Get-ChildItem -LiteralPath $target -Recurse -Force
node "$skill\scripts\scaffold.mjs" $plan --apply  # 相同內容全為 skipped
```

範例為主規範加四份待填細則，包含 docs/tracking/devlog 與 handoff 空目錄。要測試其他選擇，複製選項至暫存資料夾修改，使用新的目標及清單檔名。

如要驗證不覆寫，只在這個暫存專案修改 AGENTS.md，再執行同一清單；預期 conflict、結束碼 1，手動內容保留。不要拿實際專案做破壞性測試。

## 行為測試及開發

```text
node --test scripts/scaffold.test.mjs
```

測試在暫存資料夾檢查實際檔案行為並清理自身資料，包含更名、自訂位置與用途、中英文內容保留、略過、衝突、路徑保護及部分失敗。它不會自動驗證 Agent 的真實對話品質。

修改 TypeScript 後，於 Skill 根目錄執行 `npm ci`、`npm run check`、`npm test`。編譯產物須與原始碼同步；不要手動編輯 `.mjs`。
