import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "./App.js";

describe("App", () => {
  it("renders the DaiReel demo login page before entering workspaces", () => {
    const html = renderToStaticMarkup(React.createElement(App));

    assert.match(html, /DaiReel Studio/);
    assert.match(html, /欢迎回到 DaiReel/);
    assert.match(html, /直接进入 Demo 工作区/);
    assert.doesNotMatch(html, /已登记工作区/);
    assert.doesNotMatch(html, /请先创建或打开工作区/);
  });
});
