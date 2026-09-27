# 小籠包 PWA 驗收

## 2026-09-27 透明高清素材補交驗收

對 production preview `http://127.0.0.1:4173/`、service worker `60f67dd7ed7d0c0b637c`（58 個快取檔）以全新 Chromium 環境執行 `tests/e2e/transparent-assets.spec.js`：5 項全通過，32.1 秒。18 張補交素材核對原檔 SHA-256／尺寸（含備選蒸汽），23 張既有素材位元未變。

360×640、768×1024、1920×1080 完整通關，涵蓋滿／空勺、水壺、碗狀態、肉餡落下、蒸籠前後遮擋、新爐與火、最新單束蒸汽、HTML 數字與圓環圓心、進場後完整五秒、手動 Next、半尺寸按鈕至少 56×56 點擊區及重玩。確認素材已快取後斷網重載，18 張皆可讀取且 SHA 一致，完整流程通過。33 張截圖在 `output/playwright/transparent-assets-results/`，早期完整流程報告保留未覆寫。

16 項狀態機單元測試通過。此次只更新素材呈現，不修改計時器、流程、提示文字或按鈕大小。下方實機安裝、Safari／Android 與觸控筆等項目仍為待實機驗證。

## 執行自動驗收

測試必須連到 **production build**，因為開發模式不註冊正式離線快取。先在一個終端執行：

```sh
npm install
npx playwright install chromium
npm run build
npm run preview
```

保持預覽服務執行，再在另一個終端執行：

```sh
npm test
npm run test:e2e
```

預設測試網址為 `http://127.0.0.1:4173`。可用 `PLAYWRIGHT_BASE_URL` 指定另一個已啟動的正式預覽；若使用本機 Chrome，可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指向其可執行檔。測試設定不會自動啟動伺服器，以免誤用開發模式驗收離線功能。

測試報告存於 `output/playwright/report/index.html`；指定尺寸的完成頁截圖、失敗追蹤與影片存於 `output/playwright/results/`。重新查看 HTML 報告：

```sh
npx playwright show-report output/playwright/report
```

## 自動驗收涵蓋

| 項目 | 驗收方式 |
| --- | --- |
| 完整流程與重玩 | 封面 → 加麵粉 → 加水 → 揉麵 3 次 → 加餡 → 包起來 3 次 → 入籠 → 開始蒸 → 倒計時 → Done!／做好啦！；各步完成後停留原步，按 Next／下一步才前進。再做一次回到封面，清除操作與倒計時狀態 |
| 防止提早完成 | 入場動畫結束、進入 countdown 階段後使用真實時間；4.1 秒時仍不顯示 Next，至少經過約 5 秒才可前進（觀測斷言保留 0.2 秒輪詢誤差）。一般與 reduced-motion 都驗證完整 5 秒 |
| 倒計時內容 | 記錄數字順序為 5→4→3→2→1，不出現 0；完畢仍停留第 8 步，等待 Next。時鐘頁不顯示主要操作按鈕，檢查圖片來源／替代文字無包子、麵糰、蒸籠、爐子，並留存時鐘頁截圖供視覺驗收 |
| 防重複觸發 | 對麵粉與揉麵連續快速點擊，確認不跳步、不一次消耗多次揉麵 |
| 長按與連續手勢 | 真實 Enter 按下不放，跨越動作完成與 Next 自動聚焦後仍停留原步；驗證 Space 重複事件被阻止、放開後可正常操作。以真實 pointer 滑動揉麵一次，緊接第一個點擊須算第二次，不能被吞掉 |
| 暫停與回首頁 | 模擬 `document.hidden`／`visibilitychange` 及實際開啟確認框，各等待超過 5 秒，確認倒計時不變；繼續製作後恢復，確認回首頁後重設 |
| 輸入方式 | 完整滑鼠流程、完整鍵盤 Enter 流程與 Space 重玩、完整觸控事件模擬流程；iOS user-agent 模擬下的安裝入口在倒計時頁不可見且不可 Tab 聚焦 |
| 版面 | 360×640、768×1024、1920×1080、844×390 橫向；逐步確認沒有頁面溢出、舞台可見、主要操作與 Next 按鈕完整可見且至少 56×56 CSS px |
| 減少動態效果 | 模擬系統 reduced-motion，確認每個操作與倒計時仍可完成 |
| PWA 基本資料 | 正式 manifest、standalone 模式、192 與 512 圖示、maskable 圖示宣告 |
| 完整離線可玩 | 等快取 ready 與 service worker 接管後斷網，重載、重新導覽，再完成整個流程 |
| 素材與程式 | 完整線上及離線流程不出現 JS 錯誤、素材請求失敗或 HTTP 錯誤，畫面上的圖片完成載入 |
| 獨立視窗程式分支 | 以 `navigator.standalone` 模擬獨立執行，確認無安裝按鈕且可做完整流程；此項不代表實際 OS 安裝成功 |

所有流程經正式 UI 進行；產品程式不提供跳步、縮短倒計時或修改遊戲狀態的測試入口。`game-shell` 的 `data-step`／`data-phase` 僅用於讀取畫面狀態。隱藏頁面與獨立視窗模擬、倒計時 DOM 觀察器只注入到測試瀏覽器環境。入場時間為一般 420ms、reduced-motion 120ms；精確邊界交由確定性狀態機單元測試，瀏覽器測試驗證入場後的完整可見倒計時。

## 待實機驗證

以下項目不能以桌面自動化的裝置模擬宣稱已完成。

| 裝置／情境 | 操作與通過標準 | 狀態 |
| --- | --- | --- |
| iPhone Safari 安裝 | 透過分享選單加入主畫面；由圖示開啟，確認獨立視窗、正確圖示、瀏海與底部安全區無遮擋 | 待實機驗證 |
| iPad Safari 安裝 | 加入主畫面並由圖示開啟；直向與橫向完成一次遊戲，確認版面、中文字型與手指觸控 | 待實機驗證 |
| Android Chrome 安裝 | 使用瀏覽器實際安裝流程，確認原生安裝提示、桌面圖示、獨立視窗與返回操作 | 待實機驗證 |
| 桌面 Chrome／Edge 安裝 | 從瀏覽器安裝並由 OS 開啟，確認視窗、圖示、啟動網址及可完成全部步驟 | 待實機驗證 |
| 實際觸控與手勢 | 手指點擊、長按、連點、系統邊緣手勢，不誤觸、不跳步；旋轉後仍可操作 | 待實機驗證 |
| 實際背景暫停 | 倒計時時鎖屏或切換 App 超過 5 秒，再返回；倒計時從暫停位置繼續 | 待實機驗證 |
| 已安裝 App 的飛航模式 | 先等完整離線快取就緒，關閉 App、開飛航模式，再從桌面圖示重新開啟並完成一輪 | 待實機驗證 |
| 系統動態效果設定 | 開啟 OS「減少動態效果」設定後使用已安裝 App，確認操作回饋與畫面舒適度 | 待實機驗證 |
| 語音輔助與字體 | VoiceOver／TalkBack 讀出步驟、按鈕及倒計時，字體放大後仍能理解並操作 | 待實機驗證 |

安裝與首次完整快取需要 HTTPS（本機 localhost 可作開發例外）。首次離線造訪、使用者清除網站資料或瀏覽器回收快取後，不應宣稱可直接離線啟動；需在線重新完成快取。

## 本次執行紀錄

2026-09-24 已對 `http://127.0.0.1:4173` 的最終交付 build（service worker 版本 `f2d2c0ab0acde6299a2e`，35 個快取檔案）使用全新瀏覽器環境完成驗收：**15 項全部通過，約 2.7 分鐘**。本次結果已包含最新入場倒計時修正、蒸籠蓋與蒸汽分層素材。環境為 macOS、Playwright 1.63.0、Google Chrome for Testing 149.0.7827.55（headless），兩個並行 worker。包含 Enter／Space 長按保護、真實橫滑揉麵後立即點擊，以及 iOS 安裝入口在倒計時頁的焦點排除檢查；四個尺寸皆確認主要操作與 Next 按鈕至少 56×56 CSS px。

本機已快取 Chromium 1228，因此使用既有執行檔；預設 Playwright 所需的新版瀏覽器尚未下載。重現本次環境的指令：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/absolute/path/to/chrome-headless-shell' npm run test:e2e
```

此機的受限沙箱會阻擋 Chromium macOS 啟動通訊；本次透過測試命令的執行核准成功運行。這是測試環境限制，並非產品流程失敗。

截圖已產出：

- `output/playwright/results/game-all-playable-stages-fit-360×640-chromium/finished-360x640.png`
- `output/playwright/results/game-all-playable-stages-fit-768×1024-chromium/finished-768x1024.png`
- `output/playwright/results/game-all-playable-stages-fit-1920×1080-chromium/finished-1920x1080.png`
- `output/playwright/results/game-all-playable-stages-fit-844×390-chromium/finished-844x390.png`
- `output/playwright/results/game-explicit-Next-flow-fu-779cb-out-runtime-or-asset-errors-chromium/countdown-clock-only.png`

測試通過範圍包括實際斷網後重載、導覽與完成製作，以及一般／減少動態效果下完整五秒倒計時。以上「待實機驗證」項目尚未進行；standalone 與觸控的自動化通過結果均為瀏覽器環境模擬，不代表實際安裝或實際裝置已驗收。

## 2026-09-27 收口、麵皮與封面素材驗收

對 production preview `http://127.0.0.1:4173/` 的 service worker `33a9cde3f04ac6fd6230`（63 個快取檔；`index-B_308Z95.js`），以全新 Chromium 環境執行 `wrapping-assets.spec.js`、`finished-hd.spec.js`、`transparent-assets.spec.js`：**15 項全部通過，1.3 分鐘**。本段為這次三組瀏覽器測試的結果，不把上方歷史完整回歸或真實裝置項目視為本次重新執行。

- 三張收口圖與新增 `wrapper-hd.png`、`cover-basket-hd.png` 均核對提供的 SHA-256 與 PNG 尺寸；原本素材雜湊檢查保留，未放寬斷言。
- 360×640、768×1024、1920×1080：第 5 步初始為麵皮與肉餡；三次操作依序只留下 `wrap-1-hd`、`wrap-2-hd`、`wrap-3-hd` 的 opacity 1。逐幀觀察確認僅相鄰兩層交叉淡化、透明度總和為 1；每次送出 8 次真實滑鼠快速點擊仍只完成一次，第三次完成才出現 Next，而且不自動跳步。
- 第 6 步維持原 `bun-hd.png` 的位元與尺寸；新封面只在第 0 步，新麵皮用在第 4、5 步。主要操作及 Next 仍為半尺寸視覺、至少 56×56 CSS px 點擊區。
- 快取就緒後實際斷網、重載，再讀取新素材核對 SHA 並完成操作。既有完整流程亦通過進場後完整五秒、5→4→3→2→1、手動 Next 與重玩。

75 張截圖保存於 `output/playwright/wrapping-assets-results/`，包含三尺寸的新封面、麵皮、收口 count 0／1／2／3、未變更的第 6 步，以及既有高清流程；此前報告未覆寫。新素材重點截圖目錄：

- `wrapping-assets-three-orde-1a5c7-apid-clicks-and-fit-360×640-chromium/`
- `wrapping-assets-three-orde-312bd-pid-clicks-and-fit-768×1024-chromium/`
- `wrapping-assets-three-orde-2a6cd-id-clicks-and-fit-1920×1080-chromium/`

各目錄的檔名包含 `step-0-new-cover`、`step-4-new-wrapper`、`step-5-count-0` 至 `step-5-count-3`、`step-6-unchanged-bun` 與對應尺寸。重現指令：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/absolute/path/to/chrome-headless-shell' npm run test:e2e -- tests/e2e/wrapping-assets.spec.js tests/e2e/finished-hd.spec.js tests/e2e/transparent-assets.spec.js --output=output/playwright/wrapping-assets-results --reporter=list
```

本輪未執行實際 OS 安裝、iPhone／iPad／Android 實機或觸控筆驗收；其狀態仍為「待實機驗證」。PWA 更新與狀態機另有獨立驗收，未混入上述 15 項統計。

## 2026-09-27 僅第 7 步順序動畫驗收

對 production preview 的 service worker `e38667ca65d5a24e252a`（`index-D07Lj3Fl.js`、`index-C8yq1qjG.css`），在獨立全新 Chromium 環境執行 `tests/e2e/steaming-sequence.spec.js`：**7 項全部通過，47.9 秒**。本輪只驗收第 7 步；前面步驟僅用正式 UI 導覽至第 7 步，未重新分析或宣稱重驗整個專案，也未操作使用者既有預覽環境。

- 六張爐子、火苗、開口蒸籠、完成收口包子、蒸籠蓋與單束蒸汽 PNG 的原始 SHA-256／尺寸未變；第 7 步不再顯示舊完成圖或閉合蒸籠組件。
- 360×640、768×1024、1920×1080：初始只見爐子；點擊後依原始 progress 觀察火苗 `.08–.23`、蒸籠 `.24–.40`、包子 `.43–.61`、蓋子 `.63–.81` 的淡入。包子不淡出，由蒸籠前側與蓋子按繪製順序遮擋。
- 10 束蒸汽常駐 DOM，前後兩批依指定時點出場，最終全部可見；外層由 1 倍增長至 1.5 倍，內層保留原本起伏。一般模式 4800ms 動作與 450ms 收尾完成前沒有 Next；完成後仍留在第 7 步，手動 Next 才前進。
- 真實滑鼠 8 次快速連點不會跳步；回首頁確認框開啟 800ms 期間，動畫 progress 與各層透明度保持不變，關閉後继续。reduced-motion 的 120ms 動作加 180ms 收尾仍顯示完整組合及 10 束蒸汽。
- 等快取就緒後斷網重載，六張 PNG 可讀取且雜湊一致，第 7 步順序仍可完成。三尺寸操作與 Next 保留半尺寸外觀、至少 56×56 CSS px 點擊區，沒有頁面溢出。

9 張截圖保存於 `output/playwright/steaming-sequence-results/`，每尺寸含初始爐子、包子入籠／蓋子落下前、完成蒸煮三張。768 尺寸的優先目視檔案：

- `steaming-sequence-step-7-o-167c9--growing-steam-fit-768×1024-chromium/step-7-bun-before-lid-768x1024.png`
- `steaming-sequence-step-7-o-167c9--growing-steam-fit-768×1024-chromium/step-7-ready-768x1024.png`

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/absolute/path/to/chrome-headless-shell' npm run test:e2e -- tests/e2e/steaming-sequence.spec.js --output=output/playwright/steaming-sequence-results --reporter=list
```

`transparent-assets.spec.js` 的第 7 步舊預期已按新組件與 10 束蒸汽更新，僅做語法檢查，本輪未執行該完整 suite。上述實機安裝與裝置驗收仍為「待實機驗證」。
