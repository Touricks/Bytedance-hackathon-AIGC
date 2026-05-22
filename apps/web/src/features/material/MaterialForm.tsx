import { useForm } from "react-hook-form";
import type { CreateGenerationJobRequest } from "@aigc-video/shared";

interface MaterialFormProps {
  onSubmit: (input: CreateGenerationJobRequest) => Promise<void>;
  isSubmitting: boolean;
}

const defaultValues: CreateGenerationJobRequest = {
  title: "Portable Mini Blender",
  sellingPoints: "USB-C charging, easy cleaning, powerful smoothie blending",
  audience: "busy office workers and fitness beginners",
  imageUrl: "/mocks/products/demo-product.svg"
};

export function MaterialForm({ onSubmit, isSubmitting }: MaterialFormProps) {
  const { register, handleSubmit } = useForm<CreateGenerationJobRequest>({
    defaultValues
  });

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
        <span>商品主图 URL</span>
        <input {...register("imageUrl", { required: true })} />
      </label>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "创建中..." : "一键生成带货视频"}
      </button>
    </form>
  );
}
