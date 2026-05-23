import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import type { CreateCreativeBlueprintRequest } from "@aigc-video/shared";
import {
  toAbsoluteAssetUrl,
  uploadProductImage
} from "../../lib/api/client.js";

interface MaterialFormProps {
  onSubmit: (input: CreateCreativeBlueprintRequest) => Promise<void>;
  isSubmitting: boolean;
}

const defaultValues: CreateCreativeBlueprintRequest = {
  title: "",
  sellingPoints: "",
  audience: "",
  stylePreference: "",
  imageUrl: ""
};

export function MaterialForm({ onSubmit, isSubmitting }: MaterialFormProps) {
  const { register, handleSubmit, setValue, watch } =
    useForm<CreateCreativeBlueprintRequest>({
    defaultValues
  });
  const imageUrl = watch("imageUrl");
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);
    try {
      const asset = await uploadProductImage(file);
      setValue("imageUrl", asset.url, { shouldDirty: true, shouldValidate: true });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form className="panel form-grid" onSubmit={handleSubmit(onSubmit)}>
      <label>
        <span>商品标题</span>
        <input {...register("title", { required: true })} />
      </label>
      <label>
        <span>核心卖点</span>
        <textarea rows={3} {...register("sellingPoints", { required: true })} />
      </label>
      <label>
        <span>目标人群</span>
        <input {...register("audience", { required: true })} />
      </label>
      <label>
        <span>风格偏好</span>
        <input {...register("stylePreference", { required: true })} />
      </label>
      <label>
        <span>商品主图 URL</span>
        <input {...register("imageUrl", { required: true })} />
      </label>
      <label>
        <span>上传商品主图</span>
        <input type="file" accept="image/*" onChange={handleFileChange} />
      </label>
      {imageUrl ? (
        <img
          className="product-image-preview"
          src={toAbsoluteAssetUrl(imageUrl)}
          alt="商品主图预览"
        />
      ) : null}
      <button type="submit" disabled={isSubmitting || isUploading}>
        {isUploading ? "上传中..." : isSubmitting ? "生成中..." : "生成创作蓝图"}
      </button>
    </form>
  );
}
