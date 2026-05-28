export class ShotWorkflowService {
  async listShots(_workspaceId: string) {
    throw new Error("NOT_IMPLEMENTED");
  }
  async getShot(_shotId: string) {
    throw new Error("NOT_IMPLEMENTED");
  }
  async workflowStatus(_workspaceId: string) {
    throw new Error("NOT_IMPLEMENTED");
  }
}
export const shotWorkflowService = new ShotWorkflowService();
