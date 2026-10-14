"""Headless GUI smoke test: static app must actually compute and react to input."""
from __future__ import annotations
import http.server
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
proc=subprocess.Popen(["python","-m","http.server","8765","--bind","127.0.0.1"],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    time.sleep(1)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=["--no-sandbox","--use-gl=angle","--use-angle=swiftshader"])
        page=browser.new_page(viewport={"width":1440,"height":900},device_scale_factor=1)
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.goto("http://127.0.0.1:8765",wait_until="domcontentloaded",timeout=30000)
        page.wait_for_function("window.TwinPhysics && document.querySelector('#kFlow').textContent !== '—'",timeout=30000)
        initial=page.locator('#kFlow').text_content()
        page.select_option("#scenario","drought")
        page.wait_for_timeout(1000)
        drought=page.locator('#kCoverage').text_content()
        page.locator("#agentBtn").click()
        assert len(page.locator("#agentAnswer").text_content())>50
        page.locator("#optBtn").click()
        page.wait_for_function("document.getElementById('optInfo').textContent.includes('192')",timeout=30000)
        assert "192" in page.locator('#optInfo').text_content()
        Path("artifacts").mkdir(exist_ok=True)
        page.screenshot(path="artifacts/browser-desktop.png",full_page=True,animations="disabled")
        assert not errors, "Browser uncaught JS errors: "+str(errors)
        print("BROWSER OK; initial flow:",initial,"drought:",drought,
              "Cesium element:",page.locator(".cesium-viewer").count(),
              "DEM status:",page.locator("#geoStatus").text_content()[:200])
        browser.close()
finally:
    proc.terminate()
    proc.wait(timeout=5)
