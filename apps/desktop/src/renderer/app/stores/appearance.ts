// 按本节给出的目标文件填写；替换示例不要重复追加。
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useAppearanceStore = defineStore('appearance', () => {
  // 仅保存本次页面运行的偏好，刷新后重置。
  const compact = ref(false)

  // 通过统一操作入口修改共享状态。
  function toggleCompact() {
    compact.value = !compact.value
  }

  return { compact, toggleCompact }
})
