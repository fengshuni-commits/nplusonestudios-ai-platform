# 7月11日异常生成记录调查结果

## 根本原因

**Vitest 测试文件在生产数据库上执行了真实 API 调用，写入了真实记录。**

具体文件：
- `server/media.test.ts`：使用 `createTestUser({ id: 1 })` 即真实 owner userId=1，调用 `trpc.media.generate()`，测试通过时会真实调用 LLM + 图像生成 API，并写入 `generation_history` 表
- `server/rendering.test.ts`：同样使用 userId=1，调用 `colorPlan.generate({ floorPlanUrl: "https://example.com/floor.png" })`，写入 `generation_history` 表

## 证据

1. `generation_history` 中 7 条记录的 `createdByName` 均为 `"Test User"`
2. `inputParams` 中的 topic 与 media.test.ts 中的测试 topic 完全一致：
   - `"现代办公空间设计趋势"` ← media.test.ts line 79
   - `"建筑设计中的可持续理念"` ← media.test.ts line 101
   - `"Minimalist office design"` ← media.test.ts line 119
3. `floorPlanUrl: "https://example.com/floor.png"` ← rendering.test.ts line 305/326/370
4. `ai_tool_logs` 中 2 条 `action: "rendering_generate"` 记录 `inputSummary: "test scene"` 也是测试产生的
5. `user_sessions` 显示该时间段有多个短暂会话（session_start ≈ last_heartbeat），是测试运行时的会话

## 修复方案

1. **测试文件改用独立测试用户 ID（不使用 userId=1）**：创建 `createTestUser({ id: 999999 })` 或使用随机 ID，避免污染真实用户数据
2. **测试文件在 afterAll 中清理写入的 generation_history 记录**：按 `createdByName = "Test User"` 或按 userId 清理
3. **Mock 外部 API 调用**：在测试中 mock `invokeLLM` 和 `generateImage`，避免真实调用
4. **删除现有的 7 条污染记录**（可选，由用户决定）

## 受影响的测试文件

- `server/media.test.ts`（主要污染源）
- `server/rendering.test.ts`（color_plan 测试）
- `server/history.test.ts`（可能也有）
- `server/feedback.test.ts`（可能也有）
