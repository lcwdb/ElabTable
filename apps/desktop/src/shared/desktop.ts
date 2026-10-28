import { z } from 'zod'

// ==========================================
// 1. 频道常量定义
// ==========================================
// channel 仅供 main/preload 使用；界面通过命名 API 调用。
// 使用 as const 将其转为只读常量，TypeScript 可以提取确切的字面量类型
export const desktopChannels = {
  getAppInfo: 'desktop:get-app-info',
  windowState: 'desktop:window-state',
} as const

// ==========================================
// 2. 入参校验 (Input Schema)
// ==========================================
// 请求必须恰好包含一个对象参数，未知字段和多余参数都拒绝。
// z.tuple 确保参数数组长度严格为 1；z.strictObject 拒绝任何未定义的额外字段
export const appInfoArgsSchema = z.tuple([
  z.strictObject({ requestId: z.uuid() }), // 强制要求提供合法的 UUID 用于请求追踪
])

// ==========================================
// 3. 核心数据结构 (Data Schemas)
// ==========================================
// 窗口状态结构
export const windowStateSchema = z.strictObject({
  maximized: z.boolean(), // 是否最大化
  // 每个原生窗口自己的递增序号，用于避免旧快照覆盖新事件。
  // 必须是大于等于 0 的整数 (int + nonnegative)
  revision: z.number().int().nonnegative(),
})

// 应用信息返回结构
export const appInfoSchema = z.strictObject({
  version: z.string().min(1), // 版本号不能为空
  platform: z.enum(['darwin', 'win32', 'linux']), // 严格限制操作系统枚举，防止返回其他系统的值
  windowState: windowStateSchema, // 嵌套复用上面定义的窗口状态
})

// ==========================================
// 4. 统一返回结果结构 (Result Schema)
// ==========================================
// 使用 discriminatedUnion（可辨识联合）根据 'ok' 字段来区分成功和失败状态
export const appInfoResultSchema = z.discriminatedUnion('ok', [
  // 成功分支：ok 必须是 true，且必须包含 data
  z.strictObject({ ok: z.literal(true), data: appInfoSchema }),
  // 失败分支：ok 必须是 false，且必须包含 error 详情
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      // 错误码严格限制在指定的枚举范围内，防止抛出未定义的异常
      code: z.enum([
        'FORBIDDEN',
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'IPC_UNAVAILABLE',
        'INVALID_RESPONSE',
      ]),
      message: z.string(), // 给用户或开发者的错误提示
    }),
  }),
])

// ==========================================
// 5. 类型推导 (Type Inference)
// ==========================================
// 类型从运行时 Schema 推导，避免接口与校验规则各写一套（Single Source of Truth）
export type WindowState = z.infer<typeof windowStateSchema>
export type AppInfoResult = z.infer<typeof appInfoResultSchema>

// ==========================================
// 6. 暴露给前端的 API 接口定义 (API Interface)
// ==========================================
export interface DesktopApi {
  /**
   * 获取应用信息
   * @returns 返回一个 Promise，结果符合 AppInfoResult 结构
   */
  getAppInfo(): Promise<AppInfoResult>

  /**
   * 监听窗口状态变化
   * @param listener 状态变化时的回调函数，接收符合 WindowState 结构的参数
   * @returns 返回一个取消监听的函数，防止内存泄漏
   */
  onWindowState(listener: (state: WindowState) => void): () => void
}
