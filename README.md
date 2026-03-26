# Smart Study Router

一个把 **Keyboard Maestro + Cherry Studio + 本地 Router** 串起来的学习辅助工具。  
它的目标很简单：**你在任意地方选中内容，按下快捷键，内容就会自动发送到 Cherry Studio，并由本地 Router 按内容类型选择合适的讲解方式。**

---

## 项目简介

这套工具主要解决的是「把不同类型的学习内容，用不同风格讲清楚」这件事。

完整流程如下：

1. 你在任意应用中选中一段内容，或触发截图宏。
2. 按下 Keyboard Maestro 快捷键。
3. Keyboard Maestro 自动复制文本（或调用截图流程），打开 Cherry Studio，新建话题，把内容粘贴进去并发送。
4. Cherry Studio 不直接请求大模型，而是把请求发给你本地的 Router。
5. Router 先用分类模型判断内容类型，再为该类型加载对应提示词。
6. Router 再调用回答模型生成正式讲解。
7. Cherry Studio 负责流式显示、多轮对话、历史记录和上下文管理。

你可以把三者理解为：

- **Keyboard Maestro**：启动器 / 自动化入口
- **Cherry Studio**：聊天窗口 / 会话容器
- **Router**：分流器 / 讲解策略中心

---

## 适用场景

这个项目适合拿来处理这些内容：

- Linux / shell 命令
- shell 符号与语法片段
- Python 代码
- C 语言代码
- 技术英文或技术说明文本
- 其他普通学习内容

它尤其适合下面这种使用方式：

- 平时在浏览器、文档、PDF、终端里看到不懂的内容
- 想快速丢给 AI 解释
- 但又不想每次都手动复制、打开聊天窗口、粘贴、输入提示词
- 并且希望不同类型内容能自动使用不同讲解模板

---

## 工作原理

每次发送一条消息时，后台大致会发生这些事情：

1. Cherry Studio 把请求发送到：

```text
http://127.0.0.1:8787/v1/chat/completions
```

2. `server.js` 读取最后一条用户消息。
3. Router 使用 `CLASSIFIER_MODEL` 做内容分类。
4. 分类结果可能是这些类别之一：

- `linux`
- `shell_symbol`
- `python`
- `c`
- `other_code`
- `technical_text`
- `other`

5. Router 去 `prompts.js` 中找到对应类别的：
   - `label`
   - `prompt`

6. Router 把该 `prompt` 作为 system prompt，再调用 `ANSWER_MODEL`。
7. Router 将结果流式返回给 Cherry Studio。
8. Cherry Studio 显示最终结果，例如：

```text
识别类别：Python 代码

AI讲解：
...
```

---

## 项目结构

当前项目的关键结构大致如下：

```text
smart-study-router/
├─ .env
├─ .env.example
├─ .gitignore
├─ package.json
├─ package-lock.json
├─ prompts.js
├─ README.md
├─ server.js
├─ router.log
├─ router.error.log
└─ Keyboard Maestro Macro configuration files/
   ├─ Screenshot Macro for Smart Study.kmmacros
   └─ TextCopy Macro for Smart Study.kmmacros
```

---

## 文件说明

### `.env`
运行配置文件，用来填写你的接口地址、API Key、模型名和端口。

你可以把它理解成这个项目的“本地私密配置”。

常见内容如下：

```env
UPSTREAM_BASE_URL=https://your-provider.example/v1
UPSTREAM_API_KEY=your_api_key_here
CLASSIFIER_MODEL=your_classifier_model
ANSWER_MODEL=your_answer_model
PORT=8787
```

### `.env.example`
环境变量模板文件。  
新用户拿到项目后，可以先复制它，再改成自己的 `.env`。

推荐做法：

```bash
cp .env.example .env
```

然后再把里面的内容改成自己的真实配置。

### `package.json`
Node.js 项目的基础配置文件，记录：

- 项目名
- 依赖包
- 启动命令

通常不需要频繁修改。

### `server.js`
Router 的主程序，负责：

- 接收 Cherry Studio 发来的聊天请求
- 读取用户输入
- 调用分类模型判断内容类型
- 根据分类结果选择 `prompts.js` 中的提示词
- 调用回答模型生成正式讲解
- 把流式结果返回给 Cherry Studio
- 在回答前加上“识别类别 / AI讲解”的输出前缀

### `prompts.js`
所有类别提示词与显示标签的集中配置文件。

以后你想修改：

- AI 讲解风格
- 输出结构
- 不同类型的讲解模板
- 分类显示名称

优先改这个文件。

### `router.log` / `router.error.log`
运行日志文件。

- `router.log`：普通运行日志
- `router.error.log`：错误日志

排查问题时优先看这两个文件。

### `smart-study-router-launchd-维护手册.md`
macOS 下配合 `launchd` / `launchctl` 做后台运行或开机自启动时的维护手册。

### `Keyboard Maestro Macro configuration files/`
这里放的是已经导出的 **Keyboard Maestro 宏配置文件**，方便其他人直接导入使用。  
目前包含：

- `TextCopy Macro for Smart Study.kmmacros`
- `Screenshot Macro for Smart Study.kmmacros`

这两个文件的作用分别是：

- **TextCopy Macro**：把当前选中文本复制并发送到 Cherry Studio
- **Screenshot Macro**：走截图相关流程，再发送到 Cherry Studio

这意味着，拿到本项目的人不需要从零手搓宏流程，可以直接导入这些宏，再按自己的环境稍作调整。

---

## Keyboard Maestro 宏导入说明

如果你也使用 Keyboard Maestro，可以直接导入项目里附带的宏配置文件。

### 导入方法

1. 打开 **Keyboard Maestro**。
2. 在菜单栏选择导入宏，或者直接双击 `.kmmacros` 文件。
3. 导入以下文件之一或全部：

```text
Keyboard Maestro Macro configuration files/TextCopy Macro for Smart Study.kmmacros
Keyboard Maestro Macro configuration files/Screenshot Macro for Smart Study.kmmacros
```

### 导入后建议检查的项目

由于每个人的环境不完全一样，导入后建议检查这些内容：

- 快捷键是否与你现有快捷键冲突
- Cherry Studio 的启动方式是否一致
- 宏里的 Pause 时长是否适合你的机器
- 是否需要修改窗口聚焦或点击步骤
- 是否需要替换成你自己的截图流程

### 说明
仓库里提供宏文件，是为了让项目更容易复现。  
但 Keyboard Maestro 自动化高度依赖本机环境，所以**导入后最好自己完整跑一遍流程测试**。

---

## 快速开始

### 1. 安装依赖

在项目目录中执行：

```bash
npm install
```

### 2. 配置环境变量

先复制模板：

```bash
cp .env.example .env
```

然后编辑 `.env`，填入你自己的：

- 接口地址
- API Key
- 分类模型名
- 回答模型名
- 端口

### 3. 启动 Router

```bash
cd ~/Projects/smart-study-router
npm start
```

如果正常，你会看到类似输出：

```text
✅ Smart Study Router is running at http://127.0.0.1:8787
```

### 4. 健康检查

浏览器打开：

```text
http://127.0.0.1:8787/health
```

如果返回：

```json
{"ok":true}
```

说明 Router 正常运行。

### 5. 在 Cherry Studio 中接入

把自定义 Provider 指向本地 Router：

```text
http://127.0.0.1:8787/v1
```

模型名使用你为这个 Router 约定的名称即可（按你的接入方式配置）。

### 6. 导入 Keyboard Maestro 宏

把仓库中附带的 `.kmmacros` 宏文件导入 Keyboard Maestro。  
之后按快捷键测试整条链路是否正常。

---

## 日常使用方式

### 文本发送流程
1. 在任意应用中选中一段文字。
2. 触发 TextCopy 宏。
3. Keyboard Maestro 自动复制内容并打开 Cherry Studio。
4. 自动新建话题、粘贴、发送。
5. Cherry Studio 通过本地 Router 获取回答。

### 截图发送流程
1. 触发 Screenshot 宏。
2. 走截图相关动作。
3. 把截图内容送入 Cherry Studio。
4. 由 Router 按类型进行讲解或处理。

---

## 后期维护：你通常会改哪里

### 想改 AI 的回答风格
改：`prompts.js`

例如：

- Python 是否逐行解释
- Linux 命令是否加“记忆方法”
- 技术文本是否先翻译再解释
- 输出结构是否增加“关键词说明”

### 想改分类逻辑
改：`server.js`

例如：

- 新增类别
- 修改分类 prompt
- 修改分类结果映射逻辑
- 调整默认回退分类

### 想改快捷键、自动化顺序、打开方式
改：Keyboard Maestro 宏

例如：

- 快捷键
- 是否先新建话题
- Pause 长短
- 是否增加点击输入框
- 是否修改截图流程

### 想改聊天窗口、多轮对话、历史记录
看：Cherry Studio

这些通常不是 Router 决定的，而是 Cherry Studio 的职责。

---

## `prompts.js` 维护方式

`prompts.js` 是这个项目最值得长期打磨的文件。  
里面每个类别大致长这样：

```js
linux: {
  label: "Linux 命令 / shell 命令",
  prompt: `
你是我的 Linux 命令学习老师。
...
  `.trim(),
}
```

其中：

### `label`
给用户看的类别名称。  
会显示在回复开头，例如：

```text
识别类别：Linux 命令 / shell 命令
```

### `prompt`
给回答模型看的系统提示词。  
它决定：

- 解释风格
- 回答结构
- 细节深度
- 是否面向初学者
- 是否强调原理、语法、记忆方法等

---

## 新增一种类别时要改什么

假设你以后想新增这些类型之一：

- TypeScript
- YAML
- SQL
- Git 命令
- 正则表达式

通常需要改两处。

### 第一步：改 `prompts.js`
新增类别对象，例如：

```js
typescript: {
  label: "TypeScript 代码",
  prompt: `...`.trim(),
}
```

### 第二步：改 `server.js`
同步修改：

- 分类 prompt
- 分类结果到类别 key 的映射逻辑（例如 `mapCategory()`）

只改 `prompts.js` 不够。  
因为如果 `server.js` 的分类逻辑不知道这个新类别，它就不会自动路由到这里。

---

## 推荐测试样例

建议长期保留几组固定测试样例，每次改完提示词或分类逻辑都用它们回归测试。

### Linux 命令
```bash
grep -r "hello" .
ls -la
find . -name "*.ts"
```

### shell 符号
```bash
$PATH
>>
&&
```

### Python
```python
def add(a, b):
    return a + b
```

### C 语言
```c
#include <stdio.h>
int main() {
    printf("Hello");
    return 0;
}
```

### 技术文本
```text
The API returns a JSON response containing the user profile.
```

### 普通内容
```text
我下一条再继续问
```

这样做的好处是：

- 更容易看出哪一类回答变好了
- 更容易定位是哪次修改把某类效果改坏了

---

## 推荐维护习惯

### 1. 每次只改一点
不要一次重写全部提示词。  
小步修改更容易定位效果变化。

### 2. 改之前先备份
最简单的方式是：

- 先复制一份旧版 `prompts.js`
- 或者把将要修改的片段先保存起来

### 3. 改完立刻测试
不要等很多天后才发现某个类别已经坏掉了。

### 4. 记录变更
你可以在 README 末尾写简单维护记录，或者单独新建 `CHANGELOG.md`。

例如：

```text
2026-03-20
- Linux prompt 增加“记忆方法”
- 输出前缀改成“识别类别 + AI讲解”
- Keyboard Maestro 每次发送前自动新建话题
```

---

## 常见故障排查

### 1. Cherry Studio 发消息后没有回答
先检查：

- Router 是否已经启动
- `.env` 是否填写正确
- Cherry Studio 的 Provider 是否指向 `http://127.0.0.1:8787/v1`
- Cherry Studio 当前配置的模型是否正确

### 2. 识别类别没有显示
检查 `server.js` 是否保留了输出前缀逻辑，例如：

```text
识别类别：xxx

AI讲解：
```

### 3. 每次都继承上次上下文
检查 Keyboard Maestro 宏里是否在发送前执行了“新建话题”动作。

### 4. 按快捷键后 Cherry Studio 打开了，但没有粘贴成功
常见原因：

- Pause 太短
- 输入框没有拿到焦点
- Keyboard Maestro 辅助功能权限没有给
- 宏动作顺序与当前界面状态不匹配

### 5. 修改 `prompts.js` 后没有生效
通常是因为改完后没有重启 Router。

### 6. 导入 Keyboard Maestro 宏后运行不稳定
常见原因：

- 本机快捷键冲突
- 应用名称或窗口切换逻辑不同
- 屏幕分辨率 / 缩放导致点击步骤失效
- Pause 时间不适合当前机器性能

---

## 最简单的维护流程

### 场景 A：只改提示词
1. 打开 `prompts.js`
2. 修改对应类别的 `prompt`
3. 保存
4. 重启 Router
5. 用固定测试样例测试

### 场景 B：新增一种类别
1. 在 `prompts.js` 中新增类别对象
2. 在 `server.js` 中补上分类逻辑和映射
3. 保存
4. 重启 Router
5. 测试新类别是否成功命中

### 场景 C：改启动体验
1. 打开 Keyboard Maestro
2. 调整宏动作顺序 / 快捷键 / Pause
3. 测试复制、打开、粘贴、发送是否稳定

---

## 一句话记住这套系统

- **Keyboard Maestro 决定怎么启动**
- **Cherry Studio 决定怎么聊天**
- **Router 决定 AI 怎么分流和回答**

维护时先判断问题属于哪一层，再去改对应位置，不要一上来把所有地方都一起改。