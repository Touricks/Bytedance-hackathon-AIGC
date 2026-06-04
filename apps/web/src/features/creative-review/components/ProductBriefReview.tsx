import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageSquare, Send } from "lucide-react";
import type { ProductBriefArtifact } from "@aigc-video/shared";
import type { ProposeWorkspaceBriefInput } from "../../../lib/api/client.js";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import {
  briefToForm,
  buildProductBriefRegenerationInput,
  formToBrief,
  type ProductBriefFormState
} from "../productBriefForm.js";
import { ProposalPlaceholder } from "./Common.js";

type ProductBriefChatMessage = {
  id: string;
  role: "merchant" | "system";
  text: string;
};

export function ProductBriefReviewForm({
  artifactId,
  brief,
  busy,
  onApprove,
  onRegenerate,
  onActionComplete
}: {
  artifactId: string;
  brief: ProductBriefArtifact;
  busy: boolean;
  onApprove: (data: ProductBriefArtifact) => void;
  onRegenerate: (
    input: Omit<ProposeWorkspaceBriefInput, "workspaceId">
  ) => Promise<unknown>;
  onActionComplete: () => void;
}) {
  const [form, setForm] = useState(() => briefToForm(brief));
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ProductBriefChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatMessageCounter = useRef(0);

  useEffect(() => {
    setForm(briefToForm(brief));
    setChatError(null);
  }, [artifactId, brief]);

  const update = (key: keyof ProductBriefFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const nextChatMessageId = (role: ProductBriefChatMessage["role"]) => {
    chatMessageCounter.current += 1;
    return `${role}-${artifactId}-${chatMessageCounter.current}`;
  };

  const regenerateBrief = async () => {
    const userDirection = chatInput.trim();
    if (!userDirection || busy) return;
    setChatMessages((current) => [
      ...current,
      {
        id: nextChatMessageId("merchant"),
        role: "merchant",
        text: userDirection
      }
    ]);
    setChatInput("");
    setChatError(null);
    try {
      await onRegenerate(
        buildProductBriefRegenerationInput({
          artifactId,
          brief,
          form,
          userDirection
        })
      );
      setChatMessages((current) => [
        ...current,
        {
          id: nextChatMessageId("system"),
          role: "system",
          text: "已生成新的待审商品卖点，请检查后再批准。"
        }
      ]);
      onActionComplete();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>待审创作产物</span>
        <h1>商品卖点审核</h1>
        <p>确认商品名、核心卖点、人群、语气和禁用表达后，再生成分镜脚本。</p>
      </div>
      <section className="product-brief-chat" aria-label="调整商品卖点">
        <div className="product-brief-chat__head">
          <MessageSquare size={18} />
          <div>
            <h2>调整商品卖点</h2>
            <p>描述希望强化或改写的方向，系统会基于当前表单草稿重新生成待审商品卖点。</p>
          </div>
        </div>
        <ul className="product-brief-chat__messages" aria-live="polite">
          {chatMessages.length === 0 ? (
            <li className="product-brief-chat__hint">
              例如：更突出送礼场景，语气更年轻，减少材质描述。
            </li>
          ) : (
            chatMessages.map((message) => (
              <li
                key={message.id}
                className={`product-brief-chat__message product-brief-chat__message--${message.role}`}
              >
                {message.text}
              </li>
            ))
          )}
        </ul>
        <div className="product-brief-chat__form">
          <label>
            补充要求
            <textarea
              rows={3}
              maxLength={1000}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="告诉系统这版商品卖点需要怎样调整"
            />
          </label>
          <div className="product-brief-chat__actions">
            <span className="product-brief-chat__meta">
              {chatInput.trim().length}/1000
            </span>
            <button
              type="button"
              className="review-primary"
              onClick={() => void regenerateBrief()}
              disabled={busy || chatInput.trim().length === 0}
            >
              <Send size={16} />
              {busy ? "正在重新生成..." : "重新生成商品卖点"}
            </button>
          </div>
          {chatError ? <p className="product-brief-chat__error">{chatError}</p> : null}
        </div>
      </section>
      <div className="review-business-form" aria-label="商品卖点表单">
        <label>
          商品名称
          <input
            value={form.productName}
            onChange={(event) => update("productName", event.target.value)}
          />
        </label>
        <label>
          商品品类
          <input
            value={form.category}
            onChange={(event) => update("category", event.target.value)}
          />
        </label>
        <label className="review-business-form__wide">
          核心卖点
          <textarea
            rows={3}
            value={form.coreSellingPoint}
            onChange={(event) => update("coreSellingPoint", event.target.value)}
          />
        </label>
        <label>
          目标人群
          <textarea
            rows={3}
            value={form.audienceWho}
            onChange={(event) => update("audienceWho", event.target.value)}
          />
        </label>
        <label>
          痛点或愿望
          <textarea
            rows={3}
            value={form.audiencePainOrDesire}
            onChange={(event) => update("audiencePainOrDesire", event.target.value)}
          />
        </label>
        <label>
          语气
          <input
            value={form.brandTone}
            onChange={(event) => update("brandTone", event.target.value)}
          />
        </label>
        <label>
          平台
          <input
            value={form.platform}
            onChange={(event) => update("platform", event.target.value)}
          />
        </label>
        <label>
          商品事实
          <textarea
            rows={4}
            value={form.keyFacts}
            onChange={(event) => update("keyFacts", event.target.value)}
          />
        </label>
        <label>
          证明素材
          <textarea
            rows={4}
            value={form.proof}
            onChange={(event) => update("proof", event.target.value)}
          />
        </label>
        <label>
          禁用表达
          <textarea
            rows={3}
            value={form.bannedExpressions}
            onChange={(event) => update("bannedExpressions", event.target.value)}
          />
        </label>
        <label>
          优惠信息
          <textarea
            rows={3}
            value={form.offer}
            onChange={(event) => update("offer", event.target.value)}
          />
        </label>
        <label className="review-business-form__wide">
          落地页信息
          <textarea
            rows={3}
            value={form.landingInfo}
            onChange={(event) => update("landingInfo", event.target.value)}
          />
        </label>
        <label className="review-business-form__wide">
          关键假设
          <textarea
            rows={4}
            value={form.assumptions}
            onChange={(event) => update("assumptions", event.target.value)}
          />
        </label>
      </div>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          onClick={() => {
            onApprove(formToBrief(form, brief));
            onActionComplete();
          }}
          disabled={busy}
        >
          <CheckCircle2 size={16} />
          批准商品卖点并生成分镜脚本
        </button>
      </div>
    </section>
  );
}

export function ProductBriefReview({
  vm,
  onActionComplete
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const artifact = vm.artifacts.brief;
  const pending = Boolean(vm.pending?.productBrief);
  if (!artifact) {
    return (
      <ProposalPlaceholder
        title="商品卖点审核"
        description={
          pending
            ? "系统正在根据已批准的素材解读生成商品卖点，完成后会停在这里供你审核。"
            : "素材理解完成后，需要生成商品卖点供商家确认。"
        }
        actionLabel={pending ? "正在生成商品卖点..." : "生成商品卖点"}
        busy={vm.busy || pending}
        onAction={() => {
          vm.actions.proposeBrief();
          onActionComplete();
        }}
      />
    );
  }
  const brief = artifact.data;
  const storyboardPending = Boolean(vm.pending?.storyboard);
  return (
    <ProductBriefReviewForm
      artifactId={artifact.id}
      brief={brief}
      busy={vm.busy || storyboardPending}
      onApprove={vm.actions.approveBriefAndProposeStoryboard}
      onRegenerate={vm.actions.proposeBrief}
      onActionComplete={onActionComplete}
    />
  );
}
