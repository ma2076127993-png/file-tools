package com.filetools.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private static final String PAGE_URL = "https://your-domain.example/mobile.html?v=20260528-image-batch-pdf";
    private static final int FILE_CHOOSER_REQUEST = 42;
    private ValueCallback<Uri[]> filePathCallback;
    private WebView webView;
    private ProgressBar progressBar;
    private File currentResultFile;
    private String currentResultMime = "application/octet-stream";
    private String currentResultName = "filetools-output";

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        root.addView(progressBar, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                dp(3)));
        setContentView(root);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 7);
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.clearCache(true);

        webView.addJavascriptInterface(new AndroidBridge(), "FileToolsAndroid");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent = params.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception error) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "无法打开文件选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }

            @Override
            public void onProgressChanged(WebView view, int progress) {
                progressBar.setProgress(progress);
                progressBar.setVisibility(progress >= 100 ? View.GONE : View.VISIBLE);
            }
        });
        webView.setDownloadListener(createDownloadListener());
        webView.loadUrl(PAGE_URL);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            Uri[] result = parseFileChooserResult(resultCode, data);
            filePathCallback.onReceiveValue(result);
            filePathCallback = null;
        }
    }

    private Uri[] parseFileChooserResult(int resultCode, Intent data) {
        Uri[] parsed = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        if (parsed != null && parsed.length > 0) {
            return parsed;
        }
        if (resultCode != RESULT_OK || data == null) {
            return null;
        }
        ClipData clipData = data.getClipData();
        if (clipData != null && clipData.getItemCount() > 0) {
            Uri[] uris = new Uri[clipData.getItemCount()];
            for (int i = 0; i < clipData.getItemCount(); i++) {
                uris[i] = clipData.getItemAt(i).getUri();
            }
            return uris;
        }
        Uri uri = data.getData();
        return uri == null ? null : new Uri[] { uri };
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    private DownloadListener createDownloadListener() {
        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setMimeType(mimeType);
            request.addRequestHeader("User-Agent", userAgent);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "filetools-download");
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (manager != null) {
                manager.enqueue(request);
                Toast.makeText(this, "已开始下载", Toast.LENGTH_SHORT).show();
            }
        };
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void saveBlob(String base64, String fileName, String mimeType) {
            runOnUiThread(() -> {
                try {
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    String safeName = sanitizeFileName(fileName);
                    currentResultFile = writeToResultCache(bytes, safeName);
                    currentResultMime = mimeType == null || mimeType.trim().isEmpty() ? "application/octet-stream" : mimeType;
                    currentResultName = safeName;
                    notifyFileReady();
                } catch (Exception error) {
                    notifyFileError("文件准备失败：" + error.getMessage());
                }
            });
        }

        @JavascriptInterface
        public String getAppInfo() {
            try {
                int versionCode;
                String versionName;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    versionCode = (int) getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode();
                } else {
                    versionCode = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
                }
                versionName = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                return "{\"versionCode\":" + versionCode + ",\"versionName\":\"" + escapeJson(versionName) + "\"}";
            } catch (Exception error) {
                return "{\"versionCode\":0,\"versionName\":\"\"}";
            }
        }

        @JavascriptInterface
        public void installUpdate(String apkUrl) {
            new Thread(() -> downloadAndInstallUpdate(apkUrl)).start();
        }

        @JavascriptInterface
        public void openResult() {
            runOnUiThread(() -> openCurrentResult());
        }

        @JavascriptInterface
        public void shareResult() {
            runOnUiThread(() -> shareCurrentResult());
        }

        @JavascriptInterface
        public void saveResultToDownloads() {
            runOnUiThread(() -> {
                try {
                    if (currentResultFile == null || !currentResultFile.exists()) {
                        notifyFileError("文件不存在，请重新转换");
                        return;
                    }
                    Uri uri = writeToDownloads(currentResultFile, currentResultName, currentResultMime);
                    notifyFileSaved(uri);
                    Toast.makeText(MainActivity.this, "已保存到 Download/文件工具箱", Toast.LENGTH_LONG).show();
                } catch (Exception error) {
                    notifyFileError("保存失败：" + error.getMessage());
                }
            });
        }
    }

    private File writeToResultCache(byte[] bytes, String fileName) throws Exception {
        File dir = new File(getCacheDir(), "converted");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("无法创建临时目录");
        }
        File file = new File(dir, fileName);
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(bytes);
        }
        return file;
    }

    private Uri writeToDownloads(File source, String fileName, String mimeType) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/文件工具箱");
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                throw new IllegalStateException("无法创建下载文件");
            }
            try (FileInputStream input = new FileInputStream(source);
                 OutputStream output = getContentResolver().openOutputStream(uri)) {
                if (output == null) {
                    throw new IllegalStateException("无法写入下载文件");
                }
                copy(input, output);
            }
            return uri;
        }

        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "文件工具箱");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("无法创建下载目录");
        }
        File file = new File(dir, fileName);
        try (FileInputStream input = new FileInputStream(source);
             FileOutputStream output = new FileOutputStream(file)) {
            copy(input, output);
        }
        sendBroadcast(new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(file)));
        return Uri.fromFile(file);
    }

    private void openCurrentResult() {
        if (currentResultFile == null || !currentResultFile.exists()) {
            notifyFileError("文件不存在，请重新转换");
            return;
        }
        Uri uri = SimpleFileProvider.uriFor(currentResultFile);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, currentResultMime);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(Intent.createChooser(intent, "打开文件"));
        } catch (ActivityNotFoundException error) {
            notifyFileError("手机上没有可打开该文件的应用");
        }
    }

    private void shareCurrentResult() {
        if (currentResultFile == null || !currentResultFile.exists()) {
            notifyFileError("文件不存在，请重新转换");
            return;
        }
        Uri uri = SimpleFileProvider.uriFor(currentResultFile);
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType(currentResultMime);
        intent.putExtra(Intent.EXTRA_STREAM, uri);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(Intent.createChooser(intent, "分享文件"));
        } catch (ActivityNotFoundException error) {
            notifyFileError("手机上没有可分享该文件的应用");
        }
    }

    private void notifyFileReady() {
        String path = "临时结果：" + currentResultName;
        evaluateJs("window.onAndroidFileReady && window.onAndroidFileReady({\"name\":\""
                + escapeJson(currentResultName) + "\",\"path\":\"" + escapeJson(path) + "\"})");
    }

    private void notifyFileSaved(Uri uri) {
        String path = "Download/文件工具箱/" + currentResultName;
        evaluateJs("window.onAndroidFileSaved && window.onAndroidFileSaved({\"path\":\""
                + escapeJson(path) + "\"})");
    }

    private void notifyFileError(String message) {
        Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show();
        evaluateJs("window.onAndroidFileError && window.onAndroidFileError(\"" + escapeJson(message) + "\")");
    }

    private void downloadAndInstallUpdate(String apkUrl) {
        File updateFile = null;
        try {
            if (apkUrl == null || apkUrl.trim().isEmpty()) {
                throw new IllegalArgumentException("更新地址为空");
            }

            File dir = new File(getCacheDir(), "updates");
            if (!dir.exists() && !dir.mkdirs()) {
                throw new IllegalStateException("无法创建更新目录");
            }
            updateFile = new File(dir, "filetools-update.apk");

            HttpURLConnection connection = (HttpURLConnection) new URL(apkUrl).openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(60000);
            connection.connect();
            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
                throw new IllegalStateException("下载更新失败");
            }

            int total = connection.getContentLength();
            int done = 0;
            byte[] buffer = new byte[8192];
            try (InputStream input = connection.getInputStream();
                 FileOutputStream output = new FileOutputStream(updateFile)) {
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    done += read;
                    if (total > 0) {
                        int percent = Math.max(1, Math.min(99, (int) (done * 100L / total)));
                        notifyUpdateProgress(percent);
                    }
                }
            } finally {
                connection.disconnect();
            }

            notifyUpdateProgress(100);
            File finalUpdateFile = updateFile;
            runOnUiThread(() -> {
                notifyUpdateReady();
                installApk(finalUpdateFile);
            });
        } catch (Exception error) {
            notifyUpdateError("更新失败：" + error.getMessage());
            if (updateFile != null) {
                updateFile.delete();
            }
        }
    }

    private void installApk(File apkFile) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            settingsIntent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(settingsIntent);
            notifyUpdateError("请先允许安装未知应用，然后回到 App 再点立即更新");
            return;
        }

        Uri uri = SimpleFileProvider.uriFor(apkFile);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            notifyUpdateError("无法打开安装器，请手动下载 APK");
        }
    }

    private void notifyUpdateProgress(int percent) {
        evaluateJs("window.onAndroidUpdateProgress && window.onAndroidUpdateProgress(" + percent + ")");
    }

    private void notifyUpdateReady() {
        evaluateJs("window.onAndroidUpdateReady && window.onAndroidUpdateReady()");
    }

    private void notifyUpdateError(String message) {
        runOnUiThread(() -> evaluateJs("window.onAndroidUpdateError && window.onAndroidUpdateError(\"" + escapeJson(message) + "\")"));
    }

    private void evaluateJs(String js) {
        if (webView != null) {
            runOnUiThread(() -> webView.evaluateJavascript(js, null));
        }
    }

    private void copy(FileInputStream input, OutputStream output) throws Exception {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }
    }

    private String sanitizeFileName(String fileName) {
        String name = fileName == null || fileName.trim().isEmpty() ? "filetools-output" : fileName.trim();
        return name.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private String escapeJson(String value) {
        return value == null ? "" : value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }
}
