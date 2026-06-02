import { expect, test, type Page, type Route } from "@playwright/test";

const workspaceId = "ws-delete-e2e";

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockWorkspaceListWithDelete(page: Page) {
  let deleted = false;
  const workspace = {
    id: workspaceId,
    name: "delete target",
    localPath: "/tmp/daireel/delete-target",
    status: "materials_ready",
    traceFile: ".daireel/trace/events.jsonl",
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    lastSeenAt: "2026-06-02T00:00:00.000Z",
  };

  const handleApiRoute = async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path === "/api/workspaces") {
      return json(route, {
        workspaceRoot: "storage/workspaces",
        workspaces: deleted ? [] : [workspace],
        discovered: [],
      });
    }
    if (request.method() === "DELETE" && path === `/api/workspaces/${workspaceId}`) {
      deleted = true;
      return json(route, {
        data: {
          workspaceId,
          deleted: true,
        },
      });
    }
    return route.continue();
  };

  await page.route("http://localhost:3000/api/**", handleApiRoute);
  await page.route("http://127.0.0.1:3000/api/**", handleApiRoute);
}

test("registered workspace cards can be deleted without opening the workspace", async ({
  page,
}) => {
  await mockWorkspaceListWithDelete(page);
  page.on("dialog", async (dialog) => {
    expect(dialog.message()).toContain("不会删除工作目录中的其他文件");
    await dialog.accept();
  });

  await page.goto("/");
  await expect(page.getByText("/tmp/daireel/delete-target")).toBeVisible();

  await page.getByLabel("删除工作区 delete-target").click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("/tmp/daireel/delete-target")).toHaveCount(0);
});
