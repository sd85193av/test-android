# 東山鴨頭庫存管理 Android 版

這是「東山鴨頭庫存管理」的單機 Android App。它以 React、Vite 與 Capacitor 建置，資料保存在裝置本機，不依賴雲端服務，也不需要上架 Google Play。

## 已完成

- 商品、進貨、銷貨、庫存與報表功能
- 本機 IndexedDB 資料保存
- JSON 備份、還原與 Android 系統分享
- Android 原生 App 外殼與品牌啟動圖示
- Android 16（API 36）模擬器冷啟動、資料持久化及備份分享驗證

App package ID：`com.chenyotech.dongshaninventory`

## 開發環境

- Node.js 22 以上
- JDK 21
- Android SDK Platform 36、Build Tools 36
- Android Studio（選用；需要圖形化模擬器或 IDE 時再安裝）

目前專案使用 Capacitor 8。第一次取得程式碼後執行：

```powershell
npm ci
npm run android:sync
```

## 建置可安裝 APK

確認 `JAVA_HOME`、`ANDROID_HOME` 或 `ANDROID_SDK_ROOT` 已正確設定，再執行：

```powershell
npm run android:sync
Set-Location android
.\gradlew.bat assembleDebug --no-daemon
```

產生的 APK 位於：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

此 Debug APK 可直接側載到自己的 Android 手機或模擬器。若要長期更新同一個安裝項目，應另行建立並妥善備份固定的 Release keystore；金鑰和密碼不可提交到 Git。

## 使用 Android Studio

```powershell
npm run android:open
```

選擇已建立的模擬器後按 Run 即可。修改網頁程式後，先執行 `npm run android:sync`，再重新建置 App。

## 品質檢查

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## 資料注意事項

資料只存在安裝 App 的裝置。清除 App 資料或解除安裝前，請先在設定頁匯出 JSON 備份；重新安裝後可從同一頁匯入。
