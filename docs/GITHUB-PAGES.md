# 發布到 GitHub Pages

此專案可部署成 HTTPS 網站，並從手機瀏覽器加入主畫面作為 PWA 使用。這個流程不包含 App Store 或 Google Play 上架。

## 首次發布

1. 將本專案的內容放在 GitHub 儲存庫根目錄，推送到 `main` 分支，包含 `.github/workflows/deploy-pages.yml`。若使用公開儲存庫，原始碼、素材及提交歷史也會公開。
2. 在儲存庫開啟 **Settings → Pages → Build and deployment → Source**，選擇 **GitHub Actions**。
3. 在 **Actions → Deploy GitHub Pages → Run workflow** 選擇 `main` 並執行。若首次推送早於 Pages 設定而失敗，設定完成後重新執行即可。
4. 等待 `build` 與 `deploy` 都成功，從部署結果或 **Settings → Pages** 開啟實際網站網址。

一般專案網址格式為 `https://<account>.github.io/<repository>/`，請使用 GitHub 顯示的實際 HTTPS 網址，並保留結尾斜線。這裡的 `<account>` 和 `<repository>` 是佔位文字，不代表網站已建立。

工作流程使用 Node.js 22，依序執行 `npm ci`、`npm test`、`npm run build`，然後發布整個 `dist/`，包括離線用的 `sw.js`。不需要另設私人存取權杖或部署密鑰；權限由 GitHub Actions 自動提供，部署權限只授予部署工作。之後每次推送到 `main` 都會重新測試、建置及發布。

## 安裝到手機

- **iPhone／iPad：** 用 Safari 開啟網站，點「分享」→「加入主畫面」。若有「以網頁 App 開啟」選項，保持開啟，再點「加入」。
- **Android：** 用 Chrome 開啟網站，使用遊戲的「安裝遊戲」入口，或瀏覽器選單的「安裝應用程式／加入主畫面」。顯示名稱與安裝入口會依瀏覽器版本而異。
- 首次開啟及安裝後首次啟動請保持連線，等遊戲顯示「已可離線遊玩」，再測試關閉網絡及從主畫面重開。瀏覽器清除網站資料後，需要重新連線準備。

安裝後可從主畫面圖示開啟。真機安裝與離線重開仍需在相應的 iPhone／Android 裝置上確認；桌面測試不能代替這項驗收。完整更新及快取行為見 [PWA.md](PWA.md)。

## 發布檢查

- 部署結果中的網址能開啟封面，圖片及字型正常，完整遊戲流程可操作。
- 首次連線後出現「已可離線遊玩」，離線重開仍可載入及遊玩。
- 更新發布後，在連線狀態回到封面，讓遊戲完成更新；製作過程中不會自動重載。

如果工作流程失敗，先看 **Actions** 中失敗的步驟。`Configure GitHub Pages` 失敗時，確認 Pages 的來源已設為 GitHub Actions；部署被擋時，檢查 `github-pages` 環境的分支規則是否允許 `main`。

參考：[GitHub Pages 自訂工作流程](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
