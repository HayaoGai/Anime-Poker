---
name: readme
description: 找出最後一次更新 README.md 的 commit，比對它之後到最新 commit 的所有變更，若與 README.md 內容有出入就更新 README.md，沒有就不動。不 commit。使用者輸入 /readme 時使用。
---

# /readme

讓 README.md 跟上最近的 commit。只看「README.md 最後一次被更新之後」的 commit，檢查這段期間的變更有沒有讓 README 的描述過時或缺漏。

## 步驟

1. **找出基準點**

   ```bash
   git log -1 --format='%h %s' -- README.md
   ```

   - 這個 commit 就是基準點，記為 `<base>`。
   - 若 README.md 從未被 commit 過，停下來告訴使用者，不要自行建立 README。

2. **列出基準點之後的 commit**

   ```bash
   git log --oneline <base>..HEAD
   ```

   - 若沒有任何 commit（基準點就是 HEAD），回報「README.md 已是最新，無需更新」並結束。

3. **讀懂這段期間改了什麼**

   ```bash
   git diff --stat <base>..HEAD
   git log --format='%h %s%n%b' <base>..HEAD
   git diff <base>..HEAD -- <重點檔案>
   ```

   先看 commit 訊息與 `--stat` 掌握範圍，再針對可能影響 README 的檔案看細節。要真的讀懂改了什麼，不要只憑 commit 標題猜測。

4. **比對 README.md**

   讀完整份 README.md，逐段檢查是否有以下出入：

   - 描述的功能、規則、操作方式已被改掉或移除
   - 新增了使用者看得到的功能，README 該提卻沒提
   - 建置、部署、執行指令或環境需求有變
   - 專案結構、檔案路徑、設定值與現況不符

   純內部重構、效能調整、與 README 現有內容無關的細節，不算出入。README 本來就沒寫到的層級，不要硬加進去。

5. **更新或不動**

   - **沒有出入**：不修改任何檔案，回報「檢查了 N 個 commit，README.md 與現況一致，無需更新」。
   - **有出入**：直接編輯 README.md，只改有出入的部分，沿用原本的段落結構、語氣與格式（繁體中文）。不要順手重寫無關段落。

6. **收尾**

   有更新時：

   ```bash
   git diff --stat
   ```

   條列回報改了哪些地方、各自對應哪個 commit 的變更。**不要 commit**，交給使用者確認後再用 `/commit` 提交。

## 規則

- 只修改 README.md，不碰其他檔案。
- 比對範圍只限 `<base>..HEAD` 的已提交變更，不看工作區未提交的變更。
- 不 commit、不 push。
