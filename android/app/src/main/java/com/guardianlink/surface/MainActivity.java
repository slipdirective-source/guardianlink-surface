package com.guardianlink.surface;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * GuardianLink Surface — a single-activity WebView wrapper around the
 * cognitive surface web app bundled in assets/ui/. The surface runs
 * entirely in-page (deterministic pipeline, in-memory record), so the
 * app works fully offline and needs no permissions.
 */
public class MainActivity extends Activity {

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(true);
        // The record is in-memory by design; DOM storage stays off so
        // nothing about the record silently persists on the device.
        settings.setDomStorageEnabled(false);

        webView.setWebViewClient(new WebViewClient());
        webView.loadUrl("file:///android_asset/ui/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
