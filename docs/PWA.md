# 安裝與離線

遊戲不用安裝也可以完整遊玩。首次使用請保持連線，等畫面顯示「已可離線遊玩」後再中斷網絡。載入中、下載失敗及瀏覽器不支援離線時，介面會分別提示；失敗時可連線後重試。

- iPhone／iPad Safari：點「分享」→「加入主畫面」。若系統提供「以網頁 App 開啟」，保持開啟。
- 支援安裝的 Chrome／Edge 等瀏覽器：遊戲收到瀏覽器的安裝能力事件後才會顯示安裝入口；也可使用瀏覽器本身的安裝選項。
- 未提供安裝入口的瀏覽器：直接開啟網頁遊玩。

此版本不包含 App Store／Google Play 上架，也不強制全螢幕或螢幕方向。

## 本機驗證

```sh
npm install
npm run build
npm run preview
```

在本機瀏覽器開啟 `http://localhost:4173`。離線與安裝測試必須使用正式建置的 preview；`npm run dev` 不註冊 Service Worker，會顯示開發模式。

正式部署請完整上傳 `dist/` 至 HTTPS 靜態主機。可以部署在根目錄或帶結尾斜線的子目錄，例如 `https://example.com/buns/`。局域網的普通 HTTP 位址能測一般介面，但不能作為手機安裝／離線驗收；跨裝置驗證請用 HTTPS。

## 快取與更新行為

建置完成後，`scripts/build-sw.mjs` 讀取 `dist/` 中所有發佈素材，包含 JavaScript、CSS、圖片、字型、首頁、manifest 和圖示，依內容建立版本。所有下載均成功寫入快取後才寫完成標記；每次回報離線就緒還會確認所有必要項目存在。一個素材下載失敗不會被誤報成可離線。

遊戲使用同一版本的首頁及素材。啟動、回到前景及重新連線時檢查更新；新版必須完整快取，才可由頁面要求套用。頁面只在可見的封面、且沒有開啟對話框時套用並重新載入一次；第 1～9 步不會因此跳關或重設，返回封面後才更新。另一分頁若仍在製作，會保留該分頁對應版本的素材；新版控制器接管本身不會重新載入該分頁。

Service Worker 以持久化的 client→version 記錄維持多分頁版本，保留使用中與前一版快取，之後啟用新版時才移除本遊戲範圍內已無客戶端使用的更舊快取。它不清除其他網站資料、localStorage 或遊戲狀態。若瀏覽器清除儲存空間或使用者手動清除網站資料，需要重新連線完成快取。

### 由舊版更新協定首次遷移

修復前的頁面不認識「套用更新」協定；若它已由舊快取載入，單靠新版尚未執行的 JavaScript 不能安全判斷遊戲是否在進行。新版 worker 會詢問前版的離線狀態；只有明確收到舊版回覆（有版本號、尚無 `protocol` 欄位）時，才在完整快取後進行一次自動接管。它不導航、不重新載入任何視窗，並保留每個既有分頁對應的舊素材。首次開啟後，等素材準備好，在已確認是封面的分頁按瀏覽器的一般「重新整理」，即可載入修復後的頁面；無須再次關閉分頁、執行自訂 JavaScript、解除註冊或清空資料。

新版回覆帶有 `protocol: 2`，之後版本不再走上述例外，一律由新 hook 在封面送出 `APPLY_UPDATE`，再次確認完整快取後才套用及重載。若前版未回覆／無法辨認，安裝會中止並保留目前版本，不能冒然強制接管。

`localhost:4173` 與 `127.0.0.1:4173` 是不同 origin，安裝、Service Worker 與快取互不共用。除錯和日常遊玩應固定使用同一網址。加 `?refresh=...` 不會繞過離線 worker 的首頁快取。

`usePWA({ canReload })` 提供 `cacheState`（`loading`／`ready`／`error`／`unsupported`／`development`）、`isOffline`、`canInstall`、`isIOS`、`standalone`、`install()` 與 `retryOffline()`。App 只在 `step === 0 && !paused` 時允許重載。遊戲動畫和倒數由遊戲本身管理，此 hook 不修改遊戲進度。

## 驗證範圍

`tests/e2e/pwa-update.spec.js` 使用臨時 build、獨立本機 port 與獨立 Chromium context，不會清除使用者瀏覽器的快取。2026-09-27 五項實際瀏覽器回歸通過：舊協定首次遷移與離線重開、遊戲中延後更新、跨分頁素材版本隔離、不完整快取拒絕啟用及重試修復、只改素材而 JavaScript 不變時的單次封面刷新。

```sh
npx playwright test tests/e2e/pwa-update.spec.js --workers=1
```

實際測試結果以專案驗收記錄為準。iPhone／iPad Safari、Android Chrome、安裝後的真機模式，以及教學白板的手指／觸控筆，均需在對應實機驗證，不能由桌面瀏覽器的尺寸模擬推定全部相容。

## 參考

- [MDN：使用 Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- [MDN：beforeinstallprompt 事件](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event)
- [MDN：manifest start_url](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/start_url)
- [MDN：skipWaiting](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting)
- [MDN：registration.update](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/update)
- [MDN：FetchEvent.resultingClientId](https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent/resultingClientId)
