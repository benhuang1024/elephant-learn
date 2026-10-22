# project/

把 14 章第 1 步（本地引导）生成的三个文件放在这里，Dockerfile 只会用到它们：

```
project/
├── composer.json
├── composer.lock
└── app/etc/config.php      # 已执行 app:config:dump scopes themes i18n
```

这三个文件应该提交到 Git，相当于 Magento 项目的“设计图”。**不要**把 `app/etc/env.php` 放进来：它包含数据库密码和加密密钥，在 K8s 里通过 Secret 挂载。
