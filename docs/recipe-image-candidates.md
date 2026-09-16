# 小红书菜谱图片候选记录

> 素材来源与版权核验历史记录，不是当前业务接口或数据库状态说明。当前实现请以 [CURRENT_VERSION.md](/E:/Database_Design/docs/CURRENT_VERSION.md) 为准。

本轮使用 Agent-Reach 的 OpenCLI 小红书适配器。按当前确认的简化规则，每道试点菜只取搜索结果第一条笔记，并检查该笔记的第一张图片。公开可访问不代表获得版权授权；实际采用的小红书素材均标记为 `REFERENCE_ONLY`，用途限定为课程 / 本地 Demo 技术验证。

## 小红书图片检索能力检查

- 搜索：可用，`opencli xiaohongshu search <query> -f json`
- 笔记标题：可用
- 笔记 URL / ID：可用，搜索结果带 `xsec_token`
- 作者：可用
- 笔记正文：可用，使用完整搜索结果 URL 调用 `note`
- 图片查看：可用，使用 `download` 获取笔记媒体到临时目录后查看
- 图片获取：可用，首条笔记的图片可下载；部分笔记包含视频或会触发风控
- 原图 / 清晰度：可获得笔记返回的图片文件，但不承诺原始作者上传分辨率
- 下厨房：Agent-Reach 当前没有专用适配器，Jina Reader 匿名访问被拦截，本轮不等待

## 5 道试点记录

### Recipe ID 1 — 番茄炒蛋

- Query: `番茄炒蛋 家常菜`
- Candidate 1: `拉丝番茄炒蛋` / 杨厨家常菜
- Original URL: https://www.xiaohongshu.com/search_result/6a5c9aef000000002201acc8?xsec_token=ABP6jAb3zAwANLIR2kAhEsOnPw9AHpWCqBw8hRNdWDRUY=&xsec_source=
- Image sequence: first image (`_2.jpg`; first media was video)
- Grade: `Reject`
- Reason: 菜品语义正确，但有明显大字覆盖和平台水印；不覆盖既有 Pexels 素材
- Final: `KEEP_EXISTING`

### Recipe ID 5 — 清炒菠菜

- Query: `清炒菠菜 家常菜`
- Candidate 1: `春天必吃！清炒菠菜，鲜爽不涩` / 小胖爱做饭🥄
- Original URL: https://www.xiaohongshu.com/search_result/69b27a5b000000000601eb0d?xsec_token=ABkvkKKl2sWyskCGlAckBg8HC09msp_90aj--TF9W9Ogg=&xsec_source=
- Image sequence: 1
- Original size: 1080 × 1440
- Grade: `B`
- Visual evaluation: 白盘、浅灰背景、单道菜主体清晰；竖图裁成 4:3 后仍保留主体
- Semantic evaluation: 清炒菠菜与蒜末，匹配
- Authorization: `REFERENCE_ONLY`
- Local file: `stir-fried-spinach.jpg`
- cover_url: `/assets/recipes/stir-fried-spinach.jpg`

### Recipe ID 7 — 土豆焖饭

- Query: `土豆焖饭 家常菜`
- Candidate 1: `免开火的6款夏日懒人焖饭巨巨好吃😋0失败` / 欣欣MaMa
- Original URL: https://www.xiaohongshu.com/search_result/68889f5f000000002501f201?xsec_token=ABWcT-tic0TJbvH6RJixO0SbqnAJ2mwMd-3JzNvaL-xJQ=&xsec_source=
- Image sequence: 1
- Grade: `Reject`
- Reason: 第一张是多菜拼图并有文字，不能确认是单一道土豆焖饭
- Final: `NO_GOOD_MATCH`; 保持 UI fallback

### Recipe ID 8 — 清蒸鲈鱼

- Query: `清蒸鲈鱼 家常菜`
- Candidate 1: `清蒸鲈鱼封神！全靠这碗料汁🔥` / 小陈的家庭厨房
- Original URL: https://www.xiaohongshu.com/search_result/6a058210000000003601f1f3?xsec_token=ABRkNQnCpr1S3zRAMgCFOvHzApcgePNBPgSjMzN-8HRbc=&xsec_source=
- Image sequence: 1
- Grade: `Reject`
- Reason: 第一张有大字覆盖，不适合 UI；不使用后续图片替代
- Final: `NO_GOOD_MATCH`; 保持 UI fallback

### Recipe ID 33 — 玉米排骨汤

- Query: `玉米排骨汤 家常菜`
- Candidate 1: `玉米排骨汤，冬天夏天都很爱喝🥣` / 搞一碗好菜778
- Original URL: https://www.xiaohongshu.com/search_result/6a646383000000000e037990?xsec_token=ABVRrrLxFc9k89e3h8b2EkBm_c7Tvxc8ryXLrKQkNA1n4=&xsec_source=
- Image sequence: 1
- Original size: 900 × 1200
- Grade: `B`
- Visual evaluation: 浅色碗具、明亮干净、汤品主体清晰；裁成 4:3 后仍可识别
- Semantic evaluation: 玉米、排骨、清汤均明确，匹配
- Authorization: `REFERENCE_ONLY`
- Local file: `corn-ribs-soup.jpg`
- cover_url: `/assets/recipes/corn-ribs-soup.jpg`

## 既有素材覆盖尝试

| Recipe ID | 菜名 | 搜索结果第一条第一张 | 处理 |
|---:|---|---|---|
| 1 | 番茄炒蛋 | 有大字覆盖 | 保留既有素材 |
| 2 | 蒜蓉西兰花 | 含肉末，语义不够准确 | 保留既有素材 |
| 3 | 冬瓜虾仁汤 | 有大字覆盖 | 保留既有素材 |
| 4 | 香煎鸡胸肉 | 有大字覆盖 | 保留既有素材 |
| 6 | 家常豆腐汤 | 实际为虾仁豆腐蔬菜汤 | 保留既有素材 |

## 批量首图结果（新增采用 12 张）

以下均为对应中文菜名搜索的第一条笔记、第一张图片；只保留通过语义、构图和清洁度筛选的首图。来源是小红书用户内容，未声明为开放图库许可，因此仅标记为 `REFERENCE_ONLY`，用于课程 / 本地 Demo。

| ID | 菜名 | 原始作品页 | 作者 | 首图筛选 | 本地文件 |
|---:|---|---|---|---|---|
| 9 | 青椒肉丝 | [作品页](https://www.xiaohongshu.com/search_result/68aae3b4000000001d023227?xsec_token=ABT21CtIfbIxKKiPZbari4vgh22pAvyPmH701UsrM8QWU=&xsec_source=) | 桃小姐美食记 | 通过：单道成品、主体清晰、无人物/Logo/大字 | `green-pepper-pork.jpg` |
| 10 | 土豆炖牛肉 | [作品页](https://www.xiaohongshu.com/search_result/692d61f3000000001f0045a2?xsec_token=ABETKrYz3WnP87XYxDqR7XTaBOpVSn1XRXX1qzg2MPQN0=&xsec_source=) | 面包女孩 | 通过：牛肉与土豆主体明确、适合裁切 | `potato-beef-stew.jpg` |
| 11 | 香菇滑鸡 | [作品页](https://www.xiaohongshu.com/search_result/69ae9226000000001a0251f2?xsec_token=AB8N8TX_VnfWuWd0HKK6k-L6ndL-yieaZcwJF_t8BeG9k=&xsec_source=) | 面包女孩 | 通过：香菇鸡肉成品清晰、无明显覆盖文字 | `shiitake-chicken.jpg` |
| 12 | 虾仁炒蛋 | [作品页](https://www.xiaohongshu.com/search_result/69db7747000000001a0227aa?xsec_token=ABLWDPRrEJrmhtNIH_XDFO0u_dC3SWbVuTZMpTBKd5vGw=&xsec_source=) | 金妈的减脂日记（日更） | 通过：虾仁与蛋主体明确、浅色餐盘 | `shrimp-scrambled-eggs.jpg` |
| 13 | 糖醋里脊 | [作品页](https://www.xiaohongshu.com/search_result/69b287d1000000000b0348ea?xsec_token=ABkvkKKl2sWyskCGlAckBg8PBrKpY0Aba6mBMDz4uopbI=&xsec_source=) | 静静小厨房🍡 | 通过：里脊成品明确、主体居中 | `sweet-and-sour-pork.jpg` |
| 16 | 蒜苔炒肉 | [作品页](https://www.xiaohongshu.com/search_result/682928f9000000000303ec85?xsec_token=ABvakIfy8-BNbxCrNPPA6fkw4SAbM57QRMIh1-VP5mYr0=&xsec_source=) | 小六子吃货日记 | 通过：蒜苔与肉片明确、单盘成品 | `garlic-chive-pork.jpg` |
| 19 | 宫保鸡丁 | [作品页](https://www.xiaohongshu.com/search_result/6a79c8f10000000005031529?xsec_token=ABJulVkCwWTOByjkRl1mXa8CNTBVjsV8gS4CgMH-4uSUU=&xsec_source=) | 河马食堂 | 通过：鸡丁与花生成品清晰 | `kung-pao-chicken.jpg` |
| 20 | 清炒菜心 | [作品页](https://www.xiaohongshu.com/search_result/69720554000000001a02f6e3?xsec_token=ABmPr8e1uIv9uUtejVW7IyXnQrIB-PVPvJqenRQJ7mv-0=&xsec_source=) | 小胖爱做饭🥄 | 通过：单道绿叶菜、浅色餐盘 | `stir-fried-choy-sum.jpg` |
| 24 | 家常茄子 | [作品页](https://www.xiaohongshu.com/search_result/688de22a000000002303349d?xsec_token=ABTyj4c242AtQQTXdRGQ-mJt50F7tZa4dnCCbNG6OGAY4=&xsec_source=) | 面包女孩 | 通过：茄子成品明确、主体集中 | `homestyle-eggplant.jpg` |
| 25 | 地三鲜 | [作品页](https://www.xiaohongshu.com/search_result/68bd3c5c000000001d00fb3c?xsec_token=ABJvQ8MUzzMGXOF69I6nSP87Z5-4X_NWnDTgoTZ-7d37s=&xsec_source=) | 再吃一口 | 通过：土豆、茄子、青椒均可辨识 | `di-san-xian.jpg` |
| 27 | 清炒荷兰豆 | [作品页](https://www.xiaohongshu.com/search_result/691d3a4a000000001e02b073?xsec_token=AB-WBy7s909j8y9NmKYqzM7BDvUxEKy8K9F3R9nj0tN98=&xsec_source=) | 星星做饭记 | 通过：荷兰豆单盘成品、构图简洁 | `stir-fried-snow-peas.jpg` |
| 34 | 海带豆腐汤 | [作品页](https://www.xiaohongshu.com/search_result/66dc5411000000002603e820?xsec_token=ABqLRjY8FG_AwpxzXbIhGZXaKholRGbpH9GfBhpRe05ww=&xsec_source=) | 月月追兔兔 | 通过：豆腐、海带和汤体可辨识，浅色碗具 | `seaweed-tofu-soup.jpg` |

批量拒绝的首图包括：含大字、拼图、人物、首媒体为视频、只拍食材或明显不是目标成品。未通过者保持 `cover_url=''`，由小程序 fallback 展示；不会为了覆盖率把错误图片写入 seed。

## 备注

- 临时下载文件保存在 `C:\tmp\recipe-image-pipeline\`，未将平台临时文件直接当作项目资源使用。
- 本地项目资源统一位于 `miniprogram/assets/recipes/`。
- 最终资源统一处理为 800 × 600、4:3 JPEG；这是在不明显损失手机端清晰度的前提下满足微信开发者工具 2 MB 自动预览包限制的折中。
- 本轮没有修改 schema、推荐算法或菜单页 UI。
