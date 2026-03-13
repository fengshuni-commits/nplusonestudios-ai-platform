import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Download, ExternalLink } from "lucide-react";
import { useState } from "react";

type HelpGuideProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function HelpGuide({ open, onOpenChange }: HelpGuideProps) {
  const guideContent = `
# 🎨 AI 效果图功能使用指南

## 功能概述
AI 效果图功能利用先进的人工智能模型，根据您的文字描述快速生成专业级的建筑设计效果图。无需复杂的建模和渲染过程，您可以在几秒内获得多个设计方案，加速设计迭代和客户沟通。

## 快速开始（6 步）
1. 打开 AI 效果图页面
2. 在左侧输入框中输入设计描述（例如：'现代办公空间，落地窗，木地板，自然采光'）
3. （可选）上传参考图片或从素材库选择
4. 点击 **生成图像** 按钮
5. 等待 AI 生成（通常 10-30 秒）
6. 查看生成结果，点击 **喜欢** 或 **不满意** 进行反馈

## 详细功能说明

### 1. 文本生成 - 从描述到效果图
这是最基础的功能。您只需用文字描述您的设计理念，AI 就会为您生成对应的效果图。

**描述撰写技巧：**
- 使用具体的形容词和材料名称，而不是模糊的表述
- 按照 '空间类型 + 风格 + 材料 + 光线 + 功能' 的顺序组织描述
- 参考成功案例的描述方式，逐步优化您的提示词
- 对于复杂的设计，可以分步骤生成

### 2. 图生图 - 基于参考图片进行创意迭代
上传一张参考图片，AI 将根据您的新描述进行创意迭代，保留原图的整体构图和风格，同时融入新的设计元素。

### 3. 局部重绘 - 精细调整特定区域
对于已生成的效果图，您可以用画笔标注需要修改的区域，然后输入修改描述，AI 将只修改标注区域，保持其余部分原样。

### 4. 素材库集成
您上传的参考图片和素材会自动同步到团队素材库，其他成员可以复用这些素材，提高团队协作效率。

### 5. 画质增强 - Magnific AI 超分辨率
对于已生成的效果图，您可以使用 Magnific AI 将图片放大并增强画质，让效果图更清晰、细节更丰富，适合用于客户汇报或打印输出。

**操作步骤：**
1. 在生成结果下方，点击 **增强画质** 按钮，展开参数面板
2. 根据需要调整参数（详见下方参数说明）
3. 点击 **开始增强**，等待 AI 处理（通常 30-60 秒）
4. 增强完成后，图片自动显示在原图下方，点击 **下载增强版** 保存

**参数说明：**
- **放大倍数** — 2x（将分辨率翻倍）或 4x（分辨率提升四倍），建议先用 2x 确认效果
- **优化场景** — 选择「3D渲染」可获得最佳效果图增强效果；「建筑」适合实景照片；「通用」适合其他类型
- **创意度**（-5 ~ +5）— 正值让 AI 自由补全更多细节，负值更忠实于原图；建议从 0 开始
- **细节度**（-5 ~ +5）— 正值增强纹理和材质细节，负值使画面更柔和；建议设为 +1 ~ +2
- **相似度**（-5 ~ +5）— 正值与原图更接近，负值允许 AI 做更多创意改进；建议设为 0

**使用建议：**
- 对于汇报用效果图，推荐：2x 放大 + 3D渲染 + 创意度 0 + 细节度 +2 + 相似度 0
- 对于打印大图，推荐：4x 放大 + 3D渲染 + 创意度 +1 + 细节度 +3 + 相似度 -1
- 增强功能由 Magnific AI（Freepik 旗下）提供，每次增强会消耗少量 API 配额

### 6. 项目关联
将生成的效果图直接关联到项目看板，便于团队成员查阅和协作。

**操作步骤：**
1. 在生成结果下方，点击 **关联项目** 按钮
2. 系统将自动关联当前项目（如已在项目内打开 AI 效果图）
3. 图片将自动添加到项目的"成果"中，并显示您的创建者信息

### 7. 反馈与评价
对生成的效果图进行反馈，帮助 AI 模型持续优化。

**操作步骤：**
1. 在生成结果下方，您会看到 **👍（喜欢）** 和 **👎（不满意）** 两个反馈按钮
2. 点击相应按钮表达您对该图片的评价
3. 您的反馈将被记录，用于改进 AI 生成质量

**反馈指南：**
- **点击"喜欢"** — 当图片符合预期、质量高、细节准确时
- **点击"不满意"** — 当图片存在问题、不符合描述或需要改进时

## 工具选择与管理

### 使用默认工具
平台支持配置默认 AI 工具。**每次打开 AI 效果图页面时，系统会自动重置为管理员设置的默认工具**。这确保团队成员始终使用最新的推荐工具。

**临时更换工具：** 如需在当前会话中使用其他 AI 工具，点击工具选择器（顶部工具栏中的"AI 工具"下拉菜单）选择。您的选择仅在本次会话中有效，关闭页面后会重置为默认工具。

**提示：** 每次重新打开 AI 效果图页面时，工具选择都会自动重置为默认工具。这样可以确保团队成员在管理员更新默认工具后，立即使用最新的 AI 工具。

## 最佳实践

### 1. 描述撰写技巧
- 使用具体的形容词和材料名称，而不是模糊的表述
- 按照 '空间类型 + 风格 + 材料 + 光线 + 功能' 的顺序组织描述
- 参考成功案例的描述方式，逐步优化您的提示词
- 对于复杂的设计，可以分步骤生成（先生成基础空间，再通过图生图添加细节）

### 2. 迭代工作流
- **第一步：** 生成 3-5 个基础方案，选择最接近理想的一个
- **第二步：** 使用图生图功能，基于最佳方案进行风格或细节调整
- **第三步：** 使用局部重绘功能，精细调整特定区域
- **第四步：** 对最终满意的图片使用「增强画质」功能，提升分辨率后用于汇报或打印
- **第五步：** 对满意的结果进行反馈，帮助 AI 学习您的偏好

### 3. 团队协作建议
- 在项目看板中关联所有生成的效果图，便于团队查阅和讨论
- 使用素材库共享参考图片和成功案例，帮助团队成员学习最佳实践
- 定期审查生成的效果图质量，提供反馈以改进 AI 模型
- 为不同类型的项目建立描述模板，提高生成效率

## 常见问题

**Q1: 生成一张图片需要多长时间？**
A: 通常需要 10-30 秒，具体时间取决于 AI 工具的负载和您的描述复杂度。

**Q7: 画质增强需要多长时间？**
A: 通常需要 30-60 秒。增强过程在后台异步进行，系统会自动轮询状态，完成后立即显示结果，无需手动刷新。

**Q8: 增强后的图片分辨率是多少？**
A: 取决于原图分辨率和放大倍数。例如原图 1024x1024，2x 增强后为 2048x2048，4x 增强后为 4096x4096。

**Q9: 可以对同一张图片多次增强吗？**
A: 目前每张图片支持一次增强。如需重新增强（例如调整参数），可以在增强完成后重新提交。

**Q2: 我可以生成多少张图片？**
A: 没有限制。您可以无限生成，所有生成记录都会保存在"生成记录"页面中。

**Q3: 生成的图片可以商用吗？**
A: 取决于您使用的 AI 工具的许可条款。请咨询管理员或查阅相关工具的使用协议。

**Q4: 如何改进生成质量？**
A: 提供更详细的描述、使用参考图片、进行反馈评价，以及参考成功案例的描述方式。

**Q5: 我的生成记录会保存多久？**
A: 所有生成记录都会永久保存。您可以随时在"生成记录"页面查看和管理您的历史记录。

**Q6: 如何删除我的生成记录？**
A: 在"生成记录"页面，您可以删除自己创建的记录。管理员也可以在项目看板中删除任何成员的成果。

## 获取帮助
如有任何问题或建议，请联系您的项目管理员或提交反馈。我们持续改进 AI 效果图功能，您的意见对我们很重要！
  `;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>🎨 AI 效果图使用指南</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <div className="space-y-4 text-sm text-foreground/90">
            {guideContent.split('\n').map((line, idx) => {
              if (line.startsWith('# ')) {
                return <h1 key={idx} className="text-2xl font-bold mt-6 mb-4">{line.replace('# ', '')}</h1>;
              }
              if (line.startsWith('## ')) {
                return <h2 key={idx} className="text-xl font-bold mt-5 mb-3 text-primary">{line.replace('## ', '')}</h2>;
              }
              if (line.startsWith('### ')) {
                return <h3 key={idx} className="text-lg font-semibold mt-4 mb-2">{line.replace('### ', '')}</h3>;
              }
              if (line.startsWith('- ')) {
                return <li key={idx} className="ml-4">{line.replace('- ', '')}</li>;
              }
              if (line.startsWith('**') && line.includes(':')) {
                return <p key={idx} className="font-semibold mt-2">{line}</p>;
              }
              if (line.trim() === '') {
                return <div key={idx} className="h-2" />;
              }
              return <p key={idx} className="leading-relaxed">{line}</p>;
            })}
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('https://files.manuscdn.com/user_upload_by_module/session_file/310519663304605552/HuBQuntBuVNNlrnj.html', '_blank')}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            查看完整版
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
