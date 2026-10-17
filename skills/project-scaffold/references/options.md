# 已確認選擇與生成清單

這是 Agent 內部的資料橋接，不是給使用者填寫的問卷。依結構樹預覽及使用者自然語言修改，準備最新文字與清單。腳本不解析對話、不決定語言、不進行訪談。

## 輸入

`--target` 指定已確認的專案位置，`--out` 為目標外的暫存清單。`--options` 必填，內容如下：

| 欄位 | 說明 |
| --- | --- |
| `main.name` | 根目錄唯一主規範 Markdown 檔名，不能含子目錄；通常 AGENTS.md 或 CLAUDE.md。 |
| `main.description` | 使用者語言的主規範用途，單行非空白。 |
| `main.content` | 已整理的主規範文字。有細則時必須含 `{{RULE_INDEX}}`；全部略過時移除不必要的空白表格。 |
| `rulesRoot` | 規範區的專案內相對位置，不以 `/` 結尾，例如 `.agent-rules` 或 `settings/rules`。 |
| `docsRoot` | 文件區的專案內相對位置，例如 `docs` 或 `documents`。 |
| `rules` | 只列使用者選定的細則，每項包含 `name`、`description`、`content`；全略過時為 `[]`。 |
| `directories` | 只列使用者選定的文件目錄，每項包含相對 docsRoot 的 `path` 與用途 `description`；全略過時為 `[]`。 |

每份細則內容須含 `{{MAIN_LINK}}`，以產生指向實際主檔的連結。檔名必須為單層 Markdown 檔名；目錄 path 可以含父子層級，例如 `progress/journal`。每項 description 為單行、非空白用途，不翻譯使用者原文、不塞入換行。

父目錄的用途需要列入獨立項目，例如先列 progress「追蹤主目錄（日誌）」，再列 progress/journal「開發日誌」。沒有描述的隱含父目錄可以建立，但不由腳本猜測用途。

規範區與文件區都沒有選項時，只建立主規範，不為 roots 建立空殼。rules 與 directories 不互相強制啟用；名稱或路徑碰撞會回報錯誤。

## 四個標記

| 標記 | 展開結果 |
| --- | --- |
| `{{RULE_INDEX}}` | 實際細則的 Markdown 表格資料列；欄位標題由 Agent 提供。 |
| `{{MAIN_LINK}}` | 相對於目前細則位置的主規範路徑，處理改名、深層位置及 URL 編碼。 |
| `{{DESCRIPTION}}` | 該份文件的用途原文。 |
| `{{TREE}}` | 本次選定的目錄樹，包含規範與目錄用途註解。 |

只有放入 `{{TREE}}` 的文件會收到目錄樹；目錄結構細則即使改名也用同一標記。略過結構細則時，prepare-plan 的輸出仍提供 tree，供最終預覽使用。

內容不由腳本翻譯；Agent 在處理前已用對話語言撰寫。不要再傳入舊版的 tracking、git、requirements、techStack、timezone 等欄位，也不要以提供內容為由加入安裝、Git、技術決策或成果文件排版。

參考 [選擇範例](../assets/example-options.json)。它只用來手動驗證預設組合；實際 Agent 必須根據使用者回答建立自己的選擇，不直接使用範例覆蓋回答。

## 正式生成

prepare-plan 只寫目標外的清單，回傳其路徑、目標、tree 與檔案清單。正式清單仍為 `{ target, directories, files }`，files 含最終 `path` 與 `content`，供 scaffold 讀取。

預覽與 apply 都檢查路徑及既有資料。不同既有內容不覆寫，相同內容略過。Agent 仍須檢查語意、模板範圍及連結；這不是腳本能替代的工作。自訂內容若依賴未選目錄，先向使用者指出矛盾。
