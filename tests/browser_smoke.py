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
        page.wait_for_function("window.__twinFlowDebug && window.__twinFlowDebug() && window.__twinFlowDebug().active >= 25",timeout=30000)
        a=page.evaluate("window.__twinFlowDebug()")
        page.wait_for_timeout(850)
        b=page.evaluate("window.__twinFlowDebug()")
        assert b["frame"]>a["frame"],"Cesium scene needs to update moving particles each render"
        assert abs(b["firstPhase"]-a["firstPhase"])>1e-4,"Flow particles must move, not be static"
        assert b["streams"][0]["velocity"]>0 and b["streams"][0]["flow"]>0
        assert len(page.locator('#hourRows tr[data-hour]').all())==24,"24-hour scenario data must render"
        before_flow=b["streams"][0]["flow"]
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
        page.screenshot(path="artifacts/flow-3d-water.png",full_page=False,animations="disabled")
        assert not errors, "Browser uncaught JS errors: "+str(errors)
        print("BROWSER OK; initial flow:",initial,"drought:",drought,
              "Cesium element:",page.locator(".cesium-viewer").count(),
              "active animated particles:",b["active"],"motion frames:",b["frame"]-a["frame"],
              "DEM status:",page.locator("#geoStatus").text_content()[:200])
        browser.close()
finally:
    proc.terminate()
    proc.wait(timeout=5)
