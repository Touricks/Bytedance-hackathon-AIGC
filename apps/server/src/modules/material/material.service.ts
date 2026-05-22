import { materialRepository } from "./material.repository.js";

export const materialService = {
  registerProductImage(imageUrl: string) {
    return materialRepository.createProductImageAsset(imageUrl);
  }
};
