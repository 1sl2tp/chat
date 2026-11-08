package xyz.taphoa.webshell;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import java.util.ArrayList;

public final class MainActivity extends Activity {
  private static final int FILE_REQUEST = 8021;
  private static final int MEDIA_REQUEST = 8022;
  private static final String START_URL = BuildConfig.START_URL;
  private static final String APP_HOST = BuildConfig.APP_HOST;
  private FrameLayout root;
  private WebView browser;
  private ProgressBar progress;
  private View fullScreenVideo;
  private WebChromeClient.CustomViewCallback fullScreenCallback;
  private ValueCallback<Uri[]> files;
  private PermissionRequest pendingMedia;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.parseColor(BuildConfig.BAR_COLOR));
    getWindow().setNavigationBarColor(Color.BLACK);
    if (!BuildConfig.IS_DARK) {
      getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
    }
    root = new FrameLayout(this);
    root.setBackgroundColor(BuildConfig.IS_DARK ? Color.BLACK : Color.WHITE);
    browser = new WebView(this);
    browser.setBackgroundColor(BuildConfig.IS_DARK ? Color.BLACK : Color.WHITE);
    root.addView(browser, new FrameLayout.LayoutParams(-1, -1));
    progress = new ProgressBar(this);
    FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(90, 90, android.view.Gravity.CENTER);
    root.addView(progress, p);
    setContentView(root);
    WebView.setWebContentsDebuggingEnabled(false);
    WebSettings settings = browser.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(true);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setMediaPlaybackRequiresUserGesture(!BuildConfig.VIDEO_APP);
    settings.setSupportMultipleWindows(false);
    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(browser, BuildConfig.VIDEO_APP);
    browser.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        if (!req.isForMainFrame()) return false;
        Uri uri = req.getUrl();
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        if ("https".equals(scheme) && APP_HOST.equals(host)) return false;
        if (!"https".equals(scheme) && !"http".equals(scheme)
            && !"mailto".equals(scheme) && !"tel".equals(scheme)) return true;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
        return true;
      }
      @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
        progress.setVisibility(View.VISIBLE);
      }
      @Override public void onPageFinished(WebView view, String url) {
        progress.setVisibility(View.GONE);
      }
    });
    browser.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView view,
          ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (files != null) files.onReceiveValue(null);
        files = callback;
        try {
          startActivityForResult(params.createIntent(), FILE_REQUEST);
          return true;
        } catch (Exception e) {
          files = null;
          callback.onReceiveValue(null);
          return false;
        }
      }
      @Override public void onPermissionRequest(PermissionRequest request) {
        runOnUiThread(() -> handleWebMediaPermission(request));
      }
      @Override public void onPermissionRequestCanceled(PermissionRequest request) {
        if (pendingMedia == request) pendingMedia = null;
      }
      @Override public void onShowCustomView(View view, CustomViewCallback cb) {
        if (fullScreenVideo != null) { cb.onCustomViewHidden(); return; }
        fullScreenVideo = view;
        fullScreenCallback = cb;
        browser.setVisibility(View.GONE);
        root.addView(view, new FrameLayout.LayoutParams(-1,-1));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
      }
      @Override public void onHideCustomView() { closeFullScreen(); }
    });
    // Load the canonical HTTPS site: no private account data is bundled in this APK.
    browser.loadUrl(START_URL);
  }

  private void handleWebMediaPermission(PermissionRequest request) {
    Uri origin = request.getOrigin();
    if (!"https".equalsIgnoreCase(origin.getScheme())
        || !APP_HOST.equalsIgnoreCase(origin.getHost())) { request.deny(); return; }
    ArrayList<String> needed = new ArrayList<>();
    for (String resource : request.getResources()) {
      if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
          && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
        needed.add(Manifest.permission.RECORD_AUDIO);
      if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
          && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
        needed.add(Manifest.permission.CAMERA);
      if (!PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
          && !PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) { request.deny(); return; }
    }
    if (request.getResources().length == 0) { request.deny(); return; }
    if (needed.isEmpty()) request.grant(request.getResources());
    else if (pendingMedia == null) {
      pendingMedia = request;
      requestPermissions(needed.toArray(new String[0]), MEDIA_REQUEST);
    } else request.deny();
  }

  @Override public void onRequestPermissionsResult(int requestCode, String[] names, int[] grants) {
    super.onRequestPermissionsResult(requestCode, names, grants);
    if (requestCode != MEDIA_REQUEST || pendingMedia == null) return;
    PermissionRequest request = pendingMedia;
    pendingMedia = null;
    boolean accepted = grants.length > 0;
    for (int grant : grants) accepted &= grant == PackageManager.PERMISSION_GRANTED;
    if (accepted) request.grant(request.getResources()); else request.deny();
  }

  @Override protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request != FILE_REQUEST || files == null) return;
    ValueCallback<Uri[]> callback = files;
    files = null;
    callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
  }

  private void closeFullScreen() {
    if (fullScreenVideo == null) return;
    root.removeView(fullScreenVideo);
    fullScreenVideo = null;
    browser.setVisibility(View.VISIBLE);
    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
    if (fullScreenCallback != null) {
      fullScreenCallback.onCustomViewHidden();
      fullScreenCallback = null;
    }
  }

  @Override public void onBackPressed() {
    if (fullScreenVideo != null) closeFullScreen();
    else if (browser.canGoBack()) browser.goBack();
    else super.onBackPressed();
  }
  @Override protected void onPause() {
    CookieManager.getInstance().flush();
    super.onPause();
  }
  @Override protected void onDestroy() {
    if (pendingMedia != null) { pendingMedia.deny(); pendingMedia = null; }
    if (files != null) { files.onReceiveValue(null); files = null; }
    closeFullScreen();
    root.removeView(browser);
    browser.destroy();
    super.onDestroy();
  }
}