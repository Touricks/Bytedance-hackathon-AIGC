import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import { ChevronDown, ChevronRight, Upload, Wand2 } from "lucide-react";
import type {
  Audience,
  CompiledRequirementField,
  CompiledRequirementSource,
  CompiledRequirementSourceMap,
  CreativeFactors,
  CreativeRequirementTemplate,
  FactorGuidance,
  FactorGuidanceFieldPath,
  ProductType,
  Strategy
} from "@aigc-video/shared";
import { FACTOR_GUIDANCE_FIELD_AFFECTS } from "@aigc-video/shared";
import {
  importReferenceVideoRequirements,
  listCreativeRequirementTemplates,
  proposeWorkspacePromptRequirements,
  type PromptRequirementsData,
  type ReferenceVideoRequirementsImportResult,
  uploadWorkspaceMaterial,
  workspaceMaterialFileRejectionReason
} from "../../../lib/api/client.js";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import {
  applyCreativeRequirementTemplate,
  requirementFormFromArtifact,
  requirementFormFromImportedDraft,
  requirementFormWithCreativeFactors,
  promptRequirementsDataFromForm,
  syncCompiledRequirementFields,
  type RequirementsFormState
} from "../requirementsForm.js";

const PRODUCT_TYPE_OPTIONS: Array<{ value: ProductType; label: string; impact: string }> = [
  {
    value: "consumable-good",
    label: "可消耗商品",
    impact: "强调包装、质地、用量、使用瞬间和复购理由"
  },
  {
    value: "durable-good",
    label: "耐用商品",
    impact: "强调主体结构、功能部位、材质细节和长期使用价值"
  },
  {
    value: "digital-service",
    label: "数字服务",
    impact: "强调界面、服务流程、案例结果和咨询路径"
  },
  {
    value: "offline-experience-service",
    label: "线下体验服务",
    impact: "强调目的地、场地、服务人员、体验过程和保障证明"
  }
];

const AUDIENCE_OPTIONS: Array<{ value: Audience; label: string; impact: string }> = [
  { value: "toddler", label: "幼儿", impact: "向新手家长建立安全和安心感" },
  { value: "child", label: "儿童", impact: "向家长强调安全、省心、陪伴和真实体验" },
  { value: "youth", label: "青年", impact: "语气直接，突出效率、颜值、实用和即时体验" },
  { value: "senior", label: "老年", impact: "语气温和稳重，强调安心、品质、便利和心意" }
];

const STRATEGY_OPTIONS: Array<{ value: Strategy; label: string; impact: string }> = [
  { value: "pain-solution", label: "痛点解决", impact: "按痛点、原因、解决方式、证据、行动引导推进" },
  { value: "scenario-demo", label: "场景演示", impact: "按场景进入、过程演示、关键卖点、结果证明推进" },
  { value: "review-comparison", label: "测评对比", impact: "按测评标准、使用过程、对比结果和适用建议推进" },
  { value: "tutorial-value", label: "教程价值", impact: "按误区、步骤、注意点、效果展示和行动引导推进" },
  { value: "authority-proof", label: "权威证明", impact: "按可信来源、核心能力、证据细节和适用场景推进" },
  { value: "emotional-story", label: "情绪故事", impact: "按人物处境、情绪需求、使用过程和改善结果推进" },
  { value: "curiosity-hook", label: "好奇钩子", impact: "按悬念、揭示、卖点解释、证据和行动引导推进" },
  { value: "visual-story", label: "视觉叙事", impact: "产品即画面——以质感开场、材质细节呈现、氛围收尾，适合香氛/摆件/颜值型商品" }
];

const FACTOR_GROUPS = [
  {
    key: "productType",
    title: "商品/服务类型影响",
    fields: [
      ["subjectPresentation", "主体呈现"],
      ["sceneAndDelivery", "场景与交付"],
      ["authenticityBoundaries", "真实性边界"]
    ]
  },
  {
    key: "audience",
    title: "适用人群影响",
    fields: [
      ["addressingAndTone", "称谓与语气"],
      ["benefitFrame", "利益表达"],
      ["sensitivityBoundaries", "敏感边界"]
    ]
  },
  {
    key: "strategy",
    title: "推销手法影响",
    fields: [
      ["openingHook", "开场方式"],
      ["storyStructure", "故事结构"],
      ["evidenceAndCta", "证据与行动引导"]
    ]
  }
] as const;

const COMPILED_FIELD_LABELS: Record<CompiledRequirementField, string> = {
  "image.style": "图像风格",
  "image.composition": "图像构图",
  "image.avoid": "图像避免项",
  "script.tone": "剧本语气",
  "storyboard.rhythm": "分镜节奏",
  "shotImage.global": "分镜图全局要求",
  "shotVideo.global": "分镜视频全局要求"
};

const COMPILED_REQUIREMENT_FIELDS = [
  { key: "imageStyle", sourceMapKey: "imageStyle", label: "图像风格（编译预览）" },
  { key: "imageComposition", sourceMapKey: "imageComposition", label: "图像构图（编译预览）" },
  { key: "imageAvoid", sourceMapKey: "imageAvoid", label: "图像避免项（编译预览）" },
  { key: "scriptTone", sourceMapKey: "scriptTone", label: "剧本语气（编译预览）" },
  { key: "storyboardRhythm", sourceMapKey: "storyboardRhythm", label: "分镜节奏（编译预览）" },
  { key: "shotImageGlobal", sourceMapKey: "shotImageGlobal", label: "分镜图全局要求（编译预览）" },
  {
    key: "shotVideoGlobal",
    sourceMapKey: "shotVideoGlobal",
    label: "分镜视频全局要求（编译预览）",
    wide: true
  }
] as const satisfies Array<{
  key: keyof Pick<
    RequirementsFormState,
    | "imageStyle"
    | "imageComposition"
    | "imageAvoid"
    | "scriptTone"
    | "storyboardRhythm"
    | "shotImageGlobal"
    | "shotVideoGlobal"
  >;
  sourceMapKey: keyof CompiledRequirementSourceMap;
  label: string;
  wide?: boolean;
}>;

function selectedOption<TValue extends string>(
  options: Array<{ value: TValue; label: string; impact: string }>,
  value: TValue,
) {
  return options.find((option) => option.value === value) ?? options[0]!;
}

function storyArcPreview(steps: string[]) {
  return `推荐剧本节奏：${steps.join(" → ")}`;
}

function guidancePath(
  group: keyof FactorGuidance,
  field: string,
): FactorGuidanceFieldPath {
  return `factorGuidance.${group}.${field}` as FactorGuidanceFieldPath;
}

function affectsText(affects: readonly CompiledRequirementField[]) {
  return affects.map((field) => COMPILED_FIELD_LABELS[field]).join("、");
}

function SourceChips({ sources }: { sources: CompiledRequirementSource[] }) {
  return (
    <div className="compiled-source-chips" aria-label="字段来源">
      {sources.map((source) => (
        <span className="compiled-source-chip" key={source.sourcePath}>
          {source.label}
        </span>
      ))}
    </div>
  );
}

export function RequirementsStart({
  vm,
  onActionComplete
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const assets = vm.materialLibrary?.assets ?? [];
  const requirementsArtifact = vm.artifacts.promptRequirements;
  const initialForm = useMemo(
    () =>
      requirementFormFromArtifact(
        (requirementsArtifact?.data as PromptRequirementsData | undefined) ?? null
      ),
    [requirementsArtifact?.id, requirementsArtifact?.data]
  );
  const [form, setForm] = useState(initialForm);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceImporting, setReferenceImporting] = useState(false);
  const [referenceMessage, setReferenceMessage] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceAnalysis, setReferenceAnalysis] = useState<
    ReferenceVideoRequirementsImportResult["analysis"] | null
  >(null);
  const [referenceRecommendation, setReferenceRecommendation] = useState<
    ReferenceVideoRequirementsImportResult["creativeFactorsRecommendation"] | null
  >(null);
  const [templatesOpen, setTemplatesOpen] = useState(true);
  const [factorOpen, setFactorOpen] = useState<Record<string, boolean>>({
    productType: true,
    audience: true,
    strategy: true
  });
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const templateQuery = useQuery({
    queryKey: ["creative-requirement-templates"],
    queryFn: listCreativeRequirementTemplates,
    staleTime: Infinity
  });
  const creativeRequirementTemplates = templateQuery.data?.templates ?? [];

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  const applyTemplate = (template: CreativeRequirementTemplate) => {
    setForm(applyCreativeRequirementTemplate(template));
  };

  const updateCreativeFactor = <K extends keyof CreativeFactors>(
    key: K,
    value: CreativeFactors[K]
  ) => {
    setForm((current) => {
      const creativeRequirementTemplate = current.creativeRequirementTemplate
        ? { ...current.creativeRequirementTemplate, status: "detached" as const }
        : undefined;
      return requirementFormWithCreativeFactors(
        {
          ...current.creativeFactors,
          [key]: value
        },
        { creativeRequirementTemplate }
      );
    });
    setDraftMessage(null);
  };

  const updateGuidance = (
    group: keyof FactorGuidance,
    key: string,
    value: string
  ) => {
    setForm((current) => {
      const creativeRequirementTemplate = current.creativeRequirementTemplate
        ? { ...current.creativeRequirementTemplate, status: "customized" as const }
        : undefined;
      return syncCompiledRequirementFields({
        creativeFactors: current.creativeFactors,
        scriptInfluence: current.scriptInfluence,
        creativeRequirementTemplate,
        factorGuidance: {
          ...current.factorGuidance,
          [group]: {
            ...current.factorGuidance[group],
            [key]: value
          }
        } as FactorGuidance
      });
    });
    setDraftMessage(null);
  };

  const uploadFiles = async (files: File[]) => {
    const rejected = files
      .map((file) => ({
        file,
        reason: workspaceMaterialFileRejectionReason(file)
      }))
      .filter((item): item is { file: File; reason: string } => Boolean(item.reason));
    const accepted = files.filter((file) => !workspaceMaterialFileRejectionReason(file));
    setUploadMessage(
      rejected.length > 0
        ? rejected.map((item) => `${item.file.name}: ${item.reason}`).join("；")
        : null
    );
    if (accepted.length === 0) return;

    setUploading(true);
    try {
      for (const file of accepted) {
        await uploadWorkspaceMaterial({ workspaceId: vm.workspaceId, file });
      }
      await vm.actions.refresh();
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };

  const importReferenceVideo = async () => {
    const trimmedUrl = referenceUrl.trim();
    if (!referenceFile && !trimmedUrl) {
      setReferenceError("请上传参考视频，或粘贴可直接下载的视频链接。");
      return;
    }

    setReferenceImporting(true);
    setReferenceError(null);
    setReferenceMessage(null);
    try {
      const imported = await importReferenceVideoRequirements({
        workspaceId: vm.workspaceId,
        source: referenceFile
          ? { type: "file", file: referenceFile }
          : { type: "url", url: trimmedUrl }
      });
      setForm((current) =>
        imported.artifact?.data
          ? requirementFormFromArtifact(imported.artifact.data)
          : requirementFormFromImportedDraft(imported.draft, current)
      );
      setReferenceAnalysis(imported.analysis);
      setReferenceRecommendation(imported.creativeFactorsRecommendation);
      setReferenceMessage("模型推荐已保存为草稿，请确认细分字段后提交创作要求。");
      await vm.actions.refresh();
    } catch (error) {
      setReferenceError(error instanceof Error ? error.message : String(error));
    } finally {
      setReferenceImporting(false);
    }
  };

  const data: PromptRequirementsData = useMemo(
    () => promptRequirementsDataFromForm(form),
    [form]
  );
  const selectedProductTypeOption = selectedOption(
    PRODUCT_TYPE_OPTIONS,
    form.creativeFactors.productType,
  );
  const selectedAudienceOption = selectedOption(
    AUDIENCE_OPTIONS,
    form.creativeFactors.audience,
  );
  const selectedStrategyOption = selectedOption(
    STRATEGY_OPTIONS,
    form.creativeFactors.strategy,
  );
  const showCurrentTemplate =
    form.creativeRequirementTemplate?.status !== undefined &&
    form.creativeRequirementTemplate.status !== "detached";

  const saveRequirementsDraft = async () => {
    setSavingDraft(true);
    setDraftMessage(null);
    try {
      await proposeWorkspacePromptRequirements({
        workspaceId: vm.workspaceId,
        data
      });
      setDraftMessage("细分字段已保存，刷新后会恢复当前草稿。");
      await vm.actions.refresh();
    } catch (error) {
      setDraftMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <section className="review-panel review-panel--start">
      <div className="review-panel__header">
        <h1>创作要求 + 上传素材</h1>
      </div>
      {!requirementsArtifact?.isCurrent ? (
        <div className="reference-video-import">
          <div className="reference-video-import__main">
            <label>
              参考视频导入
              <textarea
                rows={2}
                value={referenceUrl}
                onChange={(event) => setReferenceUrl(event.target.value)}
                placeholder="粘贴可直接下载的视频链接，或上传参考视频"
              />
            </label>
            <div className="reference-video-import__actions">
              <label className="review-secondary reference-video-import__upload">
                上传参考视频
                <input
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.currentTarget.value = "";
                    setReferenceFile(file);
                    setReferenceError(null);
                    setReferenceMessage(file ? `已选择 ${file.name}` : null);
                  }}
                />
              </label>
              <button
                type="button"
                className="review-primary"
                disabled={vm.busy || referenceImporting}
                onClick={() => {
                  void importReferenceVideo();
                }}
              >
                <Wand2 size={16} />
                {referenceImporting ? "正在导入..." : "导入创作要求"}
              </button>
            </div>
          </div>
          {referenceError ? <p className="review-error">{referenceError}</p> : null}
          {referenceMessage ? <p className="review-muted">{referenceMessage}</p> : null}
          {referenceAnalysis ? (
            <div className="reference-video-import__analysis">
              <strong>导入分析摘要</strong>
              <p>{referenceAnalysis.summary}</p>
              {referenceRecommendation ? (
                <p>
                  推荐因子：
                  {referenceRecommendation.recommendedFactors.productType} /{" "}
                  {referenceRecommendation.recommendedFactors.audience} /{" "}
                  {referenceRecommendation.recommendedFactors.strategy}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="review-upload-row">
        <label className="review-upload">
          <Upload size={16} />
          上传素材
          <input
            type="file"
            accept="image/*,video/*,.txt,.md"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.currentTarget.value = "";
              if (files.length > 0) void uploadFiles(files);
            }}
          />
        </label>
        <span>
          {uploading
            ? "正在上传素材..."
            : assets.length > 0
              ? `已上传 ${assets.length} 个素材`
              : "请先上传至少一个商品素材"}
        </span>
      </div>
      {uploadMessage ? <p className="review-error">{uploadMessage}</p> : null}
      <section className="requirement-template-panel">
        <Button
          className="requirement-template-panel__toggle"
          aria-expanded={templatesOpen}
          aria-controls="requirement-template-options"
          onClick={() => setTemplatesOpen((open) => !open)}
          size="small"
          variant="text"
        >
          {templatesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>创作要求模板</span>
        </Button>
        <Collapse in={templatesOpen} timeout="auto" unmountOnExit>
          <div
            id="requirement-template-options"
            className="requirement-template-panel__body"
          >
            {templateQuery.isLoading ? (
              <Button className="requirement-template-option" disabled variant="outlined">
                <span>模板加载中</span>
                <small>稍后即可套用</small>
              </Button>
            ) : null}
            {templateQuery.isError ? (
              <p className="review-error requirement-template-panel__error">
                创作要求模板暂不可用
              </p>
            ) : null}
            {creativeRequirementTemplates.map((template) => (
              <Button
                key={template.id}
                className="requirement-template-option"
                onClick={() => applyTemplate(template)}
                variant="outlined"
              >
                <span>{template.name}</span>
                <small>{template.summary}</small>
              </Button>
            ))}
          </div>
        </Collapse>
      </section>
      <section className="creative-factor-panel">
        <div className="creative-factor-panel__header">
          <div>
            <span>全局创作因子</span>
          </div>
        </div>
        <div className="creative-factor-selects">
          <FormControl
            className="creative-factor-select-card"
            size="small"
            variant="outlined"
          >
            <InputLabel id="creative-factor-product-type-label">
              商品/服务类型
            </InputLabel>
            <Select<ProductType>
              labelId="creative-factor-product-type-label"
              id="creative-factor-product-type"
              label="商品/服务类型"
              value={form.creativeFactors.productType}
              onChange={(event: SelectChangeEvent<ProductType>) => {
                updateCreativeFactor("productType", event.target.value as ProductType);
              }}
            >
              {PRODUCT_TYPE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
            <Collapse
              appear
              in
              key={selectedProductTypeOption.value}
              timeout={180}
            >
              <FormHelperText className="creative-factor-select-card__impact">
                {selectedProductTypeOption.impact}
              </FormHelperText>
            </Collapse>
          </FormControl>
          <FormControl
            className="creative-factor-select-card"
            size="small"
            variant="outlined"
          >
            <InputLabel id="creative-factor-audience-label">适用人群</InputLabel>
            <Select<Audience>
              labelId="creative-factor-audience-label"
              id="creative-factor-audience"
              label="适用人群"
              value={form.creativeFactors.audience}
              onChange={(event: SelectChangeEvent<Audience>) => {
                updateCreativeFactor("audience", event.target.value as Audience);
              }}
            >
              {AUDIENCE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
            <Collapse appear in key={selectedAudienceOption.value} timeout={180}>
              <FormHelperText className="creative-factor-select-card__impact">
                {selectedAudienceOption.impact}
              </FormHelperText>
            </Collapse>
          </FormControl>
          <FormControl
            className="creative-factor-select-card"
            size="small"
            variant="outlined"
          >
            <InputLabel id="creative-factor-strategy-label">推销手法</InputLabel>
            <Select<Strategy>
              labelId="creative-factor-strategy-label"
              id="creative-factor-strategy"
              label="推销手法"
              value={form.creativeFactors.strategy}
              onChange={(event: SelectChangeEvent<Strategy>) => {
                updateCreativeFactor("strategy", event.target.value as Strategy);
              }}
            >
              {STRATEGY_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
            <Collapse appear in key={selectedStrategyOption.value} timeout={180}>
              <FormHelperText className="creative-factor-select-card__impact">
                {selectedStrategyOption.impact}
              </FormHelperText>
            </Collapse>
          </FormControl>
        </div>
        {form.creativeRequirementTemplate && showCurrentTemplate ? (
          <div className="creative-factor-template-status">
            <span>当前模板</span>
            <strong>{form.creativeRequirementTemplate.templateNameSnapshot}</strong>
          </div>
        ) : null}
        <div className="creative-factor-groups">
          {FACTOR_GROUPS.map((group) => {
            const guidance = form.factorGuidance[group.key] as Record<string, string>;
            return (
              <section className="creative-factor-group" key={group.key}>
                <Button
                  className="creative-factor-group__toggle"
                  aria-expanded={factorOpen[group.key]}
                  onClick={() =>
                    setFactorOpen((current) => ({
                      ...current,
                      [group.key]: !current[group.key]
                    }))
                  }
                  size="small"
                  variant="text"
                >
                  {factorOpen[group.key] ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                  <span>{group.title}</span>
                </Button>
                <Collapse in={factorOpen[group.key]} timeout="auto" unmountOnExit>
                  <div className="creative-factor-group__fields">
                    {group.fields.map(([fieldKey, label]) => {
                      const path = guidancePath(group.key, fieldKey);
                      const affects = FACTOR_GUIDANCE_FIELD_AFFECTS[path].affects;
                      return (
                        <label key={fieldKey}>
                          <div className="creative-factor-field__title">
                            <span>{label}</span>
                            <small>影响 {affectsText(affects)}</small>
                          </div>
                          <textarea
                            rows={3}
                            value={guidance[fieldKey] ?? ""}
                            onChange={(event) =>
                              updateGuidance(group.key, fieldKey, event.target.value)
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                </Collapse>
              </section>
            );
          })}
        </div>
        <div className="creative-factor-preview">
          <strong>剧本影响预览</strong>
          <p>{form.scriptInfluence.productType.scriptRole}</p>
          <p>
            面向{form.scriptInfluence.audience.addressee}，
            {form.scriptInfluence.audience.tone}
          </p>
          <p>{storyArcPreview(form.scriptInfluence.strategy.storyArc)}</p>
        </div>
      </section>
      <section className="global-prompt-panel">
        <div className="global-prompt-panel__header">
          <div>
            <span>全局提示词</span>
          </div>
        </div>
        <div className="review-form-grid">
          {COMPILED_REQUIREMENT_FIELDS.map((field) => (
            <label
              className={"wide" in field && field.wide ? "review-form-grid__wide" : undefined}
              key={field.key}
            >
              <div className="compiled-field-title">
                <span>{field.label}</span>
                <SourceChips sources={form.compiledRequirementSourceMap[field.sourceMapKey]} />
              </div>
              <textarea rows={3} value={form[field.key]} readOnly />
            </label>
          ))}
        </div>
      </section>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-secondary"
          disabled={vm.busy || savingDraft}
          onClick={() => {
            void saveRequirementsDraft();
          }}
        >
          {savingDraft ? "正在保存..." : "保存细分字段"}
        </button>
        <button
          type="button"
          className="review-primary"
          disabled={vm.busy || uploading}
          onClick={() => {
            if (assets.length === 0) {
              setUploadMessage("请先上传至少一个商品素材，再提交创作要求。");
              return;
            }
            vm.actions.startCreativeReview(data);
            onActionComplete();
          }}
        >
          <Wand2 size={16} />
          {requirementsArtifact?.isCurrent ? "更新创作要求" : "提交创作要求"}
        </button>
      </div>
      {draftMessage ? <p className="review-muted">{draftMessage}</p> : null}
    </section>
  );
}
