# 第三方组件与版权声明（Third-Party Notices）

本项目 **大了么 (DALEME)** 的整体代码与原创内容采用 **CC BY-NC-SA 4.0** 许可
（见根目录 `LICENSE`）。但仓库内**捆绑的健身动作数据集与媒体文件并不属于本项目的授权范围**，
它们各自受独立的许可约束。请在使用、分发或部署本项目（尤其是公开或商业用途）前，
阅读并遵守以下条款。

---

## 1. 动作数据集（文本 / 数据）

- 来源：`https://github.com/hasaneyldrm/exercises-dataset`
- 作者：Hasan Emir Yıldırım
- 许可：**MIT License**（仅覆盖数据文本、分类、说明文字、工具与结构）
- 许可文本：`assets/exercises/LICENSE.txt`

MIT 许可允许自由使用、修改、分发，包括商用，但须保留原作者版权声明与许可声明。
**注意**：MIT 仅覆盖「文本数据」，并不覆盖下方的 GIF / 缩略图媒体，请见第 2 节。

---

## 2. 动作媒体（GIF 动画 / 缩略图）

- 版权方：**© Gym visual** — https://gymvisual.com/
- 分发方式：经版权方授权，以 **180×180** 分辨率随数据集分发
- 使用条款：https://gymvisual.com/content/3-terms-and-conditions-of-use
- 署名要求：每次使用均须保留 `© Gym visual — https://gymvisual.com/` 署名
  （本项目已在动作库与详情页保留该署名）

⚠️ **重要**：Gym visual 的媒体采用**付费买断（N-CRFL）**模式。本项目作者**并未购买**
商业买断授权，这些 GIF 仅随本项目**自用**分发。克隆本仓库**不等于**获得媒体授权：

- 任何人若要在自己的项目中使用这些 GIF，**必须自行向 Gym visual 取得授权**；
- 任何**商业用途**前，请先阅读 Gym visual 使用条款并取得相应许可；
- 本项目（CC BY-NC-SA 4.0）**不授予你对媒体文件的任何权利**，超出 Gym visual
  条款允许范围的使用均不被许可。

详细署名与使用限制见 `assets/exercises/NOTICE.md`。

---

## 3. 许可层级总览

| 内容 | 许可 | 是否允许商用 | 说明 |
|---|---|---|---|
| 大了么 项目代码 / UI / 原创内容 | CC BY-NC-SA 4.0 | ❌ 禁止 | 根目录 `LICENSE` |
| 动作数据集（文本/数据） | MIT | ✅ 允许（须署名） | `assets/exercises/LICENSE.txt` |
| 动作媒体（GIF/缩略图） | © Gym visual（需单独授权） | ⚠️ 需另行取得授权 | `assets/exercises/NOTICE.md` |

---

## 4. 合规建议

- **个人 / 非商业使用**：可直接使用本项目，保留各组件署名即可。
- **公开部署 / 商业用途**：
  1. 项目的 CC BY-NC-SA 4.0 已禁止商用，如需商用请联系作者取得单独授权；
  2. 动作 GIF 媒体须另行向 Gym visual 取得授权，否则应移除 `assets/exercises/videos/`
     与 `assets/exercises/images/` 中的媒体文件，仅保留 MIT 许可的文本数据。
- 本项目已通过 `.gitignore` 排除 `.workbuddy/` 等本地目录，仓库不包含任何不应公开的本地数据。
