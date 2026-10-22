# Changelog


## Unreleased

### ✨ Features

- **wx:** 补齐草稿写回端点 `draft/update`、`draft/get`、`draft/delete`、`draft/batchget`，微信接口覆盖范围从 3 个扩展到 7 个
- **wx:** `draft/add` 与 `draft/update` 支持 `Idempotency-Key` 幂等去重，重复提交不会再次写入公众号草稿箱

### 📝 Documentation

- **docs:** 更新公开微信接口覆盖范围与幂等语义说明
- **docs:** 补充 MIT 许可证声明

## v0.2.2

[compare changes](https://github.com/k7airos/bun-wx-server/compare/v0.2.1...v0.2.2)

### 📦 Build

- **deploy:** Upload source and retry healthcheck ([e13fa90](https://github.com/k7airos/bun-wx-server/commit/e13fa90))

### ❤️ Contributors

- Aatrox <gnakzz@qq.com>

## v0.2.1


### 📦 Build

- **release:** Align version scripts and commit prefixes ([3924b43](https://github.com/k7airos/bun-wx-server/commit/3924b43))
- **release:** Add production deploy workflow ([28de75d](https://github.com/k7airos/bun-wx-server/commit/28de75d))

### ❤️ Contributors

- Aatrox <gnakzz@qq.com>

