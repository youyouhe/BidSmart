# 🐛 BackupManager 调试指南

## 问题描述
点击 Clock 图标（查看备份历史）按钮时没有反应。

## 已添加的调试日志

### 1. App.tsx - Clock 按钮点击事件 (line ~1390)
```javascript
onClick={() => {
  console.log('Clock button clicked, currentDocumentId:', currentDocumentId);
  console.log('showBackupManager before:', showBackupManager);
  setShowBackupManager(true);
  console.log('showBackupManager set to true');
}}
```

### 2. BackupManager.tsx - useEffect (line ~34)
```javascript
useEffect(() => {
  console.log('[BackupManager] useEffect triggered:', { isOpen, documentId });
  if (isOpen && documentId) {
    console.log('[BackupManager] Loading backups for:', documentId);
    loadBackups();
  }
}, [isOpen, documentId]);
```

### 3. BackupManager.tsx - 渲染检查 (line ~124)
```javascript
if (!isOpen) {
  console.log('[BackupManager] Modal not open, returning null');
  return null;
}

console.log('[BackupManager] Rendering modal, isOpen:', isOpen, 'documentId:', documentId);
```

---

## 🧪 测试步骤

### 步骤 1: 启动应用
```bash
npm run dev
```

### 步骤 2: 打开浏览器开发者工具
按 `F12` 打开 DevTools，切换到 **Console** 标签

### 步骤 3: 打开文档
1. 在文档库中选择一个文档
2. 等待文档加载完成

### 步骤 4: 点击 Clock 按钮
1. 找到右上角的 Clock 图标按钮（⏰）
2. 点击按钮
3. **观察控制台输出**

---

## 📊 预期的日志输出

### 正常情况（应该看到）：
```
Clock button clicked, currentDocumentId: a3d4061a-ab2f-4c09-8ba1-25e89920ab01
showBackupManager before: false
showBackupManager set to true
[BackupManager] useEffect triggered: { isOpen: true, documentId: 'a3d4061a-...' }
[BackupManager] Loading backups for: a3d4061a-ab2f-4c09-8ba1-25e89920ab01
[BackupManager] Rendering modal, isOpen: true, documentId: a3d4061a-ab2f-4c09-8ba1-25e89920ab01
```

### 异常情况 1: 按钮点击无响应
如果控制台**没有任何输出**，说明：
- 按钮的 `onClick` 事件没有绑定
- 按钮被其他元素遮挡（z-index 问题）
- React 事件系统出现问题

### 异常情况 2: currentDocumentId 为空
```
Clock button clicked, currentDocumentId: undefined
```
说明：
- 文档没有正确加载
- `currentDocumentId` state 没有正确设置

### 异常情况 3: BackupManager 不渲染
如果看到按钮日志但没有看到 `[BackupManager]` 日志，说明：
- `BackupManager` 组件的条件 `currentDocumentId &&` 失败
- React 组件渲染出现问题

### 异常情况 4: Modal 被 `isOpen` 过滤
```
[BackupManager] Modal not open, returning null
```
说明：
- `showBackupManager` state 更新失败
- React state 更新没有触发重渲染

---

## 🔍 额外调试

如果上述日志无法定位问题，请检查：

### 1. Network 标签
查看是否有 API 请求：
```
GET /api/documents/{doc_id}/audit/backups
```

### 2. React DevTools
安装 React DevTools 扩展，检查：
- `App` 组件的 `showBackupManager` state
- `BackupManager` 组件的 props

### 3. Elements 标签
检查 DOM 结构：
- Clock 按钮是否存在
- BackupManager modal 的 DOM 是否被创建

---

## 🐛 可能的问题和解决方案

### 问题 1: z-index 被覆盖
**症状**: 按钮可见但点击无效  
**检查**: 用 Elements 工具查看按钮是否被其他元素遮挡  
**解决**: 调整 z-index 或检查 CSS

### 问题 2: currentDocumentId 为空
**症状**: 按钮可点击但 BackupManager 不渲染  
**原因**: Line 1279 的条件 `{currentDocumentId && (...)}` 失败  
**解决**: 检查文档加载逻辑，确保 `currentDocumentId` 被正确设置

### 问题 3: State 更新失败
**症状**: 点击按钮后 `showBackupManager` 保持 false  
**原因**: React state 批量更新或异步问题  
**解决**: 使用函数式 setState: `setShowBackupManager(prev => true)`

### 问题 4: Modal 样式问题
**症状**: Modal 被创建但不可见  
**原因**: CSS 样式或 z-index 问题  
**解决**: 检查 `fixed inset-0 z-50` 等样式

---

## 📝 测试后报告格式

请将控制台的输出复制粘贴，格式如下：

```
点击 Clock 按钮后的控制台输出：
------------------------------------------
[复制所有相关日志]
------------------------------------------

观察到的现象：
1. 按钮是否高亮/响应？
2. 弹窗是否出现？
3. 是否有错误信息？
```

---

## ✅ 清理调试代码

测试完成后，可以移除这些 console.log 语句。

---

**最后更新**: 2026-02-07
