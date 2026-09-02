# 家宴计划：家庭智能配餐系统

这是一个从零开发的微信小程序课程设计项目，包含原生小程序前端、Node.js/Express API 和 MySQL 8 关系数据库。

## 本机运行

1. 安装 MySQL 8 和 Node.js 18+。
2. 复制 `server/.env.example` 为 `server/.env`，填写 MySQL 密码。
3. 用管理员 MySQL 账号执行 `database/00_create_user.sql`。
4. 在项目根目录执行：`cd server; npm install; npm run db:init; npm run db:seed; npm start`。
5. 在微信开发者工具中打开 `E:\Database_Design`，开发设置中关闭合法域名校验。

## 功能

- 推荐：按人数、最大耗时和均衡/健康/快速模式生成一桌菜。
- 菜单：按日期查看和手动删除菜单项，推荐结果确认后写入。
- 菜谱：搜索、分类筛选、新增、删除和详情查看。
- 设置：账户、家庭创建/加入、邀请码复制和洞察统计。

## 数据库

`database/01_schema.sql` 使用 InnoDB、外键、唯一约束和检查约束实现实体、参照和用户定义完整性；`database/02_seed.sql` 提供可演示的示例家庭、食材和菜谱。
