# 專案目錄結構

本文件從屬於 [專案主規範](../AGENTS.md)，定義目錄用途與文件歸屬。新增或調整目錄時同步更新結構樹；`project-root/` 代表實際專案根目錄，無須另建同名資料夾。

```text
project-root/
├── AGENTS.md                   # 主規範：核心原則、規範優先序與細部規範索引
├── .agent-rules/               # 從屬規範：依主題補充主規範
│   ├── project-structure.md    # 專案目錄結構與用途說明（本文件）
│   ├── tech-stack.md           # 技術堆疊規範，初始化時留空
│   └── tracking.md             # 格式化工作日誌、交接與手動 Git 收尾規範
├── docs/                       # 專案文件
│   ├── architecture/           # 架構設計、系統邊界與技術決策
│   ├── requirements/           # 需求、使用情境與驗收條件
│   ├── research/               # 案例研究、技術調查與方案比較
│   └── tracking/               # 執行追蹤與協作紀錄
│       ├── handoff/            # 交接摘要、目前狀態與待辦事項
│       └── worklog/            # 工作紀錄、執行結果與驗證證據
└── publish/                    # 整理完成、供對外使用的發布內容
    └── skills/                 # 可發布、重用的技能定義與配套資源
```
