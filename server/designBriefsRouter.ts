import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { invokeLLM, invokeLLMWithUserTool } from "./_core/llm";

export const designBriefsRouter = router({
  /** List all design briefs for the current user, optionally filtered by project */
  list: protectedProcedure
    .input(z.object({ projectId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      return db.listDesignBriefs({ userId: ctx.user.id, projectId: input.projectId });
    }),

  /** Get a single design brief with its version history */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const brief = await db.getDesignBriefById(input.id);
      if (!brief) throw new TRPCError({ code: "NOT_FOUND", message: "任务书不存在" });
      const versions = await db.listDesignBriefVersions(input.id);
      return { brief, versions };
    }),

  /** Get inputs for a specific version (historyId) */
  getInputs: protectedProcedure
    .input(z.object({ historyId: z.number() }))
    .query(async ({ input }) => {
      return db.listDesignBriefInputsByHistory(input.historyId);
    }),

  /** Delete a design brief */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const brief = await db.getDesignBriefById(input.id);
      if (!brief) throw new TRPCError({ code: "NOT_FOUND" });
      if (brief.createdBy !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.deleteDesignBrief(input.id);
      return { success: true };
    }),

  /** Fetch and extract text from a URL for use as input */
  extractUrl: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      let pageText = "";
      let title = "";
      try {
        const resp = await fetch(input.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; N1Bot/1.0)" },
          signal: AbortSignal.timeout(10000),
        });
        const html = await resp.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
        title = (ogTitle?.[1] || titleMatch?.[1] || new URL(input.url).hostname).trim();
        pageText = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 8000);
      } catch {
        title = new URL(input.url).hostname;
        pageText = `无法获取页面内容（可能需要登录权限）。URL: ${input.url}`;
      }
      return { title, extractedText: pageText };
    }),

  /** Generate or iterate a design brief from multiple inputs */
  generate: protectedProcedure
    .input(z.object({
      briefId: z.number().optional(),
      projectId: z.number().optional(),
      title: z.string().optional(),
      textInput: z.string().optional(),
      inputs: z.array(z.object({
        inputType: z.enum(["text", "file", "url", "asset", "document"]),
        label: z.string().optional(),
        textContent: z.string().optional(),
        fileUrl: z.string().optional(),
        webUrl: z.string().optional(),
        extractedText: z.string().optional(),
        assetId: z.number().optional(),
        documentId: z.number().optional(),
      })).default([]),
      instructions: z.string().optional(),
      toolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const startTime = Date.now();

      // 1. Collect all text content from inputs
      const inputParts: string[] = [];

      if (input.textInput?.trim()) {
        inputParts.push(`【直接输入】\n${input.textInput.trim()}`);
      }

      for (const src of input.inputs) {
        const label = src.label || src.inputType;
        const text = src.extractedText || src.textContent || "";
        if (text.trim()) {
          inputParts.push(`【${label}】\n${text.trim()}`);
        }
      }

      // 2. Get previous version content if iterating
      let previousContent = "";
      let parentHistoryId: number | undefined;
      let currentVersion = 1;
      let existingBriefId = input.briefId;

      if (existingBriefId) {
        const existingBrief = await db.getDesignBriefById(existingBriefId);
        if (existingBrief) {
          currentVersion = (existingBrief.currentVersion ?? 1) + 1;
          parentHistoryId = existingBrief.latestHistoryId ?? undefined;
          if (parentHistoryId) {
            const versions = await db.listDesignBriefVersions(existingBriefId);
            if (versions.length > 0) {
              previousContent = versions[0].outputContent || "";
            }
          }
        }
      }

      // 3. Get project context if bound
      let projectContext = "";
      if (input.projectId) {
        const project = await db.getProjectById(input.projectId);
        if (project) {
          projectContext = `项目名称：${project.name}\n项目编号：${project.code || "-"}\n甲方：${(project as any).clientName || "-"}\n项目概况：${(project as any).projectOverview || "-"}\n商业目标：${(project as any).businessGoal || "-"}`;
        }
      }

      // 4. Build LLM prompt
      const systemPrompt = `你是 N+1 STUDIOS 建筑设计事务所的设计任务书生成专家。请根据用户提供的输入材料，生成一份结构化的设计任务书（Design Brief）。

任务书应包含以下章节（根据可用信息填写，信息不足的章节可注明"待补充"）：

# 设计任务书

## 一、项目概况
- 项目名称
- 项目地点
- 建设单位（甲方）
- 项目类型
- 建设规模（面积/层数等）
- 项目阶段

## 二、设计背景与目标
- 项目背景
- 核心设计目标
- 品牌/企业形象要求

## 三、空间需求
- 功能分区与空间清单（以表格形式呈现，含：空间名称、面积要求、数量、备注）
- 特殊空间需求
- 流线与动线要求

## 四、设计要求
- 风格定位
- 材料与工艺要求
- 照明要求
- 声学/环境要求
- 可持续性要求

## 五、技术指标
- 建筑技术要求
- 结构要求
- 机电要求
- 消防与安全要求

## 六、时间与预算
- 设计周期
- 施工周期
- 预算范围

## 七、交付要求
- 设计成果清单
- 汇报节点
- 特殊要求

## 八、附注
- 其他说明
- 参考案例

格式要求：
- 使用 Markdown 格式，表格用 Markdown 表格语法
- 数字和单位要具体（如 "约 2000㎡" 而非 "较大面积"）
- 信息不足处标注 "待补充" 而非猜测
- 语言专业、简洁、准确`;

      const userMessages: Array<{ role: "user" | "system" | "assistant"; content: string }> = [];

      if (projectContext) {
        userMessages.push({ role: "user", content: `项目基本信息：\n${projectContext}` });
      }

      if (inputParts.length > 0) {
        userMessages.push({ role: "user", content: `以下是本次输入的参考材料：\n\n${inputParts.join("\n\n")}` });
      }

      if (previousContent && currentVersion > 1) {
        userMessages.push({
          role: "user",
          content: `以下是上一版本的任务书内容，请在此基础上整合新输入的信息进行迭代更新：\n\n${previousContent}`,
        });
      }

      if (input.instructions?.trim()) {
        userMessages.push({ role: "user", content: `本次迭代的特别说明：${input.instructions.trim()}` });
      }

      if (userMessages.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "请至少提供一项输入内容" });
      }

      userMessages.push({ role: "user", content: "请生成设计任务书。" });

      // 5. Call LLM
      const llmMessages = [
        { role: "system" as const, content: systemPrompt },
        ...userMessages,
      ];
      const llmResp = input.toolId
        ? await invokeLLMWithUserTool({ messages: llmMessages }, ctx.user.id, input.toolId)
        : await invokeLLM({ messages: llmMessages });

      const content = llmResp.choices?.[0]?.message?.content;
      const outputContent = typeof content === "string" ? content : "生成失败，请重试";

      // 6. Auto-generate title
      const briefTitle = input.title?.trim() ||
        (input.projectId ? `设计任务书 V${currentVersion}` : `设计任务书 ${new Date().toLocaleDateString("zh-CN")} V${currentVersion}`);

      // 7. Save to generationHistory
      const historyResult = await db.createGenerationHistory({
        userId: ctx.user.id,
        module: "design_brief",
        title: briefTitle,
        summary: `版本 ${currentVersion}，包含 ${input.inputs.length + (input.textInput ? 1 : 0)} 项输入`,
        outputContent,
        status: "success",
        durationMs: Date.now() - startTime,
        parentId: parentHistoryId ?? null,
        projectId: input.projectId ?? null,
        createdByName: ctx.user.name ?? undefined,
      });

      // 8. Save inputs record
      const inputsToSave: any[] = [];
      if (input.textInput?.trim()) {
        inputsToSave.push({
          historyId: historyResult.id,
          inputType: "text" as const,
          textContent: input.textInput.trim(),
          label: "直接输入",
        });
      }
      for (const src of input.inputs) {
        inputsToSave.push({
          historyId: historyResult.id,
          inputType: src.inputType,
          label: src.label || undefined,
          textContent: src.textContent || undefined,
          fileUrl: src.fileUrl || undefined,
          webUrl: src.webUrl || undefined,
          extractedText: src.extractedText || undefined,
          assetId: src.assetId || undefined,
          documentId: src.documentId || undefined,
        });
      }
      await db.createDesignBriefInputs(inputsToSave);

      // 9. Create or update the designBrief record
      if (existingBriefId) {
        await db.updateDesignBrief(existingBriefId, {
          latestHistoryId: historyResult.id,
          currentVersion,
          title: briefTitle,
          projectId: input.projectId ?? undefined,
        });
      } else {
        const newBrief = await db.createDesignBrief({
          projectId: input.projectId ?? null,
          title: briefTitle,
          latestHistoryId: historyResult.id,
          currentVersion: 1,
          createdBy: ctx.user.id,
        });
        existingBriefId = newBrief.id;
      }

      return {
        briefId: existingBriefId,
        historyId: historyResult.id,
        content: outputContent,
        version: currentVersion,
        title: briefTitle,
      };
    }),
});
