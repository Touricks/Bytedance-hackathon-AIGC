import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "./App.js";

describe("App", () => {
  it("renders a dashboard entry in the main workspace topbar", () => {
    const html = renderToStaticMarkup(React.createElement(App));

    assert.match(html, /Daireel/);
    assert.match(html, /进入数据面板/);
    assert.doesNotMatch(html, /请先创建或打开工作区/);
  });
});
